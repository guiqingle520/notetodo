// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { restorePageVersion } = require('../../electron/ipc-history-service.cjs') as {
  restorePageVersion(
    database: {
      getSetting(key: string): string | null
      getPageRole(pageId: string, userId: string): string | null
      restorePageVersion(pageId: string, versionId: number): unknown
    },
    pageId: string,
    versionId: number,
  ): unknown
}

function createDatabase(role: string | null, userId: string | null = 'user-1') {
  return {
    getSetting: vi.fn(() => userId),
    getPageRole: vi.fn(() => role),
    restorePageVersion: vi.fn(() => ({ id: 'page-1' })),
  }
}

describe('history IPC service', () => {
  it.each(['owner', 'editor'])(`allows the %s role to restore versions`, (role) => {
    const database = createDatabase(role)
    expect(restorePageVersion(database, 'page-1', 3)).toEqual({ id: 'page-1' })
    expect(database.restorePageVersion).toHaveBeenCalledWith('page-1', 3)
  })

  it.each(['viewer', 'commenter'])(`rejects the explicit %s role`, (role) => {
    const database = createDatabase(role)
    expect(() => restorePageVersion(database, 'page-1', 3)).toThrow(/无权恢复/)
    expect(database.restorePageVersion).not.toHaveBeenCalled()
  })

  it('preserves implicit local-owner access before collaboration identity exists', () => {
    const database = createDatabase(null, null)
    restorePageVersion(database, 'page-1', 3)
    expect(database.getPageRole).not.toHaveBeenCalled()
    expect(database.restorePageVersion).toHaveBeenCalledOnce()
  })
})
