// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerRetrievalIpc } = require('../../electron/ipc-retrieval-register.cjs') as {
  registerRetrievalIpc(
    register: (
      channel: string,
      contract: unknown,
      listener: (...args: unknown[]) => unknown,
    ) => void,
    database: Record<string, (...args: unknown[]) => unknown>,
  ): void
}

describe('retrieval IPC registration', () => {
  it('registers one contracted permission-filtered search adapter', () => {
    const register = vi.fn()
    registerRetrievalIpc(register, {
      getSetting: vi.fn(() => null),
      hybridSearch: vi.fn(() => []),
    })
    expect(register).toHaveBeenCalledOnce()
    expect(register.mock.calls[0]?.[0]).toBe('retrieval:search')
    expect(register.mock.calls[0]?.[1]).toMatchObject({
      assertRequest: expect.any(Function),
      assertResponse: expect.any(Function),
    })
  })
})
