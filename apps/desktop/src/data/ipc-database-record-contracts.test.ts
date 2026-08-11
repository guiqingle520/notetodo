// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

type ContractName =
  | 'updateCell'
  | 'createRecord'
  | 'duplicateRecord'
  | 'trashRecords'
  | 'listTrashedRecords'
  | 'restoreRecords'
  | 'deleteRecordsPermanently'
  | 'updateRecordContent'
  | 'listRecordHistory'
  | 'restoreRecordHistory'
  | 'listRecordComments'
  | 'createRecordComment'
  | 'resolveRecordComment'
  | 'deleteRecordComment'
  | 'listRecordReminders'
  | 'listDueRecordReminders'
  | 'saveRecordReminder'
  | 'completeRecordReminder'
  | 'deleteRecordReminder'

const require = createRequire(import.meta.url)
const { databaseRecordIpcContracts } =
  require('../../electron/ipc-database-record-contracts.cjs') as {
    databaseRecordIpcContracts: Record<ContractName, IpcContract>
  }
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    updateDatabaseCell(recordId: string, propertyId: string, value: unknown): unknown
    createDatabaseRecord(databaseId: string, recordId: string): unknown
    duplicateDatabaseRecord(databaseId: string, sourceId: string, recordId: string): unknown
    trashDatabaseRecords(databaseId: string, recordIds: string[]): unknown
    listTrashedDatabaseRecords(databaseId: string): unknown
    restoreDatabaseRecords(databaseId: string, recordIds: string[]): unknown
    updateDatabaseRecordContent(recordId: string, content: string): unknown
    listDatabaseRecordHistory(recordId: string): Array<{ id: string }>
    restoreDatabaseRecordHistory(historyId: string): unknown
    createDatabaseRecordComment(comment: Record<string, unknown>): unknown
    listDatabaseRecordComments(recordId: string, unresolvedOnly?: boolean): unknown
    saveDatabaseRecordReminder(reminder: Record<string, unknown>): unknown
    listDatabaseRecordReminders(recordId: string): unknown
    listDueDatabaseRecordReminders(): unknown
    close(): void
  }
}

let database: InstanceType<typeof WorkspaceDatabase> | undefined
afterEach(() => {
  database?.close()
  database = undefined
})

