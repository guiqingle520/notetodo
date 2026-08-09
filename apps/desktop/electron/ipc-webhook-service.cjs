const { randomBytes } = require('node:crypto')

/**
 * Keeps the one-time plaintext secret at the privileged boundary. Only the
 * encrypted bytes reach persistence; the Renderer receives plaintext once.
 */
function createWebhookEndpoint(options) {
  if (!options.safeStorageApi.isEncryptionAvailable()) {
    throw new Error('系统密钥库不可用，无法安全保存 Webhook 签名密钥。')
  }
  const secret = (options.createSecret ?? (() => randomBytes(32).toString('base64url')))()
  const encryptedSecret = options.safeStorageApi.encryptString(secret)
  const endpoint = options.database.createWebhookEndpoint(
    options.name,
    options.url,
    options.events,
    encryptedSecret,
  )
  return { ...endpoint, secret }
}

module.exports = { createWebhookEndpoint }
