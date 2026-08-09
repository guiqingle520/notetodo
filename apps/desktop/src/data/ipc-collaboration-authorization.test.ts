// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

interface CollaborationDatabase {
  getSetting: ReturnType<typeof vi.fn<(key: string) => string | null>>
  setSetting: ReturnType<typeof vi.fn<(key: string, value: string) => void>>
  getPageRole: ReturnType<typeof vi.fn<(pageId: string, subjectId: string) => string | null>>
  upsertPagePermission: ReturnType<
    typeof vi.fn<(pageId: string, subjectId: string, name: string, role: string) => void>
  >
}

const require = createRequire(import.meta.url)
const { assertCanManagePagePermission, resolveLocalCollaborationIdentity } =
  require('../../electron/ipc-collaboration-authorization.cjs') as {
    resolveLocalCollaborationIdentity: (
      database: CollaborationDatabase,
      pageId: string,
      createId?: () => string,
    ) => { userId: string; name: string; color: string; role: string }
    assertCanManagePagePermission: (
      database: CollaborationDatabase,
      pageId: string,
      subjectId: string,
    ) => unknown
  }

function createDatabase(actorId: string | null, roleBySubject: Record<string, string> = {}) {
  return {
    getSetting: vi.fn(() => actorId),
    setSetting: vi.fn(),
    getPageRole: vi.fn((_pageId, subjectId) => roleBySubject[subjectId] ?? null),
    upsertPagePermission: vi.fn(),
  } satisfies CollaborationDatabase
}

describe('collaboration authorization', () => {
  it('materializes implicit local ownership for the first privileged operation', () => {
    const database = createDatabase(null)
    const identity = resolveLocalCollaborationIdentity(database, 'page-1', () => 'local-owner')

    expect(identity).toMatchObject({ userId: 'local-owner', role: 'owner' })
    expect(database.setSetting).toHaveBeenCalledWith('collaboration_user_id', 'local-owner')
    expect(database.upsertPagePermission).toHaveBeenCalledWith(
      'page-1',
      'local-owner',
      '本机用户',
      'owner',
    )
  })

  it('allows an owner to manage a non-owner member', () => {
    const database = createDatabase('local-owner', {
      'local-owner': 'owner',
      'member-1': 'viewer',
    })

    expect(() => assertCanManagePagePermission(database, 'page-1', 'member-1')).not.toThrow()
  })

  it('rejects sharing mutations from non-owner roles', () => {
    const database = createDatabase('local-editor', { 'local-editor': 'editor' })

    expect(() => assertCanManagePagePermission(database, 'page-1', 'member-1')).toThrow(
      /页面所有者/,
    )
  })

  it('protects the current actor and other owner records from ordinary member operations', () => {
    const database = createDatabase('local-owner', {
      'local-owner': 'owner',
      'owner-2': 'owner',
    })

    expect(() => assertCanManagePagePermission(database, 'page-1', 'local-owner')).toThrow(
      /自己的所有者权限/,
    )
    expect(() => assertCanManagePagePermission(database, 'page-1', 'owner-2')).toThrow(/其他所有者/)
  })
})
