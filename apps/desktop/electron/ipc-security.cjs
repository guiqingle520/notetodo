const { pathToFileURL } = require('node:url')
const { assertIpcRequest, assertIpcResponse } = require('./ipc-contracts.cjs')

/**
 * Creates an IPC registrar that rejects messages from every frame except the
 * packaged renderer entry or the fixed local Vite origin. Validation occurs
 * before argument parsing so compromised subframes cannot reach handlers.
 */
function createTrustedFrameValidator(options) {
  const packagedRendererUrl = new URL(pathToFileURL(options.packagedRendererPath).href)
  const developmentOrigin = new URL(options.developmentUrl).origin

  return function isTrustedFrame(frameUrl) {
    if (typeof frameUrl !== 'string') return false
    try {
      const parsed = new URL(frameUrl)
      if (options.isDevelopment) return parsed.origin === developmentOrigin
      return (
        parsed.protocol === 'file:' &&
        parsed.host === packagedRendererUrl.host &&
        decodeURIComponent(parsed.pathname) === decodeURIComponent(packagedRendererUrl.pathname)
      )
    } catch {
      return false
    }
  }
}

function createTrustedIpcHandler(ipcMain, options) {
  const isTrustedFrame = createTrustedFrameValidator(options)

  return function handleTrusted(channel, listener) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!isTrustedFrame(event.senderFrame?.url)) throw new Error('IPC sender is not trusted.')
      assertIpcRequest(channel, args)
      const result = listener(event, ...args)
      if (result && typeof result.then === 'function') {
        return result.then(assertIpcResponse)
      }
      return assertIpcResponse(result)
    })
  }
}

function createTrustedIpcListener(ipcMain, options) {
  const isTrustedFrame = createTrustedFrameValidator(options)
  return function onTrusted(channel, listener) {
    ipcMain.on(channel, (event, ...args) => {
      if (!isTrustedFrame(event.senderFrame?.url)) return
      assertIpcRequest(channel, args)
      listener(event, ...args)
    })
  }
}

module.exports = { createTrustedIpcHandler, createTrustedIpcListener }
