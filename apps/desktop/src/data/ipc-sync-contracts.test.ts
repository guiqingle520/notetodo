// @vitest-environment node
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { syncIpcContracts } = require('../../electron/ipc-sync-contracts.cjs') as {
  syncIpcContracts: Record<'loadDocument' | 'appendUpdate' | 'compactDocument', IpcContract>
}

const firstUpdate = Buffer.from('first update').toString('base64')
const secondUpdate = Buffer.from('second update').toString('base64')
const snapshot = Buffer.from('document snapshot').toString('base64')

describe('sync IPC contracts', () => {
  it('accepts ordered updates and a bounded latest cursor', () => {
    expect(() =>
      syncIpcContracts.loadDocument.assertResponse({
        snapshot,
        updates: [
          { id: 4, clientId: 'client-a', data: firstUpdate },
          { id: 7, clientId: 'client-b', data: secondUpdate },
        ],
        latestUpdateId: 7,
      }),
    ).not.toThrow()
  })

  it('rejects malformed Base64 updates before they reach SQLite', () => {
    expect(() =>
      syncIpcContracts.appendUpdate.assertRequest(['page-1', 'client-1', 'not base64']),
    ).toThrow(/sync update/)
    expect(() =>
      syncIpcContracts.appendUpdate.assertRequest(['page-1', 'client-1', firstUpdate]),
    ).not.toThrow()
  })

  it('rejects negative compaction cursors and non-void mutation responses', () => {
    expect(() => syncIpcContracts.compactDocument.assertRequest(['page-1', snapshot, -1])).toThrow(
      /compaction cursor/,
    )
    expect(() => syncIpcContracts.compactDocument.assertResponse(true)).toThrow(
      /unexpected response/,
    )
  })

  it('rejects duplicate, unordered, or out-of-range update cursors', () => {
    expect(() =>
      syncIpcContracts.loadDocument.assertResponse({
        snapshot: null,
        updates: [
          { id: 5, clientId: 'client-a', data: firstUpdate },
          { id: 5, clientId: 'client-b', data: secondUpdate },
        ],
        latestUpdateId: 5,
      }),
    ).toThrow(/ordered and bounded/)
  })
})
