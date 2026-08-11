import { createRequire } from 'node:module'
import type { WorkspacePage } from '../domain'
import type { DatabaseSnapshot } from '@notetodo/database-core'
import type { AutomationRule } from '@notetodo/automation-core'

const require = createRequire(import.meta.url)
export const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    loadWorkspace(): { pages: WorkspacePage[]; activePageId: string }
    upsertPage(page: WorkspacePage): WorkspacePage
    setActivePage(id: string): void
    archivePage(id: string): void
    restorePage(id: string): void
    searchPages(query: string, limit?: number): WorkspacePage[]
    loadDatabaseByPage(pageId: string): DatabaseSnapshot | null
    createDatabaseForPage(pageId: string, databaseId: string, name: string): DatabaseSnapshot
    addDatabaseProperty(databaseId: string, propertyId: string, name: string, type: string): DatabaseSnapshot
    listDatabaseSources(): Array<{ id: string; pageId: string; name: string; pageTitle: string; recordCount: number }>
    updateDatabasePropertyConfig(databaseId: string, propertyId: string, config: object): DatabaseSnapshot
    renameDatabaseProperty(databaseId: string, propertyId: string, name: string): DatabaseSnapshot
    renameDatabase(databaseId: string, name: string): DatabaseSnapshot
    reorderDatabaseProperties(databaseId: string, propertyIds: string[]): DatabaseSnapshot
    deleteDatabaseProperty(databaseId: string, propertyId: string): DatabaseSnapshot
    updateDatabaseCell(recordId: string, propertyId: string, value: unknown): { automationRuns: string[] }
    createDatabaseRecord(databaseId: string, recordId: string): void
    duplicateDatabaseRecord(databaseId: string, sourceRecordId: string, recordId: string): DatabaseSnapshot
    trashDatabaseRecords(databaseId: string, recordIds: string[]): DatabaseSnapshot
    listTrashedDatabaseRecords(databaseId: string): Array<{ id: string; title: string; trashedAt: string }>
    restoreDatabaseRecords(databaseId: string, recordIds: string[]): DatabaseSnapshot
    deleteDatabaseRecordsPermanently(databaseId: string, recordIds: string[]): void
    updateDatabaseRecordContent(recordId: string, content: string): void
    listDatabaseRecordHistory(recordId: string): Array<{ id: string; propertyId: string | null; propertyName: string; previous: unknown; next: unknown; kind: string }>
    restoreDatabaseRecordHistory(historyId: string): DatabaseSnapshot
    listDatabaseRecordComments(recordId: string, unresolvedOnly?: boolean): Array<{ id: string; propertyId: string | null; propertyName: string; body: string; resolvedAt: string | null }>
    createDatabaseRecordComment(comment: { id: string; recordId: string; propertyId: string | null; authorName: string; body: string }): unknown
    resolveDatabaseRecordComment(id: string, resolved: boolean): void
    deleteDatabaseRecordComment(id: string): void
    listDatabaseRecordReminders(recordId: string): Array<{ id: string; propertyId: string; dueAt: string; completedAt: string | null; overdue: boolean }>
    listDueDatabaseRecordReminders(): Array<{ id: string }>
    saveDatabaseRecordReminder(reminder: { id: string; recordId: string; propertyId: string; dueAt: string; note: string }): unknown
    completeDatabaseRecordReminder(id: string, completed: boolean): void
    deleteDatabaseRecordReminder(id: string): void
    setActiveDatabaseView(databaseId: string, viewId: string): void
    updateDatabaseViewConfig(databaseId: string, viewId: string, config: object): void
    createDatabaseView(databaseId: string, viewId: string, name: string, type: string, config: object): DatabaseSnapshot
    renameDatabaseView(databaseId: string, viewId: string, name: string): DatabaseSnapshot
    deleteDatabaseView(databaseId: string, viewId: string): DatabaseSnapshot
    setDefaultDatabaseView(databaseId: string, viewId: string): DatabaseSnapshot
    bulkUpdateDatabaseRecords(databaseId: string, recordIds: string[], propertyId: string, value: unknown): DatabaseSnapshot
    importDatabaseRecords(databaseId: string, records: Array<{ id: string; values: Record<string, unknown> }>): DatabaseSnapshot
    saveDatabaseTemplate(databaseId: string, template: { id: string; name: string; values: Record<string, unknown>; content: string; createdAt: string }): DatabaseSnapshot
    deleteDatabaseTemplate(databaseId: string, templateId: string): DatabaseSnapshot
    createDatabaseRecordFromTemplate(databaseId: string, templateId: string, recordId: string): DatabaseSnapshot
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
    importWorkspaceBundle(bundle: unknown): { rootPageId: string; pageCount: number; databaseCount: number }
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
    listDatabaseAutomations(databaseId: string): AutomationRule[]
    saveDatabaseAutomation(databaseId: string, rule: AutomationRule): AutomationRule
    setDatabaseAutomationEnabled(id: string, enabled: boolean): boolean
    listAutomationRuns(databaseId: string): Array<{ id: string; automationId: string; status: string; errorMessage: string | null; replayOf: string | null }>
    replayAutomationRun(runId: string): string
    close(): void
  }
}

