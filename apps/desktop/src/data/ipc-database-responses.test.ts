// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface DatabaseSnapshotProjection {
  schema: { id: string; properties: Array<Record<string, unknown>> }
  records: Array<{ id: string; values: Record<string, unknown> } & Record<string, unknown>>
  views: Array<{ id: string; databaseId: string } & Record<string, unknown>>
  activeViewId: string
  templates?: Array<{ id: string; databaseId: string } & Record<string, unknown>>
  [key: string]: unknown
}

interface SourceProjection extends Record<string, unknown> {
  id: string
  pageId: string
}

interface ActivityProjection extends Record<string, unknown> {
  id: string
}

interface TestDatabase {
  loadDatabaseByPage(pageId: string): DatabaseSnapshotProjection | null
  createDatabaseForPage(
    pageId: string,
    databaseId: string,
    name: string,
  ): DatabaseSnapshotProjection
  listDatabaseSources(): SourceProjection[]
  updateDatabaseCell(recordId: string, propertyId: string, value: unknown): unknown
  updateDatabaseRecordContent(recordId: string, content: string): void
  listDatabaseRecordHistory(recordId: string): ActivityProjection[]
  createDatabaseRecordComment(comment: Record<string, unknown>): ActivityProjection[]
  listDatabaseRecordComments(recordId: string, unresolvedOnly?: boolean): ActivityProjection[]
  saveDatabaseRecordReminder(reminder: Record<string, unknown>): ActivityProjection[]
  listDatabaseRecordReminders(recordId: string): ActivityProjection[]
  listDueDatabaseRecordReminders(): ActivityProjection[]
  createDatabaseRecord(databaseId: string, recordId: string): void
  trashDatabaseRecords(databaseId: string, recordIds: string[]): DatabaseSnapshotProjection
  listTrashedDatabaseRecords(databaseId: string): ActivityProjection[]
  saveDatabaseTemplate(
    databaseId: string,
    template: Record<string, unknown>,
  ): DatabaseSnapshotProjection
  close(): void
}

const require = createRequire(import.meta.url)
const {
  assertAutomationResult,
  assertBooleanResponse,
  assertDatabaseSnapshot,
  assertRecordComments,
  assertRecordHistory,
  assertRecordReminders,
  assertSnapshotOrNull,
  assertSourceList,
  assertTemplate,
  assertTrashRecords,
} = require('../../electron/ipc-database-responses.cjs') as {
  assertAutomationResult(value: unknown): void
  assertBooleanResponse(value: unknown): void
  assertDatabaseSnapshot(value: unknown): void
  assertRecordComments(value: unknown): void
  assertRecordHistory(value: unknown): void
  assertRecordReminders(value: unknown): void
  assertSnapshotOrNull(value: unknown): void
  assertSourceList(value: unknown): void
  assertTemplate(value: unknown, databaseId: string): void
  assertTrashRecords(value: unknown): void
}
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => TestDatabase
}

let database: TestDatabase

beforeEach(() => {
  database = new WorkspaceDatabase(':memory:')
})

afterEach(() => {
  database.close()
})

function roadmapSnapshot() {
  const snapshot = database.loadDatabaseByPage('projects')
  if (!snapshot) throw new Error('Seed roadmap database is missing.')
  return snapshot
}

