import { afterEach, describe, expect, it } from 'vitest'
import { createApiToken, verifyApiToken, type ApiScope } from '@notetodo/auth-core'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createPlatformApiServer, type PlatformPage, type PlatformRepository } from './server.js'

const issued = createApiToken(['pages:read', 'pages:write', 'databases:read', 'databases:write'])
const readOnly = createApiToken(['pages:read'])

class FakeRepository implements PlatformRepository {
  pages: PlatformPage[] = [{ id: 'page-1', title: 'Roadmap', icon: 'note', parentId: null, content: '<p>Plan</p>', updatedAt: '', lastVisitedAt: '', archivedAt: null }]
  audits: Array<{ requestId: string; tokenId: string | null; method: string; path: string; status: number; durationMs: number }> = []
  cell: unknown = null
  authenticateApiToken(rawToken: string, scope: ApiScope) {
    for (const token of [issued, readOnly]) if (verifyApiToken(rawToken, token, scope)) return { id: token.id, name: 'Test', scopes: token.scopes }
    return null
  }
  loadWorkspace() { return { pages: this.pages, activePageId: 'page-1' } }
  upsertPage(page: PlatformPage) { const index = this.pages.findIndex((item) => item.id === page.id); if (index < 0) this.pages.push(page); else this.pages[index] = page; return page }
  loadDatabaseByPage(pageId: string) { return pageId === 'page-1' ? { id: 'db-1', records: [] } : null }
  updateDatabaseCell(_recordId: string, _propertyId: string, value: unknown) { this.cell = value }
  recordApiAudit(entry: typeof this.audits[number]) { this.audits.push(entry) }
}

let server: Server | undefined
afterEach(async () => { if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve())); server = undefined })

async function start(repository: PlatformRepository, rateLimit = 120) {
  server = createPlatformApiServer(repository, { rateLimit })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('platform REST API', () => {
  it('lists metadata without leaking page content and returns full page details separately', async () => {
    const repository = new FakeRepository(); const base = await start(repository)
    const list = await fetch(`${base}/v1/pages`, { headers: { authorization: `Bearer ${issued.rawToken}` } })
    expect(await list.json()).toMatchObject({ data: [{ id: 'page-1', title: 'Roadmap' }] })
    expect(JSON.stringify(await (await fetch(`${base}/v1/pages/page-1`, { headers: { authorization: `Bearer ${issued.rawToken}` } })).json())).toContain('<p>Plan</p>')
    expect(repository.audits).toHaveLength(2)
  })

  it('rejects writes when a valid token lacks the write scope', async () => {
    const base = await start(new FakeRepository())
    const response = await fetch(`${base}/v1/pages/page-1`, { method: 'PATCH', headers: { authorization: `Bearer ${readOnly.rawToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Changed' }) })
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_token' } })
  })

  it('creates pages and writes typed database values through scoped endpoints', async () => {
    const repository = new FakeRepository(); const base = await start(repository)
    const headers = { authorization: `Bearer ${issued.rawToken}`, 'content-type': 'application/json' }
    const created = await fetch(`${base}/v1/pages`, { method: 'POST', headers, body: JSON.stringify({ title: 'API page' }) })
    expect(created.status).toBe(201)
    expect(repository.pages.at(-1)?.title).toBe('API page')
    const cell = await fetch(`${base}/v1/databases/records/record-1/properties/score`, { method: 'PATCH', headers, body: JSON.stringify({ value: 3 }) })
    expect(cell.status).toBe(200)
    expect(repository.cell).toBe(3)
  })

  it('bounds request rates per token and returns stable error envelopes', async () => {
    const base = await start(new FakeRepository(), 1)
    const headers = { authorization: `Bearer ${issued.rawToken}` }
    expect((await fetch(`${base}/v1/pages`, { headers })).status).toBe(200)
    const limited = await fetch(`${base}/v1/pages`, { headers })
    expect(limited.status).toBe(429)
    expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' } })
  })
})
