// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerHistoryIpc } = require('../../electron/ipc-history-register.cjs') as {
  registerHistoryIpc(
    register: (
      channel: string,
      contract: unknown,
      listener: (...args: unknown[]) => unknown,
    ) => void,
    database: Record<string, (...args: unknown[]) => unknown>,
  ): void
}

describe('history IPC registration', () => {
  it('registers list, detail, and authorized restore handlers with contracts', () => {
    const channels: string[] = []
    const database = {
      listPageVersions: vi.fn(() => []),
      getPageVersion: vi.fn(() => null),
      getSetting: vi.fn(() => null),
      getPageRole: vi.fn(() => null),
      restorePageVersion: vi.fn(() => ({ id: 'page-1' })),
    }
    registerHistoryIpc((channel, contract) => {
      channels.push(channel)
      expect(contract).toMatchObject({
        assertRequest: expect.any(Function),
        assertResponse: expect.any(Function),
      })
    }, database)
    expect(channels).toEqual(['history:list', 'history:get', 'history:restore'])
  })
})
