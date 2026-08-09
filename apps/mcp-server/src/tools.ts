import { randomUUID } from 'node:crypto'
import type { ApiScope } from '@notetodo/auth-core'
import { z } from 'zod/v4'

const pageId = z.string().regex(/^[A-Za-z0-9-]{1,128}$/u)
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum)
const jsonValue = z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(z.unknown()), z.record(z.string(), z.unknown())])

export const workspaceToolDefinitions = {
  notetodo_list_pages: {
    title: '列出 NoteTodo 页面',
    description: '列出或搜索当前工作区的未归档页面。返回页面元数据和短摘要，不返回完整正文。',
    scope: 'pages:read',
    inputSchema: z.object({ query: z.string().trim().max(500).optional(), limit: z.number().int().min(1).max(100).default(30) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  notetodo_get_page: {
    title: '读取 NoteTodo 页面',
    description: '按页面 ID 读取标题、层级和正文。正文默认最多返回 50000 字符，可在参数中降低或提高上限。',
    scope: 'pages:read',
    inputSchema: z.object({ pageId, maxChars: z.number().int().min(1_000).max(200_000).default(50_000) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  notetodo_create_page: {
    title: '创建 NoteTodo 页面',
    description: '在当前工作区创建页面；可指定父页面和 HTML 正文。',
    scope: 'pages:write',
    inputSchema: z.object({ title: boundedText(1_000), parentId: pageId.nullable().optional(), content: z.string().max(5_000_000).default('<p></p>') }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  notetodo_update_page: {
    title: '更新 NoteTodo 页面',
    description: '按页面 ID 更新标题或 HTML 正文。不会删除页面。',
    scope: 'pages:write',
    inputSchema: z.object({ pageId, title: boundedText(1_000).optional(), content: z.string().max(5_000_000).optional() }).refine((value) => value.title !== undefined || value.content !== undefined, 'title or content is required'),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  notetodo_get_database: {
    title: '读取 NoteTodo 数据库',
    description: '读取页面内联数据库的 Schema、视图和有限数量的记录。',
    scope: 'databases:read',
    inputSchema: z.object({ pageId, recordLimit: z.number().int().min(1).max(200).default(100) }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  notetodo_update_database_cell: {
    title: '更新 NoteTodo 数据库单元格',
    description: '写入一条数据库记录的指定属性；类型、关联目标和派生字段限制由工作区强制校验。',
    scope: 'databases:write',
    inputSchema: z.object({ recordId: pageId, propertyId: pageId, value: jsonValue }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
} as const satisfies Record<string, { title: string; description: string; scope: ApiScope; inputSchema: z.ZodType; annotations: Record<string, boolean> }>

export type WorkspaceToolName = keyof typeof workspaceToolDefinitions
type Page = { id: string; title: string; icon: string; parentId: string | null; favorite?: boolean; content: string; updatedAt: string; lastVisitedAt: string; archivedAt: string | null }
type Identity = { id: string; name: string; scopes: ApiScope[] }

export interface WorkspaceToolRepository {
  authenticateApiToken(rawToken: string, scope: ApiScope): Identity | null
  loadWorkspace(): { pages: Page[]; activePageId: string }
  searchPages(query: string, limit?: number): Page[]
  upsertPage(page: Page): Page
  loadDatabaseByPage(pageId: string): unknown | null
  updateDatabaseCell(recordId: string, propertyId: string, value: unknown): unknown
  recordApiAudit(entry: { requestId: string; tokenId: string | null; method: string; path: string; status: number; durationMs: number }): void
}

export class WorkspaceToolError extends Error {
  constructor(readonly code: 'invalid_token' | 'invalid_arguments' | 'not_found' | 'internal_error', message: string) { super(message) }
}

/**
 * Executes a workspace operation without depending on an MCP transport. Keeping
 * authorization and audit here prevents future HTTP transports from bypassing
 * the same security boundary used by stdio.
 */
export async function executeWorkspaceTool(repository: WorkspaceToolRepository, rawToken: string, name: WorkspaceToolName, input: unknown) {
  const startedAt = performance.now(); const requestId = randomUUID(); let tokenId: string | null = null; let status = 500
  try {
    const definition = workspaceToolDefinitions[name]
    if (!definition) throw new WorkspaceToolError('not_found', 'Unknown workspace tool.')
    const identity = repository.authenticateApiToken(rawToken, definition.scope)
    if (!identity) { status = 401; throw new WorkspaceToolError('invalid_token', `API token requires ${definition.scope}.`) }
    tokenId = identity.id
    const parsed = definition.inputSchema.safeParse(input)
    if (!parsed.success) { status = 400; throw new WorkspaceToolError('invalid_arguments', parsed.error.issues.map((issue) => issue.message).join('; ')) }
    const result = runTool(repository, name, parsed.data as Record<string, unknown>)
    status = 200
    return { requestId, data: result }
  } catch (error) {
    if (error instanceof WorkspaceToolError) {
      status = error.code === 'invalid_token' ? 401 : error.code === 'invalid_arguments' ? 400 : error.code === 'not_found' ? 404 : 500
      throw error
    }
    status = 500
    throw new WorkspaceToolError('internal_error', error instanceof Error ? error.message : 'Workspace tool failed.')
  } finally {
    try { repository.recordApiAudit({ requestId, tokenId, method: 'CALL', path: `mcp://tools/${name}`.slice(0, 2048), status, durationMs: performance.now() - startedAt }) } catch { /* tool result remains authoritative */ }
  }
}

function runTool(repository: WorkspaceToolRepository, name: WorkspaceToolName, input: Record<string, unknown>) {
  if (name === 'notetodo_list_pages') {
    const limit = input.limit as number; const query = input.query as string | undefined
    const pages = query ? repository.searchPages(query, limit) : repository.loadWorkspace().pages.filter((page) => !page.archivedAt).slice(0, limit)
    return { pages: pages.map(({ content, ...page }) => ({ ...page, excerpt: plainText(content).slice(0, 240) })), count: pages.length }
  }
  if (name === 'notetodo_get_page') {
    const page = activePage(repository, input.pageId as string); const maxChars = input.maxChars as number
    return { page: { ...page, content: page.content.slice(0, maxChars) }, truncated: page.content.length > maxChars }
  }
  if (name === 'notetodo_create_page') {
    const now = new Date().toISOString()
    const page: Page = { id: randomUUID(), title: input.title as string, icon: 'note', parentId: (input.parentId as string | null | undefined) ?? null, favorite: false, content: input.content as string, updatedAt: now, lastVisitedAt: now, archivedAt: null }
    if (page.parentId) activePage(repository, page.parentId)
    const saved = repository.upsertPage(page)
    return { page: { id: saved.id, title: saved.title, icon: saved.icon, parentId: saved.parentId, favorite: saved.favorite, updatedAt: saved.updatedAt, lastVisitedAt: saved.lastVisitedAt, archivedAt: saved.archivedAt } }
  }
  if (name === 'notetodo_update_page') {
    const existing = activePage(repository, input.pageId as string); const now = new Date().toISOString()
    const saved = repository.upsertPage({ ...existing, ...(input.title !== undefined ? { title: input.title as string } : {}), ...(input.content !== undefined ? { content: input.content as string } : {}), updatedAt: now })
    return { page: { id: saved.id, title: saved.title, updatedAt: saved.updatedAt } }
  }
  if (name === 'notetodo_get_database') {
    const snapshot = repository.loadDatabaseByPage(input.pageId as string)
    if (!snapshot) throw new WorkspaceToolError('not_found', 'Database does not exist for this page.')
    return { database: limitDatabaseRecords(snapshot, input.recordLimit as number) }
  }
  repository.updateDatabaseCell(input.recordId as string, input.propertyId as string, input.value)
  return { recordId: input.recordId, propertyId: input.propertyId, value: input.value }
}

function activePage(repository: WorkspaceToolRepository, id: string) {
  const page = repository.loadWorkspace().pages.find((candidate) => candidate.id === id && !candidate.archivedAt)
  if (!page) throw new WorkspaceToolError('not_found', 'Page does not exist.')
  return page
}

function limitDatabaseRecords(snapshot: unknown, limit: number) {
  if (!snapshot || typeof snapshot !== 'object' || !('records' in snapshot) || !Array.isArray(snapshot.records)) return snapshot
  return { ...snapshot, records: snapshot.records.slice(0, limit), totalRecords: snapshot.records.length, recordsTruncated: snapshot.records.length > limit }
}

function plainText(html: string) { return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/&nbsp;/giu, ' ').replace(/&amp;/giu, '&').replace(/\s+/gu, ' ').trim() }
