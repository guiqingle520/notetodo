const { registerDatabaseRecordIpc } = require('./ipc-database-record-register.cjs')
const { registerDatabaseSchemaIpc } = require('./ipc-database-schema-register.cjs')
const { registerDatabaseViewIpc } = require('./ipc-database-view-register.cjs')

/** Keeps the application bootstrap independent from database channel details. */
function registerDatabaseIpc(options) {
  registerDatabaseSchemaIpc(options.handleTrusted, options.database)
  registerDatabaseRecordIpc(options.handleTrusted, options.database)
  registerDatabaseViewIpc(options)
}

module.exports = { registerDatabaseIpc }
