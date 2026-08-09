import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { ApiScope } from '@notetodo/auth-core'

const MAX_BODY_BYTES = 1024 * 1024

export interface PlatformRepository {
  authenticateApiToken(rawToken: string, scope: ApiScope): null | { id: string; name: string; scopes: ApiScope[] }
  loadWorkspace(): { pages: PlatformPage[]; activePageId: string }
  upsertPage(page: PlatformPage): PlatformPage
  loadDatabaseByPage(pageId: string): unknown | null
  updateDatabaseCell(recordId: string, propertyId: string, value: unknown): void
  recordApiAudit(entry: { requestId: string; tokenId: string | null; method: string; path: string; status: number; durationMs: number }): void
}

export interface PlatformPage {
  id: string
  title: string
  icon: 'spark' | 'note' | 'check' | 'grid' | 'book'
  parentId: string | null
  favorite?: boolean
  content: string
  updatedAt: string
  lastVisitedAt: string
  archivedAt: string | null
}

class RequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}

/** Fixed-window limiter bounds accidental loops without adding external state. */
export class ApiRateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>()
  constructor(private readonly limit = 120, private readonly windowMs = 60_000) {}
  consume(key: string, now = Date.now()) {
    const current = this.windows.get(key)
    if (!current || now - current.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: now, count: 1 })
      return true
    }
    current.count += 1
    return current.count <= this.limit
  }
}

export function createPlatformApiServer(repository: PlatformRepository, options: { rateLimit?: number } = {}): Server {
  const limiter = new ApiRateLimiter(options.rateLimit)
  return createServer((request, response) => {
    void (async () => {
    const startedAt = performance.now()
    const requestId = normalizeRequestId(request.headers['x-request-id'])
    let tokenId: string | null = null
    let status = 500
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/v1/health' && request.method === 'GET') {
        status = 200
        return sendJson(response, status, { service: 'notetodo-platform-api', status: 'ok', requestId })
      }

      const route = matchRoute(request.method ?? 'GET', url.pathname)
      if (!route) throw new RequestError(404, 'route_not_found', 'The requested API route does not exist.')
      const rawToken = bearerToken(request)
      const identity = repository.authenticateApiToken(rawToken, route.scope)
      if (!identity) throw new RequestError(401, 'invalid_token', 'The API token is invalid or lacks the required scope.')
      tokenId = identity.id
      if (!limiter.consume(identity.id)) throw new RequestError(429, 'rate_limited', 'Too many requests. Retry after the current minute window.')

      const result = await route.handle(repository, request, route.params)
      status = result.status
      sendJson(response, status, { ...result.body, requestId })
    } catch (error) {
      const failure = error instanceof RequestError ? error : new RequestError(500, 'internal_error', 'The request could not be completed.')
      status = failure.status
      sendJson(response, status, { error: { code: failure.code, message: failure.message }, requestId })
    } finally {
      // An audit storage failure must never rewrite a response that was already
      // sent; production observability can alert on the repository error.
      try { repository.recordApiAudit({ requestId, tokenId, method: request.method ?? 'GET', path: (request.url ?? '/').slice(0, 2048), status, durationMs: performance.now() - startedAt }) } catch { /* response is authoritative */ }
    }
    })()
  })
}

type Route = { scope: ApiScope; params: Record<string, string>; handle: (repository: PlatformRepository, request: IncomingMessage, params: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown> }> }

function matchRoute(method: string, path: string): Route | null {
  if (method === 'GET' && path === '/v1/pages') return { scope: 'pages:read', params: {}, handle: listPages }
  if (method === 'POST' && path === '/v1/pages') return { scope: 'pages:write', params: {}, handle: createPage }
  const page = /^\/v1\/pages\/([A-Za-z0-9-]{1,128})$/u.exec(path)
  if (page && method === 'GET') return { scope: 'pages:read', params: { pageId: page[1]! }, handle: getPage }
  if (page && method === 'PATCH') return { scope: 'pages:write', params: { pageId: page[1]! }, handle: updatePage }
  const database = /^\/v1\/databases\/by-page\/([A-Za-z0-9-]{1,128})$/u.exec(path)
  if (database && method === 'GET') return { scope: 'databases:read', params: { pageId: database[1]! }, handle: getDatabase }
  const cell = /^\/v1\/databases\/records\/([A-Za-z0-9-]{1,128})\/properties\/([A-Za-z0-9-]{1,128})$/u.exec(path)
  if (cell && method === 'PATCH') return { scope: 'databases:write', params: { recordId: cell[1]!, propertyId: cell[2]! }, handle: updateCell }
  return null
}

