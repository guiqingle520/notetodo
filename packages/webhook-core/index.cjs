const { createHmac, timingSafeEqual } = require('node:crypto')

const WEBHOOK_EVENTS = Object.freeze([
  'page.created', 'page.updated', 'page.archived',
  'database.record.created', 'database.record.updated',
])
const RETRY_DELAYS_MS = Object.freeze([5_000, 30_000, 120_000, 600_000, 3_600_000, 3_600_000, 3_600_000])

function stableJson(value) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

function createWebhookEnvelope(event, deliveryId, occurredAt, data) {
  if (!WEBHOOK_EVENTS.includes(event)) throw new TypeError('Unsupported webhook event.')
  if (typeof deliveryId !== 'string' || deliveryId.length < 1 || deliveryId.length > 128) throw new TypeError('Invalid delivery id.')
  if (!Number.isFinite(Date.parse(occurredAt))) throw new TypeError('Invalid webhook occurrence time.')
  return { apiVersion: '2026-08-01', deliveryId, event, occurredAt, data }
}

function signWebhook(secret, timestamp, body) {
  if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('Webhook secret must contain at least 32 characters.')
  if (!/^\d{10,13}$/u.test(String(timestamp))) throw new TypeError('Webhook timestamp is invalid.')
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')}`
}

function verifyWebhookSignature(secret, timestamp, body, signature, now = Date.now(), toleranceMs = 300_000) {
  try {
    const timestampMs = String(timestamp).length === 10 ? Number(timestamp) * 1000 : Number(timestamp)
    if (Math.abs(now - timestampMs) > toleranceMs) return false
    const expected = Buffer.from(signWebhook(secret, timestamp, body).slice(3), 'hex')
    const candidate = Buffer.from(String(signature).replace(/^v1=/u, ''), 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch { return false }
}

function nextWebhookAttempt(attemptNumber, now = Date.now()) {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new TypeError('Attempt number must be positive.')
  const delay = RETRY_DELAYS_MS[Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1)]
  return new Date(now + delay).toISOString()
}

function validateWebhookUrl(input) {
  let url
  try { url = new URL(input) } catch { throw new TypeError('Webhook URL is invalid.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new TypeError('Webhook URL must use HTTPS without credentials or a custom port.')
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isPrivateNetworkAddress(hostname)) throw new TypeError('Webhook URL cannot target a private network.')
  url.hash = ''
  return url.toString()
}

function isPrivateNetworkAddress(value) {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(value)
  if (ipv4) {
    const bytes = ipv4.slice(1).map(Number)
    if (bytes.some((byte) => byte > 255)) return true
    return bytes[0] === 10 || bytes[0] === 127 || bytes[0] === 0 || (bytes[0] === 169 && bytes[1] === 254) || (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) || (bytes[0] === 192 && bytes[1] === 168)
  }
  return value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')
}

module.exports = { WEBHOOK_EVENTS, createWebhookEnvelope, isPrivateNetworkAddress, nextWebhookAttempt, signWebhook, stableJson, validateWebhookUrl, verifyWebhookSignature }
