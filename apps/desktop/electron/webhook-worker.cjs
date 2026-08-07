const https = require('node:https')
const dns = require('node:dns')
const { randomUUID } = require('node:crypto')
const { isPrivateNetworkAddress, signWebhook } = require('@notetodo/webhook-core')

class WebhookWorker {
  constructor(database, decryptSecret, options = {}) {
    this.database = database
    this.decryptSecret = decryptSecret
    this.workerId = options.workerId ?? randomUUID()
    this.transport = options.transport ?? postWebhook
    this.intervalMs = options.intervalMs ?? 2_000
    this.timer = null
    this.running = false
  }

  start() {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => { void this.tick() }, this.intervalMs)
    this.timer.unref()
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null }

  async tick() {
    if (this.running) return 0
    this.running = true
    try {
      const deliveries = this.database.claimWebhookDeliveries(this.workerId, 8)
      await Promise.all(deliveries.map((delivery) => this.deliver(delivery)))
      return deliveries.length
    } finally { this.running = false }
  }

  async deliver(delivery) {
    const startedAt = performance.now()
    try {
      const secret = this.decryptSecret(delivery.encryptedSecret)
      const timestamp = Math.floor(Date.now() / 1000)
      const result = await this.transport(delivery.url, delivery.payload, {
        'content-type': 'application/json; charset=utf-8',
        'user-agent': 'NoteTodo-Webhook/1.0',
        'x-notetodo-delivery': delivery.id,
        'x-notetodo-event': delivery.event,
        'x-notetodo-timestamp': String(timestamp),
        'x-notetodo-signature': signWebhook(secret, timestamp, delivery.payload),
      })
      return this.database.completeWebhookDelivery(delivery.id, this.workerId, { statusCode: result.statusCode, responsePreview: result.responsePreview, durationMs: performance.now() - startedAt })
    } catch (error) {
      return this.database.completeWebhookDelivery(delivery.id, this.workerId, { statusCode: null, errorMessage: error instanceof Error ? error.message : 'Webhook delivery failed.', durationMs: performance.now() - startedAt })
    }
  }
}

/** HTTPS transport pins the validated DNS result into the socket lookup. */
function postWebhook(url, body, headers) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'POST', headers: { ...headers, 'content-length': Buffer.byteLength(body) }, timeout: 10_000,
      lookup: (hostname, _options, callback) => dns.lookup(hostname, (error, address, family) => {
        if (error) return callback(error)
        if (isPrivateNetworkAddress(address)) return callback(new Error('Webhook DNS resolved to a private network address.'))
        callback(null, address, family)
      }),
    }, (response) => {
      const chunks = []; let size = 0
      response.on('data', (chunk) => { if (size < 2_000) { const slice = Buffer.from(chunk).subarray(0, 2_000 - size); chunks.push(slice); size += slice.length } })
      response.on('end', () => resolve({ statusCode: response.statusCode ?? 0, responsePreview: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('timeout', () => request.destroy(new Error('Webhook request timed out.')))
    request.on('error', reject)
    request.end(body)
  })
}

module.exports = { WebhookWorker, postWebhook }
