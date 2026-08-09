const { retrievalIpcContract } = require('./ipc-retrieval-contracts.cjs')
const { searchWorkspace } = require('./ipc-retrieval-service.cjs')

function registerRetrievalIpc(handleTrusted, database) {
  handleTrusted('retrieval:search', retrievalIpcContract, (_event, query, limit) =>
    searchWorkspace(database, query, limit),
  )
}

module.exports = { registerRetrievalIpc }
