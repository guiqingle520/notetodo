const { databaseRecordIpcContracts } = require('./ipc-database-record-contracts.cjs')

/** Registers record-domain adapters while contracts own all transport validation. */
function registerDatabaseRecordIpc(handleTrusted, database) {
  const register = (channel, contract, listener) =>
    handleTrusted(`database:${channel}`, contract, listener)

  register(
    'update-cell',
    databaseRecordIpcContracts.updateCell,
    (_event, recordId, propertyId, value) =>
      database.updateDatabaseCell(recordId, propertyId, value),
  )
  register(
    'create-record',
    databaseRecordIpcContracts.createRecord,
    (_event, databaseId, recordId) => database.createDatabaseRecord(databaseId, recordId),
  )
  register(
    'duplicate-record',
    databaseRecordIpcContracts.duplicateRecord,
    (_event, databaseId, sourceRecordId, recordId) =>
      database.duplicateDatabaseRecord(databaseId, sourceRecordId, recordId),
  )
  register(
    'trash-records',
    databaseRecordIpcContracts.trashRecords,
    (_event, databaseId, recordIds) => database.trashDatabaseRecords(databaseId, recordIds),
  )
  register(
    'list-trashed-records',
    databaseRecordIpcContracts.listTrashedRecords,
    (_event, databaseId) => database.listTrashedDatabaseRecords(databaseId),
  )
  register(
    'restore-records',
    databaseRecordIpcContracts.restoreRecords,
    (_event, databaseId, recordIds) => database.restoreDatabaseRecords(databaseId, recordIds),
  )
  register(
    'delete-records-permanently',
    databaseRecordIpcContracts.deleteRecordsPermanently,
    (_event, databaseId, recordIds) =>
      database.deleteDatabaseRecordsPermanently(databaseId, recordIds),
  )
  register(
    'update-record-content',
    databaseRecordIpcContracts.updateRecordContent,
    (_event, recordId, content) => database.updateDatabaseRecordContent(recordId, content),
  )
  register(
    'list-record-history',
    databaseRecordIpcContracts.listRecordHistory,
    (_event, recordId) => database.listDatabaseRecordHistory(recordId),
  )
  register(
    'restore-record-history',
    databaseRecordIpcContracts.restoreRecordHistory,
    (_event, historyId) => database.restoreDatabaseRecordHistory(historyId),
  )
  register(
    'list-record-comments',
    databaseRecordIpcContracts.listRecordComments,
    (_event, recordId, unresolvedOnly) =>
      database.listDatabaseRecordComments(recordId, unresolvedOnly),
  )
  register(
    'create-record-comment',
    databaseRecordIpcContracts.createRecordComment,
    (_event, comment) => database.createDatabaseRecordComment(comment),
  )
  register(
    'resolve-record-comment',
    databaseRecordIpcContracts.resolveRecordComment,
    (_event, id, resolved) => database.resolveDatabaseRecordComment(id, resolved),
  )
  register('delete-record-comment', databaseRecordIpcContracts.deleteRecordComment, (_event, id) =>
    database.deleteDatabaseRecordComment(id),
  )
  register(
    'list-record-reminders',
    databaseRecordIpcContracts.listRecordReminders,
    (_event, recordId) => database.listDatabaseRecordReminders(recordId),
  )
  register('list-due-record-reminders', databaseRecordIpcContracts.listDueRecordReminders, () =>
    database.listDueDatabaseRecordReminders(),
  )
  register(
    'save-record-reminder',
    databaseRecordIpcContracts.saveRecordReminder,
    (_event, reminder) => database.saveDatabaseRecordReminder(reminder),
  )
  register(
    'complete-record-reminder',
    databaseRecordIpcContracts.completeRecordReminder,
    (_event, id, completed) => database.completeDatabaseRecordReminder(id, completed),
  )
  register(
    'delete-record-reminder',
    databaseRecordIpcContracts.deleteRecordReminder,
    (_event, id) => database.deleteDatabaseRecordReminder(id),
  )
}

module.exports = { registerDatabaseRecordIpc }