describe('database record IPC contracts', () => {
  it('accepts bounded record mutations and rejects unsafe property values', () => {
    expect(() =>
      databaseRecordIpcContracts.updateCell.assertRequest([
        'record-1',
        'property-1',
        ['option-1', 'option-2'],
      ]),
    ).not.toThrow()
    expect(() =>
      databaseRecordIpcContracts.trashRecords.assertRequest([
        'database-1',
        ['record-1', 'record-2'],
      ]),
    ).not.toThrow()
    expect(() =>
      databaseRecordIpcContracts.updateCell.assertRequest([
        'record-1',
        'property-1',
        ['duplicate', 'duplicate'],
      ]),
    ).toThrow(/unique/)
    expect(() =>
      databaseRecordIpcContracts.trashRecords.assertRequest([
        'database-1',
        ['record-1', 'record-1'],
      ]),
    ).toThrow(/unique/)
  })

  it('requires real booleans instead of coercing truthy IPC values', () => {
    expect(() =>
      databaseRecordIpcContracts.listRecordComments.assertRequest(['record-1', false]),
    ).not.toThrow()
    expect(() =>
      databaseRecordIpcContracts.listRecordComments.assertRequest(['record-1', 'false']),
    ).toThrow(/filter/)
    expect(() =>
      databaseRecordIpcContracts.resolveRecordComment.assertRequest(['comment-1', 1]),
    ).toThrow(/state/)
    expect(() =>
      databaseRecordIpcContracts.completeRecordReminder.assertRequest(['reminder-1', 'yes']),
    ).toThrow(/state/)
  })

  it('accepts only authoritative comment and reminder request fields', () => {
    const comment = {
      id: 'comment-1',
      recordId: 'task-1',
      propertyId: null,
      authorName: '本机用户',
      body: '请确认记录。\n支持多行讨论。',
    }
    const reminder = {
      id: 'reminder-1',
      recordId: 'task-1',
      propertyId: 'task-due',
      dueAt: '2026-08-10T09:00:00.000Z',
      note: '',
    }
    expect(() =>
      databaseRecordIpcContracts.createRecordComment.assertRequest([comment]),
    ).not.toThrow()
    expect(() =>
      databaseRecordIpcContracts.saveRecordReminder.assertRequest([reminder]),
    ).not.toThrow()
    expect(() =>
      databaseRecordIpcContracts.createRecordComment.assertRequest([
        { ...comment, propertyName: '伪造属性名' },
      ]),
    ).toThrow(/fields/)
    expect(() =>
      databaseRecordIpcContracts.saveRecordReminder.assertRequest([{ ...reminder, overdue: true }]),
    ).toThrow(/fields/)
  })

  it('validates record lifecycle responses from a real in-memory SQLite database', () => {
    database = new WorkspaceDatabase(':memory:')
    const updateResult = database.updateDatabaseCell('task-1', 'task-owner', '契约测试')
    databaseRecordIpcContracts.updateCell.assertResponse(updateResult)

    const duplicate = database.duplicateDatabaseRecord('roadmap-db', 'task-1', 'task-contract-copy')
    databaseRecordIpcContracts.duplicateRecord.assertResponse(duplicate)
    const trashed = database.trashDatabaseRecords('roadmap-db', ['task-contract-copy'])
    databaseRecordIpcContracts.trashRecords.assertResponse(trashed)
    databaseRecordIpcContracts.listTrashedRecords.assertResponse(
      database.listTrashedDatabaseRecords('roadmap-db'),
    )
    databaseRecordIpcContracts.restoreRecords.assertResponse(
      database.restoreDatabaseRecords('roadmap-db', ['task-contract-copy']),
    )

    expect(
      databaseRecordIpcContracts.createRecord.assertResponse(
        database.createDatabaseRecord('roadmap-db', 'task-contract-new'),
      ),
    ).toBeUndefined()
  })

  it('validates persisted history, discussions, and reminders without SQLite columns leaking', () => {
    database = new WorkspaceDatabase(':memory:')
    database.updateDatabaseCell('task-1', 'task-owner', '契约测试')
    database.updateDatabaseRecordContent('task-1', '<p>契约正文</p>')
    const history = database.listDatabaseRecordHistory('task-1')
    databaseRecordIpcContracts.listRecordHistory.assertResponse(history)
    expect(history[0]).not.toHaveProperty('previousJson')
    databaseRecordIpcContracts.restoreRecordHistory.assertResponse(
      database.restoreDatabaseRecordHistory(history[0]!.id),
    )

    const comments = database.createDatabaseRecordComment({
      id: 'comment-contract',
      recordId: 'task-1',
      propertyId: 'task-owner',
      authorName: 'Lin',
      body: '请确认负责人。',
    })
    databaseRecordIpcContracts.createRecordComment.assertResponse(comments)
    databaseRecordIpcContracts.listRecordComments.assertResponse(
      database.listDatabaseRecordComments('task-1', true),
    )

    const reminders = database.saveDatabaseRecordReminder({
      id: 'reminder-contract',
      recordId: 'task-1',
      propertyId: 'task-due',
      dueAt: '2020-01-01T00:00:00.000Z',
      note: '已经到期',
    })
    databaseRecordIpcContracts.saveRecordReminder.assertResponse(reminders)
    databaseRecordIpcContracts.listRecordReminders.assertResponse(
      database.listDatabaseRecordReminders('task-1'),
    )
    databaseRecordIpcContracts.listDueRecordReminders.assertResponse(
      database.listDueDatabaseRecordReminders(),
    )
  })

  it('rejects response over-posting and non-void mutation results', () => {
    expect(() =>
      databaseRecordIpcContracts.updateCell.assertResponse({
        automationRuns: [],
        internalSql: 'hidden',
      }),
    ).toThrow(/fields/)
    expect(() => databaseRecordIpcContracts.deleteRecordComment.assertResponse(true)).toThrow(
      /must not return/,
    )
  })
})
