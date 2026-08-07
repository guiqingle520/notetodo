import { describe, expect, it } from 'vitest'
import { createApiToken, verifyApiToken, type ApiScope } from '@notetodo/auth-core'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { createNoteTodoMcpServer } from './server.js'
import { executeWorkspaceTool, WorkspaceToolError, type WorkspaceToolRepository } from './tools.js'

const fullToken = createApiToken(['pages:read', 'pages:write', 'databases:read', 'databases:write'])
const readToken = createApiToken(['pages:read'])
type Audit = { requestId: string; tokenId: string | null; method: string; path: string; status: number; durationMs: number }

class FakeRepository implements WorkspaceToolRepository {
  pages = [{ id: 'page-1', title: 'Roadmap', icon: 'note', parentId: null, favorite: false, content: '<h1>Roadmap</h1><p>Ship MCP safely</p>', updatedAt: '', lastVisitedAt: '', archivedAt: null }]
  audits: Audit[] = []
  cell: unknown = null
  authenticateApiToken(rawToken: string, scope: ApiScope) {
    for (const token of [fullToken, readToken]) if (verifyApiToken(rawToken, token, scope)) return { id: token.id, name: 'Test', scopes: token.scopes }
    return null
  }
  loadWorkspace() { return { pages: this.pages, activePageId: 'page-1' } }
  searchPages(query: string, limit = 30) { return this.pages.filter((page) => `${page.title} ${page.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, limit) }
  upsertPage(page: typeof this.pages[number]) { const index = this.pages.findIndex((candidate) => candidate.id === page.id); if (index < 0) this.pages.push(page); else this.pages[index] = page; return page }
  loadDatabaseByPage(pageId: string) { return pageId === 'page-1' ? { schema: { id: 'db-1' }, records: [{ id: 'one' }, { id: 'two' }] } : null }
  updateDatabaseCell(_recordId: string, _propertyId: string, value: unknown) { this.cell = value }
  recordApiAudit(entry: Audit) { this.audits.push(entry) }
}

describe('workspace MCP tools', () => {
  it('lists bounded page summaries and reads truncated page content', async () => {
    const repository = new FakeRepository()
    const list = await executeWorkspaceTool(repository, fullToken.rawToken, 'notetodo_list_pages', { query: 'MCP', limit: 10 })
    expect(list.data).toMatchObject({ count: 1, pages: [{ id: 'page-1', excerpt: 'Roadmap Ship MCP safely' }] })
    const page = await executeWorkspaceTool(repository, fullToken.rawToken, 'notetodo_get_page', { pageId: 'page-1', maxChars: 1_000 })
    expect(page.data).toMatchObject({ page: { title: 'Roadmap' }, truncated: false })
    expect(repository.audits.every((audit) => audit.status === 200 && audit.method === 'CALL')).toBe(true)
  })

  it('enforces per-tool scopes and audits rejected writes', async () => {
    const repository = new FakeRepository()
    await expect(executeWorkspaceTool(repository, readToken.rawToken, 'notetodo_update_page', { pageId: 'page-1', title: 'Blocked' })).rejects.toMatchObject({ code: 'invalid_token' } satisfies Partial<WorkspaceToolError>)
    expect(repository.pages[0]?.title).toBe('Roadmap')
    expect(repository.audits[0]).toMatchObject({ tokenId: null, status: 401, path: 'mcp://tools/notetodo_update_page' })
  })

  it('creates pages and applies database writes through the transport-independent executor', async () => {
    const repository = new FakeRepository()
    const created = await executeWorkspaceTool(repository, fullToken.rawToken, 'notetodo_create_page', { title: 'MCP child', parentId: 'page-1', content: '<p>Created</p>' })
    expect(created.data).toMatchObject({ page: { title: 'MCP child', parentId: 'page-1' } })
    await executeWorkspaceTool(repository, fullToken.rawToken, 'notetodo_update_database_cell', { recordId: 'record-1', propertyId: 'score', value: 3 })
    expect(repository.cell).toBe(3)
  })

  it('advertises and invokes tools through a real MCP in-memory connection', async () => {
    const repository = new FakeRepository()
    const server = createNoteTodoMcpServer(repository, fullToken.rawToken)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'notetodo-test', version: '1.0.0' })
    await client.connect(clientTransport)
    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['notetodo_list_pages', 'notetodo_update_database_cell']))
    const result = await client.callTool({ name: 'notetodo_get_page', arguments: { pageId: 'page-1' } })
    expect(result.isError).not.toBe(true)
    expect(JSON.stringify(result.structuredContent)).toContain('Roadmap')
    await client.close(); await server.close()
  })
})
