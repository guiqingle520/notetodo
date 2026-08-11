const {
  assertArgumentCount,
  assertFields,
  assertId,
  assertIdArray,
  assertNoArguments,
  assertPropertyValue,
  assertRequiredText,
  assertText,
  assertTimestamp,
  assertVoidResponse,
} = require('./ipc-database-values.cjs')
const {
  assertAutomationResult,
  assertDatabaseSnapshot,
  assertRecordComments,
  assertRecordHistory,
  assertRecordReminders,
  assertTrashRecords,
} = require('./ipc-database-responses.cjs')

function assertIds(args, count) {
  assertArgumentCount(args, count)
  args.forEach((id) => assertId(id))
}

function assertDatabaseAndRecordIds(args) {
  assertIds(args, 2)
}

function assertThreeIds(args) {
  assertIds(args, 3)
}

function assertRecordSelection(args) {
  assertArgumentCount(args, 2)
  assertId(args[0], 'database id')
  assertIdArray(args[1], { minimum: 1, maximum: 1_000, label: 'record ids' })
}

function assertUpdateCellRequest(args) {
  assertArgumentCount(args, 3)
  assertId(args[0], 'record id')
  assertId(args[1], 'property id')
  assertPropertyValue(args[2])
}

function assertUpdateContentRequest(args) {
  assertArgumentCount(args, 2)
  assertId(args[0], 'record id')
  assertText(args[1], 2_000_000, 'record content')
}

function assertListCommentsRequest(args) {
  assertArgumentCount(args, 1, 2)
  assertId(args[0], 'record id')
  if (args[1] !== undefined && typeof args[1] !== 'boolean') {
    throw new TypeError('Invalid database unresolved comment filter.')
  }
}

function assertCreateCommentRequest(args) {
  assertArgumentCount(args, 1)
  const comment = args[0]
  assertFields(
    comment,
    ['id', 'recordId', 'propertyId', 'authorName', 'body'],
    [],
    'record comment request',
  )
  assertId(comment.id, 'comment id')
  assertId(comment.recordId, 'comment record id')
  if (comment.propertyId !== null) assertId(comment.propertyId, 'comment property id')
  assertRequiredText(comment.authorName, 100, 'comment author name')
  assertText(comment.body, 10_000, 'comment body')
  if (!comment.body.trim()) throw new TypeError('Invalid database comment body.')
}

function assertBooleanMutationRequest(args, label) {
  assertArgumentCount(args, 2)
  assertId(args[0], `${label} id`)
  if (typeof args[1] !== 'boolean') throw new TypeError(`Invalid database ${label} state.`)
}

function assertResolveCommentRequest(args) {
  assertBooleanMutationRequest(args, 'comment resolution')
}

function assertSaveReminderRequest(args) {
  assertArgumentCount(args, 1)
  const reminder = args[0]
  assertFields(
    reminder,
    ['id', 'recordId', 'propertyId', 'dueAt', 'note'],
    [],
    'record reminder request',
  )
  assertId(reminder.id, 'reminder id')
  assertId(reminder.recordId, 'reminder record id')
  assertId(reminder.propertyId, 'reminder property id')
  assertTimestamp(reminder.dueAt, 'reminder due time')
  assertText(reminder.note, 500, 'reminder note')
}

function assertCompleteReminderRequest(args) {
  assertBooleanMutationRequest(args, 'reminder completion')
}

const oneIdRequest = (args) => assertIds(args, 1)
const snapshotResponse = assertDatabaseSnapshot
const voidResponse = assertVoidResponse

/** Runtime contracts for record lifecycle, discussions, and reminders. */
const databaseRecordIpcContracts = Object.freeze({
  updateCell: Object.freeze({
    assertRequest: assertUpdateCellRequest,
    assertResponse: assertAutomationResult,
  }),
  createRecord: Object.freeze({
    assertRequest: assertDatabaseAndRecordIds,
    assertResponse: voidResponse,
  }),
  duplicateRecord: Object.freeze({
    assertRequest: assertThreeIds,
    assertResponse: snapshotResponse,
  }),
  trashRecords: Object.freeze({
    assertRequest: assertRecordSelection,
    assertResponse: snapshotResponse,
  }),
  listTrashedRecords: Object.freeze({
    assertRequest: oneIdRequest,
    assertResponse: assertTrashRecords,
  }),
  restoreRecords: Object.freeze({
    assertRequest: assertRecordSelection,
    assertResponse: snapshotResponse,
  }),
  deleteRecordsPermanently: Object.freeze({
    assertRequest: assertRecordSelection,
    assertResponse: voidResponse,
  }),
  updateRecordContent: Object.freeze({
    assertRequest: assertUpdateContentRequest,
    assertResponse: voidResponse,
  }),
  listRecordHistory: Object.freeze({
    assertRequest: oneIdRequest,
    assertResponse: assertRecordHistory,
  }),
  restoreRecordHistory: Object.freeze({
    assertRequest: oneIdRequest,
    assertResponse: snapshotResponse,
  }),
  listRecordComments: Object.freeze({
    assertRequest: assertListCommentsRequest,
    assertResponse: assertRecordComments,
  }),
  createRecordComment: Object.freeze({
    assertRequest: assertCreateCommentRequest,
    assertResponse: assertRecordComments,
  }),
  resolveRecordComment: Object.freeze({
    assertRequest: assertResolveCommentRequest,
    assertResponse: voidResponse,
  }),
  deleteRecordComment: Object.freeze({
    assertRequest: oneIdRequest,
    assertResponse: voidResponse,
  }),
  listRecordReminders: Object.freeze({
    assertRequest: oneIdRequest,
    assertResponse: assertRecordReminders,
  }),
  listDueRecordReminders: Object.freeze({
    assertRequest: assertNoArguments,
    assertResponse: assertRecordReminders,
  }),
  saveRecordReminder: Object.freeze({
    assertRequest: assertSaveReminderRequest,
    assertResponse: assertRecordReminders,
  }),
  completeRecordReminder: Object.freeze({
    assertRequest: assertCompleteReminderRequest,
    assertResponse: voidResponse,
  }),
  deleteRecordReminder: Object.freeze({
    assertRequest: oneIdRequest,
    assertResponse: voidResponse,
  }),
})

module.exports = { databaseRecordIpcContracts }
