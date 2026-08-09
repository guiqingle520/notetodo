// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { retrievalIpcContract } = require('../../electron/ipc-retrieval-contracts.cjs') as {
  retrievalIpcContract: IpcContract
}
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    hybridSearch(query: string, userId?: string | null, limit?: number): unknown[]
    close(): void
  }
}

describe('retrieval IPC contract', () => {
  it('accepts omitted limits as passed by preload and bounds explicit limits', () => {
    expect(() => retrievalIpcContract.assertRequest(['离线检索', undefined])).not.toThrow()
    expect(() => retrievalIpcContract.assertRequest(['离线检索', 12])).not.toThrow()
    expect(() => retrievalIpcContract.assertRequest(['离线检索', 0])).toThrow(/between 1 and 12/)
    expect(() => retrievalIpcContract.assertRequest(['离线检索', 13])).toThrow(/between 1 and 12/)
  })

  it('matches the real permission-filtered SQLite citation projection', () => {
    const database = new WorkspaceDatabase(':memory:')
    try {
      const citations = database.hybridSearch('项目 风险', null, 6)
      expect(() => retrievalIpcContract.assertResponse(citations)).not.toThrow()
    } finally {
      database.close()
    }
  })

  it('rejects unordered ids and internal ranking fields', () => {
    const citation = {
      citationId: 'S1',
      pageId: 'welcome',
      chunkIndex: 0,
      title: '欢迎',
      heading: '欢迎',
      excerpt: '本地优先工作区',
      score: 0.01,
    }
    expect(() => retrievalIpcContract.assertResponse([citation])).not.toThrow()
    expect(() => retrievalIpcContract.assertResponse([{ ...citation, citationId: 'S2' }])).toThrow(
      /ordered/,
    )
    expect(() =>
      retrievalIpcContract.assertResponse([{ ...citation, embedding: new Uint8Array() }]),
    ).toThrow(/fields/)
  })

  it('rejects oversized excerpts and non-finite scores', () => {
    const citation = {
      citationId: 'S1',
      pageId: 'welcome',
      chunkIndex: 0,
      title: '欢迎',
      heading: '欢迎',
      excerpt: 'x'.repeat(901),
      score: Number.NaN,
    }
    expect(() => retrievalIpcContract.assertResponse([citation])).toThrow(/excerpt/)
    expect(() => retrievalIpcContract.assertResponse([{ ...citation, excerpt: '正文' }])).toThrow(
      /score/,
    )
  })
})
