const {
  assertArgumentCount,
  assertId,
  assertIdArray,
  assertNoArguments,
  assertPropertyConfig,
  assertRequiredText,
  writablePropertyTypes,
} = require('./ipc-database-values.cjs')
const {
  assertDatabaseSnapshot,
  assertSnapshotOrNull,
  assertSourceList,
} = require('./ipc-database-responses.cjs')

function assertIdRequest(args, label) {
  assertArgumentCount(args, 1)
  assertId(args[0], label)
}

function assertCreateRequest(args) {
  assertArgumentCount(args, 3)
  assertId(args[0], 'page id')
  assertId(args[1], 'schema id')
  assertRequiredText(args[2], 200, 'schema name')
}

function assertAddPropertyRequest(args) {
  assertArgumentCount(args, 4)
  assertId(args[0], 'schema id')
  assertId(args[1], 'property id')
  assertRequiredText(args[2], 100, 'property name')
  // Every database already owns one title property. Allowing another title
  // would produce snapshots the editor and persistence layer cannot reconcile.
  if (!writablePropertyTypes.has(args[3])) {
    throw new TypeError('Invalid database writable property type.')
  }
}

function assertPropertyConfigRequest(args) {
  assertArgumentCount(args, 3)
  assertId(args[0], 'schema id')
  assertId(args[1], 'property id')
  assertPropertyConfig(args[2], { maximumJsonLength: 50_000 })
}

function assertRenameRequest(args, target, maximumLength) {
  assertArgumentCount(args, target === 'schema' ? 2 : 3)
  assertId(args[0], 'schema id')
  if (target === 'property') assertId(args[1], 'property id')
  assertRequiredText(args.at(-1), maximumLength, `${target} name`)
}

function assertReorderPropertiesRequest(args) {
  assertArgumentCount(args, 2)
  assertId(args[0], 'schema id')
  // The renderer caps schemas at 50 properties. Requiring a non-empty,
  // duplicate-free permutation prevents partial or ambiguous reorder writes.
  assertIdArray(args[1], { minimum: 1, maximum: 50, label: 'property order' })
}

function assertDeletePropertyRequest(args) {
  assertArgumentCount(args, 2)
  assertId(args[0], 'schema id')
  assertId(args[1], 'property id')
}

const databaseSchemaIpcContracts = Object.freeze({
  loadByPage: Object.freeze({
    assertRequest: (args) => assertIdRequest(args, 'page id'),
    assertResponse: assertSnapshotOrNull,
  }),
  create: Object.freeze({
    assertRequest: assertCreateRequest,
    assertResponse: assertDatabaseSnapshot,
  }),
  addProperty: Object.freeze({
    assertRequest: assertAddPropertyRequest,
    assertResponse: assertDatabaseSnapshot,
  }),
  listSources: Object.freeze({
    assertRequest: assertNoArguments,
    assertResponse: assertSourceList,
  }),
  updatePropertyConfig: Object.freeze({
    assertRequest: assertPropertyConfigRequest,
    assertResponse: assertDatabaseSnapshot,
  }),
  rename: Object.freeze({
    assertRequest: (args) => assertRenameRequest(args, 'schema', 200),
    assertResponse: assertDatabaseSnapshot,
  }),
  renameProperty: Object.freeze({
    assertRequest: (args) => assertRenameRequest(args, 'property', 100),
    assertResponse: assertDatabaseSnapshot,
  }),
  reorderProperties: Object.freeze({
    assertRequest: assertReorderPropertiesRequest,
    assertResponse: assertDatabaseSnapshot,
  }),
  deleteProperty: Object.freeze({
    assertRequest: assertDeletePropertyRequest,
    assertResponse: assertDatabaseSnapshot,
  }),
})

module.exports = { databaseSchemaIpcContracts }