describe('database IPC response validators', () => {
  it('accepts the complete snapshot and source projections from SQLite', () => {
    const snapshot = roadmapSnapshot()
    const sources = database.listDatabaseSources()

    expect(() => assertDatabaseSnapshot(snapshot)).not.toThrow()
    expect(() => assertSnapshotOrNull(snapshot)).not.toThrow()
    expect(() => assertSnapshotOrNull(null)).not.toThrow()
    expect(() => assertSourceList(sources)).not.toThrow()
    expect(() => assertSourceList([{ ...sources[0], pageTitle: '' }])).not.toThrow()

    expect(snapshot.schema.id).toBe('roadmap-db')
    expect(snapshot.records.length).toBeGreaterThan(0)
    expect(snapshot.views.some((view) => view.id === snapshot.activeViewId)).toBe(true)
    expect(sources).toContainEqual(
      expect.objectContaining({ id: 'roadmap-db', pageId: 'projects' }),
    )
    expect(sources[0]).not.toHaveProperty('databasePath')
  })

  it('accepts real history, comment, reminder, due, and trash projections', () => {
    database.updateDatabaseCell('task-1', 'task-owner', '契约负责人')
    database.updateDatabaseRecordContent('task-1', '<p>响应契约正文</p>')
    const history = database.listDatabaseRecordHistory('task-1')
    expect(() => assertRecordHistory(history)).not.toThrow()
    expect(history[0]).not.toHaveProperty('previousJson')
    expect(history[0]).not.toHaveProperty('nextJson')

    const comments = database.createDatabaseRecordComment({
      id: 'comment-response',
      recordId: 'task-1',
      propertyId: 'task-owner',
      authorName: 'Lin',
      body: '确认真实评论投影。',
    })
    expect(() => assertRecordComments(comments)).not.toThrow()
    expect(() =>
      assertRecordComments(database.listDatabaseRecordComments('task-1', true)),
    ).not.toThrow()
    expect(comments[0]).not.toHaveProperty('authorId')

    const reminders = database.saveDatabaseRecordReminder({
      id: 'reminder-response',
      recordId: 'task-1',
      propertyId: 'task-due',
      dueAt: '2020-01-01T00:00:00.000Z',
      note: '真实提醒投影',
    })
    expect(() => assertRecordReminders(reminders)).not.toThrow()
    expect(() =>
      assertRecordReminders(database.listDatabaseRecordReminders('task-1')),
    ).not.toThrow()
    expect(() => assertRecordReminders(database.listDueDatabaseRecordReminders())).not.toThrow()

    database.createDatabaseRecord('roadmap-db', 'trash-response')
    database.trashDatabaseRecords('roadmap-db', ['trash-response'])
    const trash = database.listTrashedDatabaseRecords('roadmap-db')
    expect(() => assertTrashRecords(trash)).not.toThrow()
    expect(trash).toContainEqual(expect.objectContaining({ id: 'trash-response' }))
  })

  it('rejects unexpected fields at every persisted projection boundary', () => {
    const snapshot = roadmapSnapshot()
    const sources = database.listDatabaseSources()

    expect(() => assertDatabaseSnapshot({ ...snapshot, databasePath: 'C:\\private.db' })).toThrow(
      /snapshot fields/,
    )
    expect(() =>
      assertDatabaseSnapshot({
        ...snapshot,
        records: [{ ...snapshot.records[0], internalRowId: 7 }, ...snapshot.records.slice(1)],
      }),
    ).toThrow(/record fields/)
    expect(() => assertSourceList([{ ...sources[0], databasePath: 'C:\\private.db' }])).toThrow(
      /source fields/,
    )

    database.updateDatabaseCell('task-1', 'task-owner', '字段检查')
    const history = database.listDatabaseRecordHistory('task-1')
    expect(() => assertRecordHistory([{ ...history[0], previousJson: '"hidden"' }])).toThrow(
      /history fields/,
    )

    const comments = database.createDatabaseRecordComment({
      id: 'comment-extra-field',
      recordId: 'task-1',
      propertyId: null,
      authorName: 'Lin',
      body: '字段检查',
    })
    expect(() => assertRecordComments([{ ...comments[0], authorId: 'private-user' }])).toThrow(
      /comment fields/,
    )

    const reminders = database.saveDatabaseRecordReminder({
      id: 'reminder-extra-field',
      recordId: 'task-1',
      propertyId: 'task-due',
      dueAt: '2020-01-01T00:00:00.000Z',
      note: '',
    })
    expect(() => assertRecordReminders([{ ...reminders[0], rawDueAt: 0 }])).toThrow(
      /reminder fields/,
    )

    database.createDatabaseRecord('roadmap-db', 'trash-extra-field')
    database.trashDatabaseRecords('roadmap-db', ['trash-extra-field'])
    const trash = database.listTrashedDatabaseRecords('roadmap-db')
    expect(() => assertTrashRecords([{ ...trash[0], databaseId: 'roadmap-db' }])).toThrow(
      /trash record fields/,
    )
  })

  it('rejects active views that are missing, duplicated, or owned by another database', () => {
    const roadmap = roadmapSnapshot()
    const knowledge = database.createDatabaseForPage('knowledge', 'knowledge-db', '知识数据库')

    expect(() => assertDatabaseSnapshot({ ...roadmap, activeViewId: 'missing-view' })).toThrow(
      /active view does not exist/,
    )
    expect(() =>
      assertDatabaseSnapshot({ ...roadmap, views: [...roadmap.views, roadmap.views[0]] }),
    ).toThrow(/view ids must be unique/)
    expect(() =>
      assertDatabaseSnapshot({
        ...roadmap,
        views: [knowledge.views[0], ...roadmap.views.slice(1)],
      }),
    ).toThrow(/belongs to another schema/)
  })

  it('rejects cross-database templates and unknown record-property ownership', () => {
    const roadmap = roadmapSnapshot()
    database.createDatabaseForPage('knowledge', 'knowledge-db', '知识数据库')
    const now = new Date().toISOString()
    const knowledge = database.saveDatabaseTemplate('knowledge-db', {
      id: 'knowledge-template',
      name: '知识模板',
      values: { 'knowledge-db-title': '条目' },
      content: '<p>模板</p>',
      createdAt: now,
    })
    const foreignTemplate = knowledge.templates?.[0]
    if (!foreignTemplate) throw new Error('Expected persisted knowledge template.')

    expect(() => assertTemplate(foreignTemplate, 'knowledge-db')).not.toThrow()
    expect(() => assertTemplate(foreignTemplate, 'roadmap-db')).toThrow(/belongs to another schema/)
    expect(() => assertDatabaseSnapshot({ ...roadmap, templates: [foreignTemplate] })).toThrow(
      /belongs to another schema/,
    )
    expect(() =>
      assertDatabaseSnapshot({
        ...roadmap,
        records: [
          {
            ...roadmap.records[0],
            values: { ...roadmap.records[0]?.values, 'foreign-property': 'hidden' },
          },
          ...roadmap.records.slice(1),
        ],
      }),
    ).toThrow(/unknown property/)
  })

  it('rejects duplicate entities and malformed scalar responses', () => {
    const snapshot = roadmapSnapshot()
    expect(() =>
      assertDatabaseSnapshot({
        ...snapshot,
        schema: {
          ...snapshot.schema,
          properties: [...snapshot.schema.properties, snapshot.schema.properties[0]],
        },
      }),
    ).toThrow(/property ids must be unique/)
    expect(() =>
      assertDatabaseSnapshot({ ...snapshot, records: [...snapshot.records, snapshot.records[0]] }),
    ).toThrow(/record ids must be unique/)

    expect(() => assertAutomationResult({ automationRuns: ['run-1'] })).not.toThrow()
    expect(() =>
      assertAutomationResult({ automationRuns: ['run-1'], internalSql: 'hidden' }),
    ).toThrow(/fields/)
    expect(() => assertBooleanResponse(false)).not.toThrow()
    expect(() => assertBooleanResponse(0)).toThrow(/boolean/)
  })
})
