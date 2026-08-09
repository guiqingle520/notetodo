// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerImportIpc } = require('../../electron/ipc-import-register.cjs') as {
  registerImportIpc(options: Record<string, unknown>): unknown
}

describe('import IPC registration', () => {
  it('registers every import channel with a channel-specific contract', async () => {
    const handleTrusted = vi.fn()
    const onTrusted = vi.fn()
    const service = {
      pickAndInspect: vi.fn(async () => null),
      start: vi.fn(async () => ({ rootPageId: 'root' })),
      listJobs: vi.fn(() => []),
      cancel: vi.fn(),
    }

    expect(registerImportIpc({ handleTrusted, onTrusted, service })).toBe(service)
    expect(handleTrusted.mock.calls.map(([channel]) => channel)).toEqual([
      'import:pick-and-inspect',
      'import:start',
      'import:list-jobs',
    ])
    expect(onTrusted.mock.calls.map(([channel]) => channel)).toEqual(['import:cancel'])
    for (const [, contract] of [...handleTrusted.mock.calls, ...onTrusted.mock.calls]) {
      expect(contract).toMatchObject({ assertRequest: expect.any(Function) })
    }
    for (const [, contract] of handleTrusted.mock.calls) {
      expect(contract).toMatchObject({ assertResponse: expect.any(Function) })
    }

    const event = { sender: {} }
    await handleTrusted.mock.calls[0]?.[2](event)
    await handleTrusted.mock.calls[1]?.[2](event, 'import-1', 'request-1')
    handleTrusted.mock.calls[2]?.[2](event)
    onTrusted.mock.calls[0]?.[2](event, 'request-1')
    expect(service.pickAndInspect).toHaveBeenCalledOnce()
    expect(service.start).toHaveBeenCalledWith(event, 'import-1', 'request-1')
    expect(service.listJobs).toHaveBeenCalledOnce()
    expect(service.cancel).toHaveBeenCalledWith('request-1')
  })
})
