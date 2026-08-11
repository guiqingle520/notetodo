// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerDatabaseRecordIpc } =
  require('../../electron/ipc-database-record-register.cjs') as {
    registerDatabaseRecordIpc(
      register: (
        channel: string,
        contract: unknown,
        listener: (...args: unknown[]) => unknown,
      ) => void,
      database: Record<string, (...args: unknown[]) => unknown>,
    ): void
  }

const expectedChannels = [
  'database:update-cell',
  'database:create-record',
  'database:duplicate-record',
  'database:trash-records',
  'database:list-trashed-records',
  'database:restore-records',
  'database:delete-records-permanently',
  'database:update-record-content',
  'database:list-record-history',
  'database:restore-record-history',
  'database:list-record-comments',
  'database:create-record-comment',
  'database:resolve-record-comment',
  'database:delete-record-comment',
  'database:list-record-reminders',
  'database:list-due-record-reminders',
  'database:save-record-reminder',
  'database:complete-record-reminder',
  'database:delete-record-reminder',
]

describe('database record IPC registration', () => {
  it('registers all record channels with contracts and transparent adapters', () => {
    const registrations = new Map<
      string,
      { contract: unknown; listener: (...args: unknown[]) => unknown }
    >()
    const snapshot = { schema: { id: 'database-1' } }
    const automationResult = { automationRuns: ['run-1'] }
    const database = {
      updateDatabaseCell: vi.fn(() => automationResult),
      createDatabaseRecord: vi.fn(),
      duplicateDatabaseRecord: vi.fn(() => snapshot),
      trashDatabaseRecords: vi.fn(() => snapshot),
      listTrashedDatabaseRecords: vi.fn(() => []),
      restoreDatabaseRecords: vi.fn(() => snapshot),
      deleteDatabaseRecordsPermanently: vi.fn(),
      updateDatabaseRecordContent: vi.fn(),
      listDatabaseRecordHistory: vi.fn(() => []),
      restoreDatabaseRecordHistory: vi.fn(() => snapshot),
      listDatabaseRecordComments: vi.fn(() => []),
      createDatabaseRecordComment: vi.fn(() => []),
      resolveDatabaseRecordComment: vi.fn(),
      deleteDatabaseRecordComment: vi.fn(),
      listDatabaseRecordReminders: vi.fn(() => []),
      listDueDatabaseRecordReminders: vi.fn(() => []),
      saveDatabaseRecordReminder: vi.fn(() => []),
      completeDatabaseRecordReminder: vi.fn(),
      deleteDatabaseRecordReminder: vi.fn(),
    }
    registerDatabaseRecordIpc((channel, contract, listener) => {
      registrations.set(channel, { contract, listener })
    }, database)

    expect([...registrations.keys()]).toEqual(expectedChannels)
    for (const registration of registrations.values()) {
      expect(registration.contract).toMatchObject({
        assertRequest: expect.any(Function),
        assertResponse: expect.any(Function),
      })
    }

    const event = {}
    expect(
      registrations.get('database:update-cell')?.listener(event, 'record-1', 'property-1', 3),
    ).toBe(automationResult)
    expect(database.updateDatabaseCell).toHaveBeenCalledWith('record-1', 'property-1', 3)

    registrations.get('database:list-record-comments')?.listener(event, 'record-1', false)
    expect(database.listDatabaseRecordComments).toHaveBeenCalledWith('record-1', false)
    registrations.get('database:resolve-record-comment')?.listener(event, 'comment-1', false)
    expect(database.resolveDatabaseRecordComment).toHaveBeenCalledWith('comment-1', false)

    const comment = {
      id: 'comment-1',
      recordId: 'record-1',
      propertyId: null,
      authorName: 'Lin',
      body: '请确认',
    }
    registrations.get('database:create-record-comment')?.listener(event, comment)
    expect(database.createDatabaseRecordComment).toHaveBeenCalledWith(comment)

    const reminder = {
      id: 'reminder-1',
      recordId: 'record-1',
      propertyId: 'due',
      dueAt: '2026-08-10T09:00:00.000Z',
      note: '',
    }
    registrations.get('database:save-record-reminder')?.listener(event, reminder)
    expect(database.saveDatabaseRecordReminder).toHaveBeenCalledWith(reminder)
    registrations.get('database:complete-record-reminder')?.listener(event, 'reminder-1', false)
    expect(database.completeDatabaseRecordReminder).toHaveBeenCalledWith('reminder-1', false)
  })
})
