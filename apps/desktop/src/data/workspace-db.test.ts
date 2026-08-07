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
    createAIPatchAudit(id: string, pageId: string, operation: string, preview: string): string
    updateAIPatchAudit(id: string, status: string): void
    loadAIPatchAudit(pageId: string): Array<{ id: string; operation: string; preview: string; status: string }>
    upsertPagePermission(pageId: string, subjectId: string, displayName: string, role: string): void
    loadPagePermissions(pageId: string): Array<{ subjectId: string; displayName: string; role: string }>
    removePagePermission(pageId: string, subjectId: string): void
    createComment(comment: { id: string; pageId: string; authorId: string; authorName: string; body: string; anchor: null | { from: number; to: number; quote: string }; mentions?: string[] }): void
    loadComments(pageId: string): Array<{ id: string; body: string; anchor: null | { from: number; to: number; quote: string }; resolvedAt: string | null }>
    resolveComment(id: string): void
    loadNotifications(recipientId: string): Array<{ id: string; readAt: string | null; pageTitle: string; body: string }>
    markNotificationRead(id: string, recipientId: string): void
    importWorkspaceBundle(bundle: any): { rootPageId: string; pageCount: number; databaseCount: number }
    createImportJob(id: string, sourceName: string): void
    recoverInterruptedImports(): void
    updateImportJob(id: string, status: string, errorMessage?: string | null): void
    loadImportJobs(): Array<{ id: string; status: string; report: Record<string, number> }>
    getAttachment(hash: string): null | { hash: string; relativePath: string; mimeType: string }
    registerPageAttachments(pageId: string, attachments: Array<{ hash: string; size: number; mimeType: string; relativePath: string; displayName: string }>): void
    listUnreferencedAttachments(cutoff: string): Array<{ hash: string; relativePath: string }>
    deleteAttachmentIfUnreferenced(hash: string, cutoff: string): boolean
    listPageVersions(pageId: string, limit?: number): Array<{ id: number; pageId: string; title: string; reason: 'autosave' | 'restore'; createdAt: string }>
    getPageVersion(pageId: string, versionId: number): null | { id: number; title: string; content: string }
    restorePageVersion(pageId: string, versionId: number): WorkspacePage
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

  it('imports page trees and typed CSV databases in one transaction', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    const page = (id: string, parentId: string | null, icon: 'book' | 'grid') => ({ id, title: id, icon, parentId, favorite: false, content: '<p>imported</p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
    database.createImportJob('import-job', 'Workspace.zip')
    const result = database.importWorkspaceBundle({
      importId: 'import-job',
      pages: [page('import-root', null, 'book'), page('import-table', 'import-root', 'grid')],
      databases: [{ id: 'import-db', pageId: 'import-table', name: 'Tasks', headers: ['Name', 'Score', 'Done'], rows: [{ Name: 'Ship', Score: '3', Done: 'true' }], inferredTypes: { Name: 'text', Score: 'number', Done: 'checkbox' } }],
      attachments: [{ hash: 'a'.repeat(64), size: 42, mimeType: 'image/png', relativePath: `aa/${'a'.repeat(64)}`, sourcePath: 'assets/cover.png', displayName: 'cover.png', referencedBy: ['import-root'] }],
      report: { importedAssets: 1 },
    })

    expect(result).toMatchObject({ rootPageId: 'import-root', pageCount: 2, databaseCount: 1 })
    expect(database.loadWorkspace().activePageId).toBe('import-root')
    const imported = database.loadDatabaseByPage('import-table')
    expect(imported?.records[0]?.values).toEqual({ 'import-db-p0': 'Ship', 'import-db-p1': 3, 'import-db-p2': true })
    expect(database.getAttachment('a'.repeat(64))).toMatchObject({ mimeType: 'image/png', relativePath: `aa/${'a'.repeat(64)}` })
    expect(database.loadImportJobs()[0]).toMatchObject({ id: 'import-job', status: 'completed', report: { importedAssets: 1 } })
  })

  it('rolls back every page when an imported database is invalid', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    expect(() => database?.importWorkspaceBundle({
      pages: [{ id: 'rolled-back-root', title: 'Rollback', icon: 'book', parentId: null, favorite: false, content: '', updatedAt: now, lastVisitedAt: now, archivedAt: null }],
      databases: [{ id: 'broken-db', pageId: 'missing-page', name: 'Broken', headers: [], rows: [], inferredTypes: {} }],
      report: {},
    })).toThrow()
    expect(database.loadWorkspace().pages.some((page) => page.id === 'rolled-back-root')).toBe(false)
  })

  it('marks interrupted imports as failed for recovery reporting', () => {
    database = new WorkspaceDatabase(':memory:')
    database.createImportJob('interrupted-job', 'Large workspace.zip')
    database.recoverInterruptedImports()
    expect(database.loadImportJobs()[0]).toMatchObject({ id: 'interrupted-job', status: 'failed' })
  })

  it('registers manually selected assets without duplicating content records', () => {
    database = new WorkspaceDatabase(':memory:')
    const attachment = { hash: 'b'.repeat(64), size: 128, mimeType: 'application/pdf', relativePath: `bb/${'b'.repeat(64)}`, displayName: 'brief.pdf' }
    database.registerPageAttachments('welcome', [attachment, attachment])
    expect(database.getAttachment(attachment.hash)).toMatchObject({ hash: attachment.hash, size: 128, mimeType: 'application/pdf' })
  })

  it('reconciles attachment references from serialized page content', () => {
    database = new WorkspaceDatabase(':memory:')
    const hash = 'c'.repeat(64)
    const attachment = { hash, size: 64, mimeType: 'image/png', relativePath: `cc/${hash}`, displayName: 'cover.png' }
    database.registerPageAttachments('welcome', [attachment])
    const page = database.loadWorkspace().pages.find((candidate) => candidate.id === 'welcome')!
    database.upsertPage({ ...page, content: `<img src="notetodo-asset://${hash}/cover.png">` })
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).toHaveLength(0)

    database.upsertPage({ ...page, content: '<p>附件块已删除</p>' })
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).toContainEqual({ hash, relativePath: `cc/${hash}` })
    expect(database.deleteAttachmentIfUnreferenced(hash, '9999-01-01T00:00:00.000Z')).toBe(true)
    expect(database.getAttachment(hash)).toBeNull()
  })

  it('coalesces automatic history and makes every restore reversible', () => {
    database = new WorkspaceDatabase(':memory:')
    const original = database.loadWorkspace().pages.find((page) => page.id === 'welcome')!
    database.upsertPage({ ...original, title: '第一次编辑', content: '<p>alpha</p>' })
    database.upsertPage({ ...original, title: '第二次编辑', content: '<p>beta</p>' })
    const versions = database.listPageVersions('welcome')
    expect(versions).toHaveLength(1)
    expect(database.getPageVersion('welcome', versions[0]!.id)).toMatchObject({ title: original.title, content: original.content })

    const restored = database.restorePageVersion('welcome', versions[0]!.id)
    expect(restored).toMatchObject({ title: original.title, content: original.content })
    expect(database.listPageVersions('welcome')).toHaveLength(2)
    expect(database.listPageVersions('welcome')[0]?.reason).toBe('restore')
  })

  it('keeps assets referenced only by reversible history out of garbage collection', () => {
    database = new WorkspaceDatabase(':memory:')
    const hash = 'e'.repeat(64)
    const attachment = { hash, size: 32, mimeType: 'image/png', relativePath: `ee/${hash}`, displayName: 'history.png' }
    database.registerPageAttachments('welcome', [attachment])
    const original = database.loadWorkspace().pages.find((page) => page.id === 'welcome')!
    database.upsertPage({ ...original, content: `<img src="notetodo-asset://${hash}/history.png">` })
    const originalVersion = database.listPageVersions('welcome')[0]!
    database.restorePageVersion('welcome', originalVersion.id)
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).not.toContainEqual(expect.objectContaining({ hash }))
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

  it('keeps an auditable lifecycle for AI-proposed page writes', () => {
    database = new WorkspaceDatabase(':memory:')
    database.createAIPatchAudit('patch-1', 'welcome', 'insert-paragraphs', '建议写入内容')
    expect(database.loadAIPatchAudit('welcome')[0]?.status).toBe('proposed')
    database.updateAIPatchAudit('patch-1', 'applied')
    expect(database.loadAIPatchAudit('welcome')[0]).toMatchObject({ id: 'patch-1', operation: 'insert-paragraphs', preview: '建议写入内容', status: 'applied' })
  })

  it('persists page roles and anchored comment resolution', () => {
    database = new WorkspaceDatabase(':memory:')
    database.upsertPagePermission('welcome', 'member-1', 'Ming', 'commenter')
    expect(database.loadPagePermissions('welcome')).toContainEqual({ subjectId: 'member-1', displayName: 'Ming', role: 'commenter' })
    database.createComment({ id: 'comment-1', pageId: 'welcome', authorId: 'author-1', authorName: 'Lin', body: '@Ming 请确认这里', anchor: { from: 2, to: 6, quote: '关键内容' }, mentions: ['member-1'] })
    expect(database.loadComments('welcome')[0]).toMatchObject({ id: 'comment-1', anchor: { from: 2, to: 6, quote: '关键内容' }, resolvedAt: null })
    const notification = database.loadNotifications('member-1')[0]
    expect(notification).toMatchObject({ readAt: null, pageTitle: '从这里开始', body: '@Ming 请确认这里' })
    database.markNotificationRead(notification!.id, 'member-1')
    expect(database.loadNotifications('member-1')[0]?.readAt).not.toBeNull()
    database.resolveComment('comment-1')
    expect(database.loadComments('welcome')[0]?.resolvedAt).not.toBeNull()
    database.removePagePermission('welcome', 'member-1')
    expect(database.loadPagePermissions('welcome')).not.toContainEqual(expect.objectContaining({ subjectId: 'member-1' }))
  })
})
