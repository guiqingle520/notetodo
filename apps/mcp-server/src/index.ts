import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createNoteTodoMcpServer } from './server.js'
import type { WorkspaceToolRepository } from './tools.js'

const databasePath = process.env.NOTETODO_DATABASE_PATH
const rawToken = process.env.NOTETODO_API_TOKEN
if (!databasePath) throw new Error('NOTETODO_DATABASE_PATH is required.')
if (!rawToken) throw new Error('NOTETODO_API_TOKEN is required.')

const require = createRequire(import.meta.url)
const modulePath = resolve(fileURLToPath(new URL('../../desktop/electron/workspace-db.cjs', import.meta.url)))
const { WorkspaceDatabase } = require(modulePath) as { WorkspaceDatabase: new (path: string) => WorkspaceToolRepository & { close(): void } }
const repository = new WorkspaceDatabase(resolve(databasePath))

let repositoryClosed = false
const closeRepository = () => { if (!repositoryClosed) { repositoryClosed = true; repository.close() } }
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { closeRepository(); process.exit(0) })
process.on('exit', closeRepository)

// stdout is exclusively owned by MCP framing. Operational messages go to stderr.
console.error('NoteTodo MCP Server ready on stdio.')
serveStdio(() => createNoteTodoMcpServer(repository, rawToken))
