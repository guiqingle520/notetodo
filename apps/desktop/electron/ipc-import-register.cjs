const { importIpcContracts } = require('./ipc-import-contracts.cjs')
const { createImportIpcService } = require('./ipc-import-service.cjs')

function registerImportIpc(options) {
  const service = options.service ?? createImportIpcService(options)
  options.handleTrusted('import:pick-and-inspect', importIpcContracts.pickAndInspect, () =>
    service.pickAndInspect(),
  )
  options.handleTrusted('import:start', importIpcContracts.start, (event, importId, requestId) =>
    service.start(event, importId, requestId),
  )
  options.handleTrusted('import:list-jobs', importIpcContracts.listJobs, () => service.listJobs())
  options.onTrusted('import:cancel', importIpcContracts.cancel, (_event, requestId) =>
    service.cancel(requestId),
  )
  return service
}

module.exports = { registerImportIpc }
