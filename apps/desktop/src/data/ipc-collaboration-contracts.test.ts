// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { collaborationIpcContracts } = require('../../electron/ipc-collaboration-contracts.cjs') as {
  collaborationIpcContracts: Record<
    'getTicket' | 'listPermissions' | 'upsertPermission' | 'removePermission',
    IpcContract
  >
}

describe('collaboration IPC contracts', () => {
  it('accepts an unavailable ticket and a valid scoped ticket', () => {
    expect(() => collaborationIpcContracts.getTicket.assertResponse(null)).not.toThrow()
    expect(() =>
      collaborationIpcContracts.getTicket.assertResponse({
        endpoint: 'wss://collaboration.example.test/socket',
        token: 'signed-room-token',
        userId: 'member-1',
        name: '本机用户',
        color: '#c45134',
        role: 'editor',
      }),
    ).not.toThrow()
  })

  it('rejects embedded endpoint credentials and ticket response over-posting', () => {
    expect(() =>
      collaborationIpcContracts.getTicket.assertResponse({
        endpoint: 'wss://user:secret@collaboration.example.test/socket',
        token: 'signed-room-token',
        userId: 'member-1',
        name: '本机用户',
        color: '#c45134',
        role: 'editor',
      }),
    ).toThrow(/endpoint/)
  })

  it('allows member roles but rejects ownership assignment through ordinary sharing', () => {
    expect(() =>
      collaborationIpcContracts.upsertPermission.assertRequest([
        'page-1',
        'member-1',
        '成员一',
        'commenter',
      ]),
    ).not.toThrow()
    expect(() =>
      collaborationIpcContracts.upsertPermission.assertRequest([
        'page-1',
        'member-1',
        '成员一',
        'owner',
      ]),
    ).toThrow(/assignable page role/)
  })

  it('validates permission response fields and void mutation results', () => {
    expect(() =>
      collaborationIpcContracts.listPermissions.assertResponse([
        { subjectId: 'member-1', displayName: '成员一', role: 'viewer' },
      ]),
    ).not.toThrow()
    expect(() => collaborationIpcContracts.removePermission.assertResponse(true)).toThrow(
      /unexpected data/,
    )
  })
})
