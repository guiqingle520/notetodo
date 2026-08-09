// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { searchWorkspace } = require('../../electron/ipc-retrieval-service.cjs') as {
  searchWorkspace(
    database: {
      getSetting(key: string): string | null
      hybridSearch(query: string, userId: string | null, limit: number): unknown[]
    },
    query: string,
    limit?: number,
  ): unknown[]
}

describe('retrieval IPC service', () => {
  it('forwards the privileged-process identity into permission-filtered retrieval', () => {
    const database = {
      getSetting: vi.fn(() => 'member-allowed'),
      hybridSearch: vi.fn(() => []),
    }
    searchWorkspace(database, '火星 推进剂', 6)
    expect(database.getSetting).toHaveBeenCalledWith('collaboration_user_id')
    expect(database.hybridSearch).toHaveBeenCalledWith('火星 推进剂', 'member-allowed', 6)
  })

  it('uses the bounded default when preload supplies no limit', () => {
    const database = {
      getSetting: vi.fn(() => null),
      hybridSearch: vi.fn(() => []),
    }
    searchWorkspace(database, '离线', undefined)
    expect(database.hybridSearch).toHaveBeenCalledWith('离线', null, 8)
  })
})
