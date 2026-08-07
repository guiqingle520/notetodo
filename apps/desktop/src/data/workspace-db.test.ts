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
    updateDatabaseCell(recordId: string, propertyId: string, value: unknown): { automationRuns: string[] }
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
    hybridSearch(query: string, userId?: string | null, limit?: number): Array<{ citationId: string; pageId: string; title: string; excerpt: string; score: number }>
    issueApiToken(name: string, scopes: string[], expiresAt?: string | null): { id: string; rawToken: string; scopes: string[] }
    listApiTokens(): Array<{ id: string; name: string; prefix: string; scopes: string[]; revokedAt: string | null; lastUsedAt: string | null }>
    authenticateApiToken(rawToken: string, requiredScope: string): null | { id: string; name: string; scopes: string[] }
    revokeApiToken(id: string): boolean
    recordApiAudit(entry: { requestId: string; tokenId: string | null; method: string; path: string; status: number; durationMs: number }): void
    listApiAudit(limit?: number): Array<{ requestId: string; status: number; durationMs: number }>
    createWebhookEndpoint(name: string, url: string, events: string[], encryptedSecret: Buffer): { id: string; url: string; events: string[] }
    listWebhookEndpoints(): Array<{ id: string; pendingCount: number; deadCount: number }>
    setWebhookEndpointActive(id: string, active: boolean): boolean
    enqueueWebhookEvent(event: string, resourceKey: string, data: unknown, occurredAt?: string): void
    claimWebhookDeliveries(workerId: string, limit?: number, leaseMs?: number, now?: string): Array<{ id: string; payload: string; encryptedSecret: Buffer }>
    completeWebhookDelivery(deliveryId: string, workerId: string, result: { statusCode: number | null; durationMs: number; responsePreview?: string; errorMessage?: string }): { status: string; attempt: number }
    listWebhookDeliveries(endpointId: string): Array<{ id: string; status: string; attempts: number }>
    listDatabaseAutomations(databaseId: string): Array<{ id: string; name: string; enabled: boolean; trigger: { propertyId: string }; actions: Array<{ propertyId: string; value: unknown }> }>
    saveDatabaseAutomation(databaseId: string, rule: any): any
    setDatabaseAutomationEnabled(id: string, enabled: boolean): boolean
    listAutomationRuns(databaseId: string): Array<{ id: string; automationId: string; status: string; errorMessage: string | null; replayOf: string | null }>
    replayAutomationRun(runId: string): string
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
    expect(initial?.views.map((view) => view.type)).toEqual(['table', 'board', 'list', 'calendar', 'timeline'])
    expect(initial?.views.at(-2)).toMatchObject({ type: 'calendar', config: { datePropertyId: 'task-due' } })
    expect(initial?.views.at(-1)).toMatchObject({ type: 'timeline', config: { startDatePropertyId: 'task-start', endDatePropertyId: 'task-due' } })
    expect(initial?.schema.properties).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'task-start', type: 'date' })]))

    database.updateDatabaseCell('task-1', 'task-score', 2)
    database.createDatabaseRecord('roadmap-db', 'task-new')
    database.updateDatabaseCell('task-new', 'task-title', '新增记录')
    database.setActiveDatabaseView('roadmap-db', 'roadmap-board')

    const updated = database.loadDatabaseByPage('projects')
    expect(updated?.records.find((record) => record.id === 'task-1')?.values['task-score']).toBe(2)
    expect(updated?.records.find((record) => record.id === 'task-new')?.values['task-title']).toBe('新增记录')
    expect(updated?.activeViewId).toBe('roadmap-board')
  })

  it('persists validated relations while keeping derived properties read-only', () => {
    database = new WorkspaceDatabase(':memory:')
    database.updateDatabaseCell('task-1', 'task-dependencies', ['task-2', 'task-2', 'task-4'])

    const updated = database.loadDatabaseByPage('projects')
    expect(updated?.schema.properties.map((property) => property.type)).toContain('rollup')
    expect(updated?.schema.properties.map((property) => property.type)).toContain('formula')
    expect(updated?.records.find((record) => record.id === 'task-1')?.values['task-dependencies']).toEqual(['task-2', 'task-4'])
    expect(() => database?.updateDatabaseCell('task-1', 'task-risk', '被篡改')).toThrow(/read-only/)
    expect(() => database?.updateDatabaseCell('task-1', 'task-dependencies', ['missing-record'])).toThrow(/does not exist/)
  })

  it('executes persisted automations transactionally and records successful runs', () => {
    database = new WorkspaceDatabase(':memory:')
    expect(database.listDatabaseAutomations('roadmap-db')).toEqual([expect.objectContaining({ id: 'completed-task-priority', enabled: true })])
    const result = database.updateDatabaseCell('task-4', 'task-status', 'done')
    expect(result.automationRuns).toHaveLength(1)
    expect(database.loadDatabaseByPage('projects')?.records.find((record) => record.id === 'task-4')?.values['task-score']).toBe(1)
    expect(database.listAutomationRuns('roadmap-db')[0]).toMatchObject({ automationId: 'completed-task-priority', status: 'succeeded' })
  })

  it('isolates failed automation actions and replays captured input with a corrected rule', () => {
    database = new WorkspaceDatabase(':memory:')
    const rule = { id: 'failing-relation', name: 'Broken relation', enabled: true, trigger: { type: 'propertyChanged', propertyId: 'task-owner' }, condition: { propertyId: 'task-owner', operator: 'equals', value: 'boom' }, actions: [{ type: 'setProperty', propertyId: 'task-dependencies', value: ['missing-record'] }] }
    database.saveDatabaseAutomation('roadmap-db', rule)
    database.updateDatabaseCell('task-1', 'task-owner', 'boom')
    const failed = database.listAutomationRuns('roadmap-db').find((run) => run.automationId === rule.id)!
    expect(failed).toMatchObject({ status: 'failed' })
    expect(database.loadDatabaseByPage('projects')?.records.find((record) => record.id === 'task-1')?.values['task-owner']).toBe('boom')

    const failedReplayId = database.replayAutomationRun(failed.id)
    expect(database.listAutomationRuns('roadmap-db').find((run) => run.id === failedReplayId)).toMatchObject({ status: 'failed', replayOf: failed.id })

    database.saveDatabaseAutomation('roadmap-db', { ...rule, actions: [{ type: 'setProperty', propertyId: 'task-score', value: 2 }] })
    const replayId = database.replayAutomationRun(failed.id)
    expect(database.listAutomationRuns('roadmap-db').find((run) => run.id === replayId)).toMatchObject({ status: 'succeeded', replayOf: failed.id })
    expect(database.loadDatabaseByPage('projects')?.records.find((record) => record.id === 'task-1')?.values['task-score']).toBe(2)
  })

  it('prevents an automation id from overwriting a rule in another database', () => {
    database = new WorkspaceDatabase(':memory:')
    const existing = database.listDatabaseAutomations('roadmap-db')[0]!
    expect(() => database?.saveDatabaseAutomation('another-db', existing)).toThrow(/another database/)
    expect(database.listDatabaseAutomations('roadmap-db')[0]).toMatchObject({ id: existing.id, name: existing.name })
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

  it('fuses lexical and local semantic retrieval after permission filtering', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    database.upsertPage({ id: 'private-retrieval', title: '火星发射清单', icon: 'note', parentId: null, favorite: false, content: '<p>推进剂阀门检查与轨道窗口确认。</p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
    database.upsertPagePermission('private-retrieval', 'member-allowed', 'Allowed', 'viewer')

    expect(database.hybridSearch('火星 推进剂', 'member-allowed').map((item) => item.pageId)).toContain('private-retrieval')
    expect(database.hybridSearch('火星 推进剂', 'member-denied').map((item) => item.pageId)).not.toContain('private-retrieval')
    expect(database.hybridSearch('火星 推进剂', 'member-allowed')[0]).toMatchObject({ citationId: 'S1' })
  })

  it('stores only API token hashes and enforces scopes, expiry and revocation', () => {
    database = new WorkspaceDatabase(':memory:')
    const issued = database.issueApiToken('Local integration', ['pages:read', 'databases:read'])
    expect(database.listApiTokens()[0]).not.toHaveProperty('rawToken')
    expect(database.authenticateApiToken(issued.rawToken, 'pages:read')).toMatchObject({ id: issued.id, name: 'Local integration' })
    expect(database.authenticateApiToken(issued.rawToken, 'pages:write')).toBeNull()
    expect(database.listApiTokens()[0]?.lastUsedAt).toBeTruthy()
    expect(database.revokeApiToken(issued.id)).toBe(true)
    expect(database.authenticateApiToken(issued.rawToken, 'pages:read')).toBeNull()
  })

  it('records bounded API audit entries without credential material', () => {
    database = new WorkspaceDatabase(':memory:')
    database.recordApiAudit({ requestId: 'request-1', tokenId: null, method: 'GET', path: '/v1/pages', status: 200, durationMs: 4.4 })
    expect(database.listApiAudit()).toEqual([expect.objectContaining({ requestId: 'request-1', status: 200, durationMs: 4 })])
  })

  it('coalesces transactional webhook events and recovers delivery through a lease', () => {
    database = new WorkspaceDatabase(':memory:')
    const endpoint = database.createWebhookEndpoint('Product events', 'https://hooks.example.com/notetodo', ['page.updated'], Buffer.from('encrypted-secret'))
    const original = database.loadWorkspace().pages.find((page) => page.id === 'welcome')!
    database.upsertPage({ ...original, title: 'First event', updatedAt: '2026-08-07T01:00:00.000Z' })
    database.upsertPage({ ...original, title: 'Coalesced event', updatedAt: '2026-08-07T01:00:01.000Z' })

    expect(database.listWebhookEndpoints()[0]).toMatchObject({ id: endpoint.id, pendingCount: 1, deadCount: 0 })
    expect(database.setWebhookEndpointActive(endpoint.id, false)).toBe(true)
    expect(database.claimWebhookDeliveries('paused-worker', 10, 30_000, '2026-08-07T01:00:02.000Z')).toHaveLength(0)
    database.setWebhookEndpointActive(endpoint.id, true)
    const [delivery] = database.claimWebhookDeliveries('worker-1', 10, 30_000, '2026-08-07T01:00:02.000Z')
    expect(JSON.parse(delivery!.payload)).toMatchObject({ event: 'page.updated', data: { page: { title: 'Coalesced event' } } })
    expect(delivery!.encryptedSecret.toString()).toBe('encrypted-secret')
    expect(database.completeWebhookDelivery(delivery!.id, 'worker-1', { statusCode: 503, durationMs: 12, errorMessage: 'temporary' })).toMatchObject({ status: 'pending', attempt: 1 })

    const [retry] = database.claimWebhookDeliveries('worker-2', 10, 30_000, '9999-01-01T00:00:00.000Z')
    expect(database.completeWebhookDelivery(retry!.id, 'worker-2', { statusCode: 204, durationMs: 4 })).toMatchObject({ status: 'delivered', attempt: 2 })
    expect(database.listWebhookDeliveries(endpoint.id)[0]).toMatchObject({ status: 'delivered', attempts: 2 })
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
