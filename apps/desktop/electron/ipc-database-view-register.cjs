const fs = require('node:fs')
const { databaseViewIpcContracts } = require('./ipc-database-view-contracts.cjs')
const { createDatabaseCsvExporter } = require('./ipc-database-export-service.cjs')

function registerDatabaseViewIpc(options) {
  const register = options.handleTrusted
  const database = options.database
  const exportCsv =
    options.exportCsv ??
    createDatabaseCsvExporter({
      dialogApi: options.dialogApi,
      fileSystem: options.fileSystem ?? fs.promises,
    })

  register(
    'database:set-active-view',
    databaseViewIpcContracts.setActiveView,
    (_event, databaseId, viewId) => database.setActiveDatabaseView(databaseId, viewId),
  )
  register(
    'database:update-view-config',
    databaseViewIpcContracts.updateViewConfig,
    (_event, databaseId, viewId, config) =>
      database.updateDatabaseViewConfig(databaseId, viewId, config),
  )
  register(
    'database:create-view',
    databaseViewIpcContracts.createView,
    (_event, databaseId, viewId, name, type, config) =>
      database.createDatabaseView(databaseId, viewId, name.trim(), type, config),
  )
  register(
    'database:rename-view',
    databaseViewIpcContracts.renameView,
    (_event, databaseId, viewId, name) =>
      database.renameDatabaseView(databaseId, viewId, name.trim()),
  )
  register(
    'database:delete-view',
    databaseViewIpcContracts.deleteView,
    (_event, databaseId, viewId) => database.deleteDatabaseView(databaseId, viewId),
  )
  register(
    'database:set-default-view',
    databaseViewIpcContracts.setDefaultView,
    (_event, databaseId, viewId) => database.setDefaultDatabaseView(databaseId, viewId),
  )
  register(
    'database:bulk-update',
    databaseViewIpcContracts.bulkUpdate,
    (_event, databaseId, recordIds, propertyId, value) =>
      database.bulkUpdateDatabaseRecords(databaseId, recordIds, propertyId, value),
  )
  register(
    'database:import-records',
    databaseViewIpcContracts.importRecords,
    (_event, databaseId, records) => database.importDatabaseRecords(databaseId, records),
  )
  register(
    'database:save-template',
    databaseViewIpcContracts.saveTemplate,
    (_event, databaseId, template) =>
      database.saveDatabaseTemplate(databaseId, { ...template, name: template.name.trim() }),
  )
  register(
    'database:delete-template',
    databaseViewIpcContracts.deleteTemplate,
    (_event, databaseId, templateId) => database.deleteDatabaseTemplate(databaseId, templateId),
  )
  register(
    'database:create-from-template',
    databaseViewIpcContracts.createFromTemplate,
    (_event, databaseId, templateId, recordId) =>
      database.createDatabaseRecordFromTemplate(databaseId, templateId, recordId),
  )
  register(
    'database:export-csv',
    databaseViewIpcContracts.exportCsv,
    (_event, suggestedName, csv) => exportCsv(suggestedName, csv),
  )
}

module.exports = { registerDatabaseViewIpc }
