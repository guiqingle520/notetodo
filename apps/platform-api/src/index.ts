import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createPlatformApiServer, type PlatformRepository } from './server.js'

const databasePath = process.env.NOTETODO_DATABASE_PATH
if (!databasePath) throw new Error('NOTETODO_DATABASE_PATH is required.')
const port = Number(process.env.NOTETODO_API_PORT ?? 4790)
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('NOTETODO_API_PORT must be a valid TCP port.')

const require = createRequire(import.meta.url)
const modulePath = resolve(fileURLToPath(new URL('../../desktop/electron/workspace-db.cjs', import.meta.url)))
const { WorkspaceDatabase } = require(modulePath) as { WorkspaceDatabase: new (path: string) => PlatformRepository & { close(): void } }
const repository = new WorkspaceDatabase(resolve(databasePath))
const server = createPlatformApiServer(repository)

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'server.listening', service: 'platform-api', host: '127.0.0.1', port })}\n`)
})
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { repository.close(); process.exit(0) }))
