// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface TestDatabase {
  close(): void
  setSetting(key: string, value: string): void
  upsertPagePermission(pageId: string, subjectId: string, displayName: string, role: string): void
  removePagePermission(pageId: string, subjectId: string): void
  updateDatabaseCell(recordId: string, propertyId: string, value: unknown): unknown
  listDatabaseRecordHistory(recordId: string): Array<{
    id: string
    propertyId?: string | null
    previous?: unknown
    next?: unknown
  }>
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
  recordRepository: {
    propertyConfig: {
      get(propertyId: string, databaseId: string): { config_json: string } | undefined
    }
  }
}

interface AccessService {
  loadDatabaseByPage(pageId: string): {
    schema: { properties: Array<Record<string, unknown>> }
    records: Array<{ values: Record<string, unknown> }>
  } | null
  renameDatabase(databaseId: string, name: string): unknown
  listDatabaseSources(): Array<{ id: string; pageId: string }>
  listDueDatabaseRecordReminders(): Array<{ id: string; recordId: string }>
  listDatabaseRecordHistory(recordId: string): Array<{
    id: string
    propertyId?: string | null
    previous?: unknown
    next?: unknown
  }>
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
  duplicateDatabaseRecord(databaseId: string, sourceRecordId: string, recordId: string): unknown
  saveDatabaseTemplate(databaseId: string, template: Record<string, unknown>): unknown
  createDatabaseRecordFromTemplate(
    databaseId: string,
    templateId: string,
    recordId: string,
  ): unknown
  deleteDatabaseProperty(databaseId: string, propertyId: string): unknown
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

  it('redacts unreadable relations and rechecks target access for copied or templated values', () => {
    database.createDatabaseForPage('knowledge', 'knowledge-db', '知识数据库')
    database.createDatabaseRecord('knowledge-db', 'knowledge-record')
    database.updateDatabasePropertyConfig('roadmap-db', 'task-dependencies', {
      relation: { databaseId: 'knowledge-db' },
    })
    database.updateDatabaseCell('task-1', 'task-dependencies', ['knowledge-record'])
    database.createDatabaseRecord('roadmap-db', 'blank-source')
    setActor('editor-user', 'editor')
    database.upsertPagePermission('knowledge', 'other-owner', '其他所有者', 'owner')

    const safe = service.loadDatabaseByPage('projects')!
    expect(
      safe.schema.properties.find((property) => property.id === 'task-dependencies'),
    ).not.toHaveProperty('relation')
    expect(
      safe.schema.properties.find((property) => property.id === 'task-dependency-score'),
    ).not.toHaveProperty('rollup')
    expect(safe.records[0]?.values['task-dependencies']).toBeNull()
    expect(safe.records[0]?.values['task-dependency-score']).toBeNull()
    expect(safe.records[0]?.values['task-risk']).toBeNull()
    expect(
      service
        .listDatabaseRecordHistory('task-1')
        .find((entry) => entry.propertyId === 'task-dependencies'),
    ).toMatchObject({ previous: null, next: null })

    expect(() =>
      service.duplicateDatabaseRecord('roadmap-db', 'blank-source', 'copy-denied'),
    ).toThrow(/无权/)
    const now = '2026-08-11T00:00:00.000Z'
    const template = {
      id: 'relation-template',
      databaseId: 'roadmap-db',
      name: '关联模板',
      values: { 'task-dependencies': ['knowledge-record'] },
      content: '',
      createdAt: now,
      updatedAt: now,
    }
    expect(() => service.saveDatabaseTemplate('roadmap-db', template)).toThrow(/无权/)

    database.upsertPagePermission('knowledge', 'editor-user', '编辑者', 'viewer')
    expect(() =>
      service.duplicateDatabaseRecord('roadmap-db', 'blank-source', 'copy-allowed'),
    ).not.toThrow()
    expect(() => service.saveDatabaseTemplate('roadmap-db', template)).not.toThrow()
    database.removePagePermission('knowledge', 'editor-user')
    expect(() =>
      service.createDatabaseRecordFromTemplate(
        'roadmap-db',
        'relation-template',
        'template-denied',
      ),
    ).toThrow(/无权/)
  })

  it('requires foreign write access before deleting a reciprocal relation', () => {
    database.createDatabaseForPage('knowledge', 'knowledge-db', '知识数据库')
    database.addDatabaseProperty('roadmap-db', 'source-relation', '外部关联', 'relation')
    database.addDatabaseProperty('knowledge-db', 'knowledge-relation', '关联路线', 'relation')
    database.updateDatabasePropertyConfig('roadmap-db', 'source-relation', {
      relation: { databaseId: 'knowledge-db' },
    })
    database.updateDatabasePropertyConfig('knowledge-db', 'knowledge-relation', {
      relation: {
        databaseId: 'roadmap-db',
        reciprocalPropertyId: 'source-relation',
      },
    })
    setActor('editor-user', 'editor')
    database.upsertPagePermission('knowledge', 'editor-user', '编辑者', 'viewer')

    expect(() => service.deleteDatabaseProperty('roadmap-db', 'source-relation')).toThrow(/无权/)
    expect(
      JSON.parse(
        database.recordRepository.propertyConfig.get('knowledge-relation', 'knowledge-db')!
          .config_json,
      ).relation.reciprocalPropertyId,
    ).toBe('source-relation')

    database.upsertPagePermission('knowledge', 'editor-user', '编辑者', 'editor')
    expect(() => service.deleteDatabaseProperty('roadmap-db', 'source-relation')).not.toThrow()
    expect(
      JSON.parse(
        database.recordRepository.propertyConfig.get('knowledge-relation', 'knowledge-db')!
          .config_json,
      ).relation.reciprocalPropertyId,
    ).toBeUndefined()
  })
})
