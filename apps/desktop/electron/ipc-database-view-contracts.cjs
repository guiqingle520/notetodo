const {
  assertArgumentCount,
  assertFields,
  assertId,
  assertIdArray,
  assertJsonLength,
  assertPropertyValue,
  assertPropertyValues,
  assertRequiredText,
  assertText,
  assertViewConfig,
  assertVoidResponse,
  viewTypes,
} = require('./ipc-database-values.cjs')
const {
  assertBooleanResponse,
  assertDatabaseSnapshot,
  assertTemplate,
} = require('./ipc-database-responses.cjs')

function assertIdPair(args) {
  assertArgumentCount(args, 2)
  assertId(args[0], 'database id')
  assertId(args[1], 'view or template id')
}

function assertUpdateViewConfigRequest(args) {
  assertArgumentCount(args, 3)
  assertId(args[0], 'database id')
  assertId(args[1], 'view id')
  assertViewConfig(args[2])
}

function assertCreateViewRequest(args) {
  assertArgumentCount(args, 5)
  assertId(args[0], 'database id')
  assertId(args[1], 'view id')
  assertRequiredText(args[2], 200, 'view name')
  if (!viewTypes.has(args[3])) throw new TypeError('Invalid database view type.')
  // Creation and update intentionally share one ceiling so an existing view
  // can always be duplicated without a transport-only incompatibility.
  assertViewConfig(args[4], { maximumJsonLength: 500_000 })
}

function assertRenameViewRequest(args) {
  assertArgumentCount(args, 3)
  assertId(args[0], 'database id')
  assertId(args[1], 'view id')
  assertRequiredText(args[2], 200, 'view name')
}

function assertBulkUpdateRequest(args) {
  assertArgumentCount(args, 4)
  assertId(args[0], 'database id')
  assertIdArray(args[1], { minimum: 1, maximum: 1_000, label: 'record ids' })
  assertId(args[2], 'property id')
  assertPropertyValue(args[3])
  assertJsonLength(args[3], 100_000, 'cell value')
}

function assertImportRecordsRequest(args) {
  assertArgumentCount(args, 2)
  assertId(args[0], 'database id')
  const records = args[1]
  if (!Array.isArray(records) || records.length < 1 || records.length > 10_000) {
    throw new TypeError('Database import requires between 1 and 10,000 records.')
  }
  const ids = new Set()
  for (const record of records) {
    assertFields(record, ['id', 'values'], [], 'import record')
    assertId(record.id, 'import record id')
    if (ids.has(record.id)) throw new TypeError('Database import record ids must be unique.')
    ids.add(record.id)
    assertPropertyValues(record.values)
  }
  assertJsonLength(records, 20_000_000, 'record import')
}

function assertSaveTemplateRequest(args) {
  assertArgumentCount(args, 2)
  assertId(args[0], 'database id')
  assertTemplate(args[1], args[0])
}

function assertCreateFromTemplateRequest(args) {
  assertArgumentCount(args, 3)
  assertId(args[0], 'database id')
  assertId(args[1], 'template id')
  assertId(args[2], 'record id')
}

function assertExportCsvRequest(args) {
  assertArgumentCount(args, 2)
  assertText(args[0], 200, 'CSV name')
  assertText(args[1], 20_000_000, 'CSV content')
}

const snapshotContract = (assertRequest) =>
  Object.freeze({ assertRequest, assertResponse: assertDatabaseSnapshot })
const voidContract = (assertRequest) =>
  Object.freeze({ assertRequest, assertResponse: assertVoidResponse })

const databaseViewIpcContracts = Object.freeze({
  setActiveView: voidContract(assertIdPair),
  updateViewConfig: voidContract(assertUpdateViewConfigRequest),
  createView: snapshotContract(assertCreateViewRequest),
  renameView: snapshotContract(assertRenameViewRequest),
  deleteView: snapshotContract(assertIdPair),
  setDefaultView: snapshotContract(assertIdPair),
  bulkUpdate: snapshotContract(assertBulkUpdateRequest),
  importRecords: snapshotContract(assertImportRecordsRequest),
  saveTemplate: snapshotContract(assertSaveTemplateRequest),
  deleteTemplate: snapshotContract(assertIdPair),
  createFromTemplate: snapshotContract(assertCreateFromTemplateRequest),
  exportCsv: Object.freeze({
    assertRequest: assertExportCsvRequest,
    assertResponse: assertBooleanResponse,
  }),
})

module.exports = { databaseViewIpcContracts }
