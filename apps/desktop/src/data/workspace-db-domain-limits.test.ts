// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

interface Statement<Result = unknown> {
  all(...values: unknown[]): Result[]
  get(...values: unknown[]): Result | undefined
  run(...values: unknown[]): { changes: number }
}

interface RecordRepository {
  activeRecordCount: Statement<{ count: number }>
  commentCount: Statement<{ count: number }>
  insertRecordComment: Statement
  insertProperty: Statement
  insertRecord: Statement
  nextRecordPosition: Statement<{ position: number }>
  propertyOrder: Statement<{ id: string }>
  reminderCount: Statement<{ count: number }>
  totalRecordCount: Statement<{ count: number }>
  trashRecord: Statement
  upsertRecordReminder: Statement
  transaction<Result>(work: () => Result): Result
}

interface TestDatabase {
  recordRepository: RecordRepository
  addDatabaseProperty(databaseId: string, propertyId: string, name: string, type: string): unknown
  createDatabaseRecord(databaseId: string, recordId: string): void
  createDatabaseRecordComment(comment: {
    id: string
    recordId: string
    propertyId: string | null
    authorName: string
    body: string
  }): Array<{ id: string }>
  createDatabaseRecordFromTemplate(
    databaseId: string,
    templateId: string,
    recordId: string,
  ): unknown
  duplicateDatabaseRecord(databaseId: string, sourceRecordId: string, recordId: string): unknown
  importDatabaseRecords(
    databaseId: string,
    records: Array<{ id: string; values: Record<string, unknown> }>,
  ): unknown
  listDatabaseRecordHistory(recordId: string): Array<{
    next: string
    previous: string
  }>
  listDatabaseRecordReminders(recordId: string): Array<{ id: string; note: string }>
  listDatabaseSources(): Array<{ id: string; recordCount: number }>
  listTrashedDatabaseRecords(databaseId: string): Array<{ id: string }>
  restoreDatabaseRecords(databaseId: string, recordIds: string[]): unknown
  saveDatabaseRecordReminder(reminder: {
    id: string
    recordId: string
    propertyId: string
    dueAt: string
    note: string
  }): Array<{ id: string; note: string }>
  saveDatabaseTemplate(
    databaseId: string,
    template: {
      id: string
      name: string
      values: Record<string, unknown>
      content: string
      createdAt: string
    },
  ): unknown
  trashDatabaseRecords(databaseId: string, recordIds: string[]): unknown
  updateDatabaseRecordContent(recordId: string, content: string): void
  close(): void
}

const require = createRequire(import.meta.url)
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => TestDatabase
}

let database: TestDatabase | undefined
afterEach(() => database?.close())

