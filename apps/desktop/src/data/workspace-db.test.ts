// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkspacePage } from '../domain'
import type { DatabaseSnapshot } from '@notetodo/database-core'

const require = createRequire(import.meta.url)
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    loadWorkspace(): { pages: WorkspacePage[]; activePageId: string }
    upsertPage(page: WorkspacePage): WorkspacePage
    setActivePage(id: string): void
    archivePage(id: string): void
    restorePage(id: string): void
    searchPages(query: string, limit?: number): WorkspacePage[]
    loadDatabaseByPage(pageId: string): DatabaseSnapshot | null
    updateDatabaseCell(recordId: string, propertyId: string, value: unknown): void
    createDatabaseRecord(databaseId: string, recordId: string): void
    setActiveDatabaseView(databaseId: string, viewId: string): void
    loadSyncDocument(pageId: string): {
      snapshot: string | null
      updates: Array<{ id: number; clientId: string; data: string }>
      latestUpdateId: number
    }
    appendSyncUpdate(pageId: string, clientId: string, data: string): number
    compactSyncDocument(pageId: string, snapshot: string, throughId: number): void
    close(): void
  }
}

let database: InstanceType<typeof WorkspaceDatabase> | undefined
afterEach(() => database?.close())

describe('WorkspaceDatabase', () => {
  it('migrates and seeds a complete starter workspace atomically', () => {
    database = new WorkspaceDatabase(':memory:')
    const snapshot = database.loadWorkspace()
    expect(snapshot.activePageId).toBe('welcome')
    expect(snapshot.pages).toHaveLength(4)
    expect(snapshot.pages.every((page) => page.lastVisitedAt)).toBe(true)
  })

  it('upserts, indexes, archives and restores a page', () => {
    database = new WorkspaceDatabase(':memory:')
    const page: WorkspacePage = {
      id: 'searchable',
      title: '离线搜索性能',
      icon: 'note',
      parentId: null,
      favorite: false,
      content: '<p>SQLite 全文索引会找到这段独特内容。</p>',
      updatedAt: new Date().toISOString(),
      lastVisitedAt: new Date().toISOString(),
      archivedAt: null,
    }

    database.upsertPage(page)
    expect(database.searchPages('离线搜索性能').map((result) => result.id)).toContain('searchable')
    database.archivePage(page.id)
    expect(database.searchPages('离线搜索性能')).toHaveLength(0)
    database.restorePage(page.id)
    expect(database.searchPages('离线搜索性能')).toHaveLength(1)
  })

  it('persists typed database cells, records and active views', () => {
    database = new WorkspaceDatabase(':memory:')
    const initial = database.loadDatabaseByPage('projects')
    expect(initial?.records).toHaveLength(5)
    expect(initial?.views.map((view) => view.type)).toEqual(['table', 'board', 'list'])

    database.updateDatabaseCell('task-1', 'task-score', 2)
    database.createDatabaseRecord('roadmap-db', 'task-new')
    database.updateDatabaseCell('task-new', 'task-title', '新增记录')
    database.setActiveDatabaseView('roadmap-db', 'roadmap-board')

    const updated = database.loadDatabaseByPage('projects')
    expect(updated?.records.find((record) => record.id === 'task-1')?.values['task-score']).toBe(2)
    expect(updated?.records.find((record) => record.id === 'task-new')?.values['task-title']).toBe('新增记录')
    expect(updated?.activeViewId).toBe('roadmap-board')
  })

  it('replays incremental sync updates and compacts them into one durable snapshot', () => {
    database = new WorkspaceDatabase(':memory:')
    const first = Buffer.from('first update').toString('base64')
    const second = Buffer.from('second update').toString('base64')
    const firstId = database.appendSyncUpdate('welcome', 'client-a', first)
    const secondId = database.appendSyncUpdate('welcome', 'client-b', second)

    const pending = database.loadSyncDocument('welcome')
    expect(pending.snapshot).toBeNull()
    expect(pending.updates).toEqual([
      { id: firstId, clientId: 'client-a', data: first },
      { id: secondId, clientId: 'client-b', data: second },
    ])

    const snapshot = Buffer.from('merged snapshot').toString('base64')
    database.compactSyncDocument('welcome', snapshot, secondId)
    expect(database.loadSyncDocument('welcome')).toEqual({
      snapshot,
      updates: [],
      latestUpdateId: secondId,
    })
  })
})
