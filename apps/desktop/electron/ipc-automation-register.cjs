const { automationIpcContracts } = require('./ipc-automation-contracts.cjs')

/** Registers thin automation adapters; validation remains centralized in contracts. */
function registerAutomationIpc(handleTrusted, database) {
  handleTrusted('automations:list', automationIpcContracts.list, (_event, databaseId) =>
    database.listDatabaseAutomations(databaseId),
  )
  handleTrusted('automations:save', automationIpcContracts.save, (_event, databaseId, rule) =>
    database.saveDatabaseAutomation(databaseId, rule),
  )
  handleTrusted(
    'automations:set-enabled',
    automationIpcContracts.setEnabled,
    (_event, id, enabled) => database.setDatabaseAutomationEnabled(id, enabled),
  )
  handleTrusted('automations:list-runs', automationIpcContracts.listRuns, (_event, databaseId) =>
    database.listAutomationRuns(databaseId),
  )
  handleTrusted('automations:replay', automationIpcContracts.replay, (_event, runId) =>
    database.replayAutomationRun(runId),
  )
}

module.exports = { registerAutomationIpc }
