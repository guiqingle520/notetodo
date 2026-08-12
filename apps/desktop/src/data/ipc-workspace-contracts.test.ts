// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import type { WorkspacePage, WorkspaceSnapshot } from '../domain'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { workspaceIpcContracts } = require('../../electron/ipc-workspace-contracts.cjs') as {
  workspaceIpcContracts: Record<
    'load' | 'upsertPage' | 'setActivePage' | 'archivePage' | 'restorePage' | 'search',
    IpcContract
  >
}

const page: WorkspacePage = {
  id: 'welcome',
  title: '欢迎',
  description: '本地优先工作区',
  icon: 'note',
  parentId: null,
  favorite: false,
  updatedAt: '2026-08-09T12:00:00.000Z',
  lastVisitedAt: '2026-08-09T12:00:00.000Z',
  archivedAt: null,
  content: '<p>欢迎</p>',
}

describe('workspace IPC contracts', () => {
  it('accepts a valid workspace snapshot and page write round trip', () => {
    const snapshot: WorkspaceSnapshot = { pages: [page], activePageId: page.id }

    expect(() => workspaceIpcContracts.load.assertRequest([])).not.toThrow()
    expect(() => workspaceIpcContracts.load.assertResponse(snapshot)).not.toThrow()
    expect(() => workspaceIpcContracts.upsertPage.assertRequest([page])).not.toThrow()
    expect(() => workspaceIpcContracts.upsertPage.assertResponse(page)).not.toThrow()
  })

  it('rejects over-posted pages and inconsistent active page references', () => {
    expect(() =>
      workspaceIpcContracts.upsertPage.assertRequest([{ ...page, privileged: true }]),
    ).toThrow(/unexpected fields/)
    expect(() =>
      workspaceIpcContracts.upsertPage.assertRequest([{ ...page, description: 'x'.repeat(2_001) }]),
    ).toThrow(/description/)
    expect(() =>
      workspaceIpcContracts.load.assertResponse({ pages: [page], activePageId: 'missing' }),
    ).toThrow(/unarchived page/)
  })

  it('validates mutation ids, void responses, and bounded search queries', () => {
    expect(() => workspaceIpcContracts.archivePage.assertRequest([page.id])).not.toThrow()
    expect(() => workspaceIpcContracts.archivePage.assertResponse(undefined)).not.toThrow()
    expect(() => workspaceIpcContracts.archivePage.assertResponse(true)).toThrow(
      /unexpected response/,
    )
    expect(() => workspaceIpcContracts.search.assertRequest(['x'.repeat(501)])).toThrow(
      /search query/,
    )
    expect(() => workspaceIpcContracts.search.assertResponse([page])).not.toThrow()
  })
})
