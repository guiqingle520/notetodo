// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerAutomationIpc } = require('../../electron/ipc-automation-register.cjs') as {
  registerAutomationIpc(
    register: (
      channel: string,
      contract: unknown,
      listener: (...args: unknown[]) => unknown,
    ) => void,
    database: Record<string, (...args: unknown[]) => unknown>,
  ): void
}

describe('automation IPC registration', () => {
  it('registers all automation channels with contracts and thin database adapters', () => {
    const registrations = new Map<
      string,
      { contract: unknown; listener: (...args: unknown[]) => unknown }
    >()
    const database = {
      listDatabaseAutomations: vi.fn(() => []),
      saveDatabaseAutomation: vi.fn((_databaseId, rule) => rule),
      setDatabaseAutomationEnabled: vi.fn(() => true),
      listAutomationRuns: vi.fn(() => []),
      replayAutomationRun: vi.fn(() => 'run-2'),
    }
    registerAutomationIpc((channel, contract, listener) => {
      registrations.set(channel, { contract, listener })
    }, database)

    expect([...registrations.keys()]).toEqual([
      'automations:list',
      'automations:save',
      'automations:set-enabled',
      'automations:list-runs',
      'automations:replay',
    ])
    const list = registrations.get('automations:list')
    expect(list?.contract).toMatchObject({
      assertRequest: expect.any(Function),
      assertResponse: expect.any(Function),
    })
    expect(list?.listener({}, 'database-1')).toEqual([])
    expect(database.listDatabaseAutomations).toHaveBeenCalledWith('database-1')
  })
})