async function listPages(repository: PlatformRepository) {
  const pages = repository.loadWorkspace().pages.filter((page) => !page.archivedAt).map(({ content: _content, ...page }) => page)
  return { status: 200, body: { data: pages } }
}

async function getPage(repository: PlatformRepository, _request: IncomingMessage, params: Record<string, string>) {
  const page = repository.loadWorkspace().pages.find((candidate) => candidate.id === params.pageId && !candidate.archivedAt)
  if (!page) throw new RequestError(404, 'page_not_found', 'Page does not exist.')
  return { status: 200, body: { data: page } }
}

async function createPage(repository: PlatformRepository, request: IncomingMessage) {
  const body = await readJsonBody(request)
  const title = requiredString(body.title, 'title', 1000)
  const now = new Date().toISOString()
  const page: PlatformPage = { id: randomUUID(), title, icon: validIcon(body.icon), parentId: optionalId(body.parentId), favorite: false, content: optionalString(body.content, 5_000_000) ?? '<p></p>', updatedAt: now, lastVisitedAt: now, archivedAt: null }
  return { status: 201, body: { data: repository.upsertPage(page) } }
}

async function updatePage(repository: PlatformRepository, request: IncomingMessage, params: Record<string, string>) {
  const existing = repository.loadWorkspace().pages.find((candidate) => candidate.id === params.pageId && !candidate.archivedAt)
  if (!existing) throw new RequestError(404, 'page_not_found', 'Page does not exist.')
  const body = await readJsonBody(request)
  const page = { ...existing, ...(body.title !== undefined ? { title: requiredString(body.title, 'title', 1000) } : {}), ...(body.content !== undefined ? { content: requiredString(body.content, 'content', 5_000_000) } : {}), updatedAt: new Date().toISOString() }
  return { status: 200, body: { data: repository.upsertPage(page) } }
}

async function getDatabase(repository: PlatformRepository, _request: IncomingMessage, params: Record<string, string>) {
  const database = repository.loadDatabaseByPage(params.pageId!)
  if (!database) throw new RequestError(404, 'database_not_found', 'Database does not exist for this page.')
  return { status: 200, body: { data: database } }
}

async function updateCell(repository: PlatformRepository, request: IncomingMessage, params: Record<string, string>) {
  const body = await readJsonBody(request)
  if (!Object.hasOwn(body, 'value')) throw new RequestError(400, 'missing_value', 'Request body must contain value.')
  repository.updateDatabaseCell(params.recordId!, params.propertyId!, body.value)
  return { status: 200, body: { data: { recordId: params.recordId, propertyId: params.propertyId, value: body.value } } }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw new RequestError(415, 'unsupported_media_type', 'Content-Type must be application/json.')
  const chunks: Buffer[] = []; let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new RequestError(413, 'body_too_large', 'JSON body exceeds 1 MiB.')
    chunks.push(buffer)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
    return value as Record<string, unknown>
  } catch { throw new RequestError(400, 'invalid_json', 'Request body must be a JSON object.') }
}

function bearerToken(request: IncomingMessage) {
  const match = /^Bearer ([^\s]{20,500})$/u.exec(String(request.headers.authorization ?? ''))
  if (!match) throw new RequestError(401, 'missing_token', 'Authorization must use a Bearer API token.')
  return match[1]!
}

function requiredString(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new RequestError(400, 'invalid_field', `${field} must contain 1 to ${maximum} characters.`)
  return value
}
function optionalString(value: unknown, maximum: number) { if (value === undefined || value === null) return null; return requiredString(value, 'content', maximum) }
function optionalId(value: unknown) { if (value === undefined || value === null) return null; if (typeof value !== 'string' || !/^[A-Za-z0-9-]{1,128}$/u.test(value)) throw new RequestError(400, 'invalid_field', 'parentId is invalid.'); return value }
function validIcon(value: unknown): PlatformPage['icon'] { return ['spark', 'note', 'check', 'grid', 'book'].includes(String(value)) ? value as PlatformPage['icon'] : 'note' }
function normalizeRequestId(value: string | string[] | undefined) { const candidate = Array.isArray(value) ? value[0] : value; return candidate && /^[A-Za-z0-9._-]{1,128}$/u.test(candidate) ? candidate : randomUUID() }

function sendJson(response: ServerResponse, status: number, body: unknown) {
  if (response.headersSent) return
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(body))
}
