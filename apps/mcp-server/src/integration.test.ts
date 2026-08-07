import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { createNoteTodoMcpServer } from './server.js'
import type { WorkspaceToolRepository } from './tools.js'

type Database = WorkspaceToolRepository & {
  issueApiToken(name: string, scopes: string[]): { rawToken: string }
  listApiAudit(limit?: number): Array<{ path: string; status: number }>
  close(): void
}

const require = createRequire(import.meta.url)
const modulePath = resolve(fileURLToPath(new URL('../../desktop/electron/workspace-db.cjs', import.meta.url)))
const { WorkspaceDatabase } = require(modulePath) as { WorkspaceDatabase: new (path: string) => Database }
let database: Database | undefined
let temporaryDirectory: string | undefined
afterEach(() => { database?.close(); database = undefined; if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true }); temporaryDirectory = undefined })

describe('MCP and SQLite integration', () => {
  it('discovers, reads and writes the seeded workspace over MCP', async () => {
    database = new WorkspaceDatabase(':memory:')
    const token = database.issueApiToken('MCP integration', ['pages:read', 'pages:write', 'databases:read', 'databases:write'])
    const server = createNoteTodoMcpServer(database, token.rawToken)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    const client = new Client({ name: 'integration-client', version: '1.0.0' })
    await client.connect(clientTransport)

    const pages = await client.callTool({ name: 'notetodo_list_pages', arguments: { query: '产品路线' } })
    expect(JSON.stringify(pages.structuredContent)).toContain('projects')
    const created = await client.callTool({ name: 'notetodo_create_page', arguments: { title: '由 MCP 创建', parentId: 'projects', content: '<p>闭环完成</p>' } })
    expect(created.isError).not.toBe(true)
    const cell = await client.callTool({ name: 'notetodo_update_database_cell', arguments: { recordId: 'task-4', propertyId: 'task-score', value: 3 } })
    expect(cell.isError).not.toBe(true)
    expect(database.loadDatabaseByPage('projects')).toMatchObject({ records: expect.arrayContaining([expect.objectContaining({ id: 'task-4', values: expect.objectContaining({ 'task-score': 3 }) })]) })
    expect(database.listApiAudit(10).filter((entry) => entry.path.startsWith('mcp://tools/'))).toHaveLength(3)

    await client.close(); await server.close()
  })

  it('keeps stdout protocol-clean in the real stdio entrypoint', async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'notetodo-mcp-'))
    const databasePath = join(temporaryDirectory, 'workspace.db')
    database = new WorkspaceDatabase(databasePath)
    const token = database.issueApiToken('stdio integration', ['pages:read'])
    database.close(); database = undefined
    const tsxCli = resolve(fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url)))
    const entrypoint = resolve(fileURLToPath(new URL('./index.ts', import.meta.url)))
    const transport = new StdioClientTransport({ command: process.execPath, args: [tsxCli, entrypoint], env: { ...getDefaultEnvironment(), NOTETODO_DATABASE_PATH: databasePath, NOTETODO_API_TOKEN: token.rawToken }, stderr: 'pipe' })
    const client = new Client({ name: 'stdio-integration', version: '1.0.0' })
    await client.connect(transport)
    const tools = await client.listTools()
    expect(tools.tools).toHaveLength(6)
    const result = await client.callTool({ name: 'notetodo_get_page', arguments: { pageId: 'welcome' } })
    if (result.isError) throw new Error(JSON.stringify(result))
    expect(result.isError).not.toBe(true)
    expect(JSON.stringify(result.structuredContent)).toContain('从这里开始')
    await client.close()
  })
})
