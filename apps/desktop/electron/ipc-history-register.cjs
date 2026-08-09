const { historyIpcContracts } = require('./ipc-history-contracts.cjs')
const { restorePageVersion } = require('./ipc-history-service.cjs')

/** Registers page-history adapters after source and payload validation. */
function registerHistoryIpc(handleTrusted, database) {
  handleTrusted('history:list', historyIpcContracts.list, (_event, pageId) =>
    database.listPageVersions(pageId),
  )
  handleTrusted('history:get', historyIpcContracts.get, (_event, pageId, versionId) =>
    database.getPageVersion(pageId, versionId),
  )
  handleTrusted('history:restore', historyIpcContracts.restore, (_event, pageId, versionId) =>
    restorePageVersion(database, pageId, versionId),
  )
}

module.exports = { registerHistoryIpc }
