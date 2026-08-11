// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface TestDatabase {
  close(): void
  setSetting(key: string, value: string): void
  upsertPagePermission(pageId: string, subjectId: string, displayName: string, role: string): void
  updateDatabaseCell(recordId: string, propertyId: string, value: unknown): unknown
  listDatabaseRecordHistory(recordId: string): Array<{ id: string }>
  createDatabaseRecordComment(comment: Record<string, unknown>): Array<Record<string, unknown>>
  saveDatabaseRecordReminder(reminder: Record<string, unknown>): Array<Record<string, unknown>>
  createDatabaseForPage(pageId: string, databaseId: string, name: string): unknown
  createDatabaseRecord(databaseId: string, recordId: string): void
  addDatabaseProperty(databaseId: string, propertyId: string, name: string, type: string): unknown
  updateDatabasePropertyConfig(
    databaseId: string,
    propertyId: string,
    config: Record<string, unknown>,
  ): unknown
  recordRepository: unknown
}

interface AccessService {
  loadDatabaseByPage(pageId: string): unknown
  renameDatabase(databaseId: string, name: string): unknown
  listDatabaseSources(): Array<{ id: string; pageId: string }>
  listDueDatabaseRecordReminders(): Array<{ id: string; recordId: string }>
  listDatabaseRecordHistory(recordId: string): Array<{ id: string }>
  restoreDatabaseRecordHistory(historyId: string): unknown
  createDatabaseRecordComment(comment: Record<string, unknown>): Array<Record<string, unknown>>
  resolveDatabaseRecordComment(id: string, resolved: boolean): void
  completeDatabaseRecordReminder(id: string, completed: boolean): void
  createDatabaseRecord(databaseId: string, recordId: string): void
  updateDatabasePropertyConfig(
    databaseId: string,
    propertyId: string,
    config: Record<string, unknown>,
  ): unknown
}

const require = createRequire(import.meta.url)
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => TestDatabase
}
const { createDatabaseAccessService } =
  require('../../electron/ipc-database-access-service.cjs') as {
    createDatabaseAccessService(database: TestDatabase): AccessService
  }

let database: TestDatabase
let service: AccessService

beforeEach(() => {
  database = new WorkspaceDatabase(':memory:')
  service = createDatabaseAccessService(database)
})

afterEach(() => database.close())

function setActor(id: string, role: 'viewer' | 'commenter' | 'editor' | 'owner') {
  database.setSetting('collaboration_user_id', id)
  database.upsertPagePermission('projects', id, `用户 ${id}`, role)
}

describe('database access service', () => {
  it('allows readers but rejects explicit read-only writes', () => {
    setActor('viewer-user', 'viewer')

    expect(service.loadDatabaseByPage('projects')).toBeTruthy()
    expect(service.listDatabaseRecordHistory('task-1')).toEqual([])
    expect(() => service.renameDatabase('roadmap-db', '越权名称')).toThrow(/无权/)
    expect(() => service.createDatabaseRecord('roadmap-db', 'viewer-record')).toThrow(/无权/)
  })

  it('lets commenters discuss while deriving their display name in the main process', () => {
    setActor('commenter-user', 'commenter')
    const comments = service.createDatabaseRecordComment({
      id: 'access-comment',
      recordId: 'task-1',
      propertyId: null,
      authorName: '伪造作者',
      body: '允许评论',
    })

    expect(comments[0]).toMatchObject({ id: 'access-comment', authorName: '用户 commenter-user' })
    expect(() => service.resolveDatabaseRecordComment('access-comment', true)).toThrow(/无权/)
  })

  it('checks the owning page for global history, comment, and reminder ids', () => {
    database.updateDatabaseCell('task-1', 'task-owner', '变更前')
    const historyId = database.listDatabaseRecordHistory('task-1')[0]!.id
    database.createDatabaseRecordComment({
      id: 'global-comment',
      recordId: 'task-1',
      propertyId: null,
      authorName: '作者',
      body: '全局 ID',
    })
    database.saveDatabaseRecordReminder({
      id: 'global-reminder',
      recordId: 'task-1',
      propertyId: 'task-due',
      dueAt: '2020-01-01T00:00:00.000Z',
      note: '',
    })
    setActor('viewer-user', 'viewer')

    expect(() => service.restoreDatabaseRecordHistory(historyId)).toThrow(/无权/)
    expect(() => service.resolveDatabaseRecordComment('global-comment', true)).toThrow(/无权/)
    expect(() => service.completeDatabaseRecordReminder('global-reminder', true)).toThrow(/无权/)
  })

  it('filters global sources and due reminders in SQL by page membership', () => {
    database.createDatabaseForPage('knowledge', 'knowledge-db', '知识数据库')
    database.createDatabaseRecord('knowledge-db', 'knowledge-record')
    database.saveDatabaseRecordReminder({
      id: 'knowledge-reminder',
      recordId: 'knowledge-record',
      propertyId: 'knowledge-db-date',
      dueAt: '2020-01-01T00:00:00.000Z',
      note: '不可见',
    })
    database.saveDatabaseRecordReminder({
      id: 'roadmap-reminder',
      recordId: 'task-1',
      propertyId: 'task-due',
      dueAt: '2020-01-01T00:00:00.000Z',
      note: '可见',
    })
    setActor('viewer-user', 'viewer')
    database.upsertPagePermission('knowledge', 'other-owner', '其他所有者', 'owner')

    expect(service.listDatabaseSources().map((source) => source.id)).toContain('roadmap-db')
    expect(service.listDatabaseSources().map((source) => source.id)).not.toContain('knowledge-db')
    expect(service.listDueDatabaseRecordReminders().map((reminder) => reminder.id)).toContain(
      'roadmap-reminder',
    )
    expect(service.listDueDatabaseRecordReminders().map((reminder) => reminder.id)).not.toContain(
      'knowledge-reminder',
    )
  })

  it('denies an actor missing from a page that already has an ACL', () => {
    database.setSetting('collaboration_user_id', 'outsider')
    database.upsertPagePermission('projects', 'other-owner', '其他所有者', 'owner')

    expect(() => service.loadDatabaseByPage('projects')).toThrow(/不存在或当前用户无权/)
  })

  it('requires target read access and reciprocal target write access for relations', () => {
    database.createDatabaseForPage('knowledge', 'knowledge-db', '知识数据库')
    database.addDatabaseProperty('knowledge-db', 'knowledge-relation', '关联路线', 'relation')
    database.updateDatabasePropertyConfig('knowledge-db', 'knowledge-relation', {
      relation: { databaseId: 'roadmap-db' },
    })
    setActor('editor-user', 'editor')
    database.upsertPagePermission('knowledge', 'editor-user', '编辑者', 'viewer')

    expect(() =>
      service.updateDatabasePropertyConfig('roadmap-db', 'task-dependencies', {
        relation: { databaseId: 'knowledge-db' },
      }),
    ).not.toThrow()
    expect(() =>
      service.updateDatabasePropertyConfig('roadmap-db', 'task-dependencies', {
        relation: {
          databaseId: 'knowledge-db',
          reciprocalPropertyId: 'knowledge-relation',
        },
      }),
    ).toThrow(/无权/)
  })
})
