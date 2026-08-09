// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { attachmentIpcContracts } = require('../../electron/ipc-attachment-contracts.cjs') as {
  attachmentIpcContracts: Record<
    'pickAndStore' | 'storeDropped' | 'storeMemory' | 'open' | 'export',
    IpcContract
  >
}

const hash = 'a'.repeat(64)
const attachment = {
  hash,
  size: 12,
  mimeType: 'image/png',
  displayName: '封面.png',
  url: `notetodo-asset://${hash}/%E5%B0%81%E9%9D%A2.png`,
  previewUrl: `notetodo-asset://${hash}/%E5%B0%81%E9%9D%A2.png?variant=thumbnail`,
}

describe('attachment IPC contracts', () => {
  it('accepts normalized content-addressed attachment responses', () => {
    expect(() => attachmentIpcContracts.pickAndStore.assertResponse([attachment])).not.toThrow()
  })

  it('rejects path traversal names and relative dropped paths', () => {
    expect(() => attachmentIpcContracts.open.assertRequest([hash, '../secret.txt'])).toThrow(
      /display name/,
    )
    expect(() =>
      attachmentIpcContracts.storeDropped.assertRequest([
        'page-1',
        ['relative/file.png'],
        'request-1',
      ]),
    ).toThrow(/paths/)
  })

  it('rejects oversized memory attachments before Buffer allocation', () => {
    expect(() =>
      attachmentIpcContracts.storeMemory.assertRequest([
        'page-1',
        [{ name: 'large.png', data: new ArrayBuffer(25 * 1024 * 1024 + 1) }],
        'request-1',
      ]),
    ).toThrow(/25 MB/)
  })

  it('rejects mismatched hashes, extra response fields, and non-void open results', () => {
    expect(() =>
      attachmentIpcContracts.pickAndStore.assertResponse([
        { ...attachment, url: `notetodo-asset://${'b'.repeat(64)}/cover.png` },
      ]),
    ).toThrow(/URL origin/)
    expect(() => attachmentIpcContracts.open.assertResponse(true)).toThrow(/unexpected data/)
  })
})
