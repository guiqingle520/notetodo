// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { historyIpcContracts } = require('../../electron/ipc-history-contracts.cjs') as {
  historyIpcContracts: Record<'list' | 'get' | 'restore', IpcContract>
}
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    loadWorkspace(): { pages: Array<{ id: string; title: string; content: string }> }
    upsertPage(page: unknown): unknown
    listPageVersions(pageId: string): unknown[]
    getPageVersion(pageId: string, versionId: number): unknown
    restorePageVersion(pageId: string, versionId: number): unknown
    close(): void
  }
}

describe('history IPC contracts', () => {
  it('accepts the real SQLite summary, detail, and restored-page projections', () => {
    const database = new WorkspaceDatabase(':memory:')
    try {
      const page = database.loadWorkspace().pages.find((item) => item.id === 'welcome')!
      database.upsertPage({ ...page, title: '已修改标题' })
      const versions = database.listPageVersions(page.id)
      const versionId = (versions[0] as { id: number }).id

      expect(() => historyIpcContracts.list.assertResponse(versions)).not.toThrow()
      expect(() =>
        historyIpcContracts.get.assertResponse(database.getPageVersion(page.id, versionId)),
      ).not.toThrow()
      expect(() =>
        historyIpcContracts.restore.assertResponse(database.restorePageVersion(page.id, versionId)),
      ).not.toThrow()
    } finally {
      database.close()
    }
  })

  it('requires positive safe integer version ids', () => {
    expect(() => historyIpcContracts.get.assertRequest(['welcome', 1])).not.toThrow()
    expect(() => historyIpcContracts.get.assertRequest(['welcome', 0])).toThrow(/version id/)
    expect(() => historyIpcContracts.get.assertRequest(['welcome', 1.5])).toThrow(/version id/)
  })

  it('rejects oversized previews and unexpected summary fields', () => {
    const summary = {
      id: 1,
      pageId: 'welcome',
      title: '标题',
      reason: 'autosave',
      createdAt: '2026-08-09T12:00:00.000Z',
      contentLength: 10,
      preview: '<p>正文</p>',
    }
    expect(() => historyIpcContracts.list.assertResponse([summary])).not.toThrow()
    expect(() =>
      historyIpcContracts.list.assertResponse([{ ...summary, preview: 'x'.repeat(501) }]),
    ).toThrow(/preview/)
    expect(() =>
      historyIpcContracts.list.assertResponse([{ ...summary, attachmentPaths: [] }]),
    ).toThrow(/fields/)
  })

  it('allows a missing version detail but rejects malformed content', () => {
    expect(() => historyIpcContracts.get.assertResponse(null)).not.toThrow()
    expect(() =>
      historyIpcContracts.get.assertResponse({
        id: 1,
        pageId: 'welcome',
        title: '标题',
        content: 123,
        reason: 'restore',
        createdAt: '2026-08-09T12:00:00.000Z',
      }),
    ).toThrow(/content/)
  })
})
