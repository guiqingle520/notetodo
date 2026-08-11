const { databaseSchemaIpcContracts } = require('./ipc-database-schema-contracts.cjs')

/** Registers schema IPC as thin adapters; contracts own validation and the database owns business rules. */
function registerDatabaseSchemaIpc(handleTrusted, database) {
  handleTrusted('database:load-by-page', databaseSchemaIpcContracts.loadByPage, (_event, pageId) =>
    database.loadDatabaseByPage(pageId),
  )
  handleTrusted(
    'database:create',
    databaseSchemaIpcContracts.create,
    (_event, pageId, databaseId, name) =>
      database.createDatabaseForPage(pageId, databaseId, name.trim()),
  )
  handleTrusted(
    'database:add-property',
    databaseSchemaIpcContracts.addProperty,
    (_event, databaseId, propertyId, name, type) =>
      database.addDatabaseProperty(databaseId, propertyId, name.trim(), type),
  )
  handleTrusted('database:list-sources', databaseSchemaIpcContracts.listSources, () =>
    database.listDatabaseSources(),
  )
  handleTrusted(
    'database:update-property-config',
    databaseSchemaIpcContracts.updatePropertyConfig,
    (_event, databaseId, propertyId, config) =>
      database.updateDatabasePropertyConfig(databaseId, propertyId, config),
  )
  handleTrusted('database:rename', databaseSchemaIpcContracts.rename, (_event, databaseId, name) =>
    database.renameDatabase(databaseId, name.trim()),
  )
  handleTrusted(
    'database:rename-property',
    databaseSchemaIpcContracts.renameProperty,
    (_event, databaseId, propertyId, name) =>
      database.renameDatabaseProperty(databaseId, propertyId, name.trim()),
  )
  handleTrusted(
    'database:reorder-properties',
    databaseSchemaIpcContracts.reorderProperties,
    (_event, databaseId, propertyIds) =>
      database.reorderDatabaseProperties(databaseId, propertyIds),
  )
  handleTrusted(
    'database:delete-property',
    databaseSchemaIpcContracts.deleteProperty,
    (_event, databaseId, propertyId) => database.deleteDatabaseProperty(databaseId, propertyId),
  )
}

module.exports = { registerDatabaseSchemaIpc }