describe('WorkspaceDatabase domain limits', () => {
  it('rejects a fifty-first property without mutating the schema', () => {
    database = new WorkspaceDatabase(':memory:')
    const repository = database.recordRepository
    const existing = repository.propertyOrder.all('roadmap-db')

    repository.transaction(() => {
      for (let position = existing.length; position < 50; position += 1) {
        repository.insertProperty.run(
          `limit-property-${position}`,
          'roadmap-db',
          `边界属性 ${position}`,
          'text',
          position,
          '{}',
        )
      }
    })

    expect(repository.propertyOrder.all('roadmap-db')).toHaveLength(50)
    expect(() =>
      database?.addDatabaseProperty('roadmap-db', 'property-51', '超限属性', 'text'),
    ).toThrow(/50 properties/)
    expect(repository.propertyOrder.all('roadmap-db')).toHaveLength(50)
  })

  it('counts only active records in database source projections', () => {
    database = new WorkspaceDatabase(':memory:')
    const before = database.listDatabaseSources().find((source) => source.id === 'roadmap-db')

    database.trashDatabaseRecords('roadmap-db', ['task-1'])
    const after = database.listDatabaseSources().find((source) => source.id === 'roadmap-db')

    expect(before?.recordCount).toBe(5)
    expect(after?.recordCount).toBe(4)
  })

  it('keeps reminder ids record-scoped and caps only new reminders', () => {
    database = new WorkspaceDatabase(':memory:')
    const repository = database.recordRepository
    const dueAt = '2030-01-01T09:00:00.000Z'
    const createdAt = '2026-01-01T00:00:00.000Z'

    repository.transaction(() => {
      for (let index = 0; index < 500; index += 1) {
        repository.upsertRecordReminder.run(
          `limit-reminder-${index}`,
          'task-1',
          'task-due',
          dueAt,
          '',
          createdAt,
          createdAt,
        )
      }
    })

    expect(repository.reminderCount.get('task-1')?.count).toBe(500)
    expect(() =>
      database?.saveDatabaseRecordReminder({
        id: 'limit-reminder-0',
        recordId: 'task-2',
        propertyId: 'task-due',
        dueAt,
        note: '不得转移',
      }),
    ).toThrow(/another record/)
    expect(() =>
      database?.saveDatabaseRecordReminder({
        id: 'limit-reminder-500',
        recordId: 'task-1',
        propertyId: 'task-due',
        dueAt,
        note: '超出上限',
      }),
    ).toThrow(/500 reminders/)

    const updated = database.saveDatabaseRecordReminder({
      id: 'limit-reminder-0',
      recordId: 'task-1',
      propertyId: 'task-due',
      dueAt,
      note: '允许更新',
    })
    expect(updated).toHaveLength(500)
    expect(updated.find((reminder) => reminder.id === 'limit-reminder-0')?.note).toBe('允许更新')
  })

  it('caps comments before inserting a response-invisible five-hundred-first row', () => {
    database = new WorkspaceDatabase(':memory:')
    const repository = database.recordRepository

    repository.transaction(() => {
      for (let index = 0; index < 500; index += 1) {
        repository.insertRecordComment.run(
          `limit-comment-${index}`,
          'task-1',
          null,
          'Lin',
          `评论 ${index}`,
          '2026-01-01T00:00:00.000Z',
        )
      }
    })

    expect(repository.commentCount.get('task-1')?.count).toBe(500)
    expect(() =>
      database?.createDatabaseRecordComment({
        id: 'limit-comment-500',
        recordId: 'task-1',
        propertyId: null,
        authorName: 'Lin',
        body: '超出上限',
      }),
    ).toThrow(/500 comments/)
    expect(repository.commentCount.get('task-1')?.count).toBe(500)
  })

  it('bounds materialized history bytes while retaining the newest revision', () => {
    database = new WorkspaceDatabase(':memory:')
    const revisions = Array.from({ length: 6 }, (_, index) => String(index).repeat(2_000_000))

    revisions.forEach((content) => database?.updateDatabaseRecordContent('task-1', content))
    const history = database.listDatabaseRecordHistory('task-1')

    expect(history.length).toBeGreaterThan(0)
    expect(history.length).toBeLessThan(revisions.length)
    expect(history[0]?.next).toBe(revisions.at(-1))
    expect(
      history.reduce(
        (bytes, entry) =>
          bytes +
          Buffer.byteLength(JSON.stringify(entry.previous)) +
          Buffer.byteLength(JSON.stringify(entry.next)),
        0,
      ),
    ).toBeLessThanOrEqual(20_000_000)
  })

  it('rejects every path that would exceed fifty thousand active records', () => {
    database = new WorkspaceDatabase(':memory:')
    const repository = database.recordRepository
    const templateId = 'capacity-template'
    const restoreId = 'capacity-restore'

    database.saveDatabaseTemplate('roadmap-db', {
      id: templateId,
      name: '容量模板',
      values: {},
      content: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    database.createDatabaseRecord('roadmap-db', restoreId)
    database.trashDatabaseRecords('roadmap-db', [restoreId])

    const active = repository.activeRecordCount.get('roadmap-db')?.count ?? 0
    let position = repository.nextRecordPosition.get('roadmap-db')?.position ?? active
    repository.transaction(() => {
      for (let index = active; index < 50_000; index += 1) {
        const now = '2026-01-01T00:00:00.000Z'
        repository.insertRecord.run(`capacity-record-${index}`, 'roadmap-db', position, now, now)
        position += 1
      }
    })

    expect(repository.activeRecordCount.get('roadmap-db')?.count).toBe(50_000)
    expect(() => database?.createDatabaseRecord('roadmap-db', 'capacity-create')).toThrow(
      /50,000 active records/,
    )
    expect(() =>
      database?.duplicateDatabaseRecord('roadmap-db', 'task-1', 'capacity-duplicate'),
    ).toThrow(/50,000 active records/)
    expect(() => database?.restoreDatabaseRecords('roadmap-db', [restoreId])).toThrow(
      /50,000 active records/,
    )
    expect(() =>
      database?.importDatabaseRecords('roadmap-db', [
        { id: 'capacity-import', values: { 'task-title': '容量导入' } },
      ]),
    ).toThrow(/50,000 active records/)
    expect(() =>
      database?.createDatabaseRecordFromTemplate(
        'roadmap-db',
        templateId,
        'capacity-template-record',
      ),
    ).toThrow(/50,000 active records/)

    expect(repository.activeRecordCount.get('roadmap-db')?.count).toBe(50_000)
    expect(database.listTrashedDatabaseRecords('roadmap-db')).toContainEqual({
      id: restoreId,
      title: '无标题',
      trashedAt: expect.any(String),
    })
  }, 20_000)

  it('bounds archived and active rows across every record creation path', () => {
    database = new WorkspaceDatabase(':memory:')
    const repository = database.recordRepository
    const initialCount = repository.totalRecordCount.get('roadmap-db')?.count ?? 0
    let position = repository.nextRecordPosition.get('roadmap-db')?.position ?? initialCount
    const now = '2026-01-01T00:00:00.000Z'

    repository.transaction(() => {
      for (let index = initialCount; index < 100_000; index += 1) {
        const recordId = `storage-record-${index}`
        repository.insertRecord.run(recordId, 'roadmap-db', position, now, now)
        repository.trashRecord.run(now, now, recordId, 'roadmap-db')
        position += 1
      }
    })

    database.saveDatabaseTemplate('roadmap-db', {
      id: 'storage-template',
      name: '存储上限模板',
      values: {},
      content: '',
      createdAt: now,
    })
    expect(repository.totalRecordCount.get('roadmap-db')?.count).toBe(100_000)
    expect(() => database?.createDatabaseRecord('roadmap-db', 'storage-create')).toThrow(
      /100,000 total records/,
    )
    expect(() =>
      database?.duplicateDatabaseRecord('roadmap-db', 'task-1', 'storage-duplicate'),
    ).toThrow(/100,000 total records/)
    expect(() =>
      database?.importDatabaseRecords('roadmap-db', [{ id: 'storage-import', values: {} }]),
    ).toThrow(/100,000 total records/)
    expect(() =>
      database?.createDatabaseRecordFromTemplate(
        'roadmap-db',
        'storage-template',
        'storage-from-template',
      ),
    ).toThrow(/100,000 total records/)
    expect(repository.totalRecordCount.get('roadmap-db')?.count).toBe(100_000)
  }, 20_000)
})
