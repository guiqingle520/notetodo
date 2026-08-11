const { registerDatabaseRecordIpc } = require('./ipc-database-record-register.cjs')
const { registerDatabaseSchemaIpc } = require('./ipc-database-schema-register.cjs')
const { registerDatabaseViewIpc } = require('./ipc-database-view-register.cjs')
const { createDatabaseAccessService } = require('./ipc-database-access-service.cjs')

/** Keeps the application bootstrap independent from database channel details. */
function registerDatabaseIpc(options) {
  const database = options.databaseService ?? createDatabaseAccessService(options.database)
  registerDatabaseSchemaIpc(options.handleTrusted, database)
  registerDatabaseRecordIpc(options.handleTrusted, database)
  registerDatabaseViewIpc({ ...options, database })
}

module.exports = { registerDatabaseIpc }
