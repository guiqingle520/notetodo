// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerDatabaseIpc } = require('../../electron/ipc-database-register.cjs') as {
  registerDatabaseIpc(options: Record<string, unknown>): void
}

describe('database IPC aggregate registration', () => {
  it('registers all 40 channels exactly once with request and response contracts', () => {
    const handleTrusted = vi.fn()
    registerDatabaseIpc({ handleTrusted, database: {}, exportCsv: vi.fn() })

    const channels = handleTrusted.mock.calls.map(([channel]) => channel as string)
    expect(channels).toHaveLength(40)
    expect(new Set(channels).size).toBe(40)
    expect(channels.every((channel) => channel.startsWith('database:'))).toBe(true)
    expect(channels).toEqual(
      expect.arrayContaining([
        'database:load-by-page',
        'database:update-cell',
        'database:list-record-history',
        'database:list-due-record-reminders',
        'database:update-view-config',
        'database:import-records',
        'database:export-csv',
      ]),
    )
    for (const [, contract, listener] of handleTrusted.mock.calls) {
      expect(contract).toMatchObject({
        assertRequest: expect.any(Function),
        assertResponse: expect.any(Function),
      })
      expect(listener).toEqual(expect.any(Function))
    }
  })
})
