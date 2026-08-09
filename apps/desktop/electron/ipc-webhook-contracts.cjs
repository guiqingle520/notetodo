const { WEBHOOK_EVENTS, validateWebhookUrl } = require('@notetodo/webhook-core')

const MAX_ENDPOINT_COUNT = 10_000
const MAX_DELIVERY_COUNT = 500
const webhookEventSet = new Set(WEBHOOK_EVENTS)
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError('Webhook endpoint list does not accept arguments.')
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new TypeError(`Invalid webhook ${label}.`)
  }
}

function assertName(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 100 ||
    value.trim() !== value ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError('Invalid webhook name.')
  }
}

function assertUrl(value) {
  if (typeof value !== 'string' || value.length > 2_048 || validateWebhookUrl(value) !== value) {
    throw new TypeError('Invalid canonical webhook URL.')
  }
}

function assertEvents(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > WEBHOOK_EVENTS.length ||
    new Set(value).size !== value.length ||
    value.some((event) => typeof event !== 'string' || !webhookEventSet.has(event))
  ) {
    throw new TypeError('Invalid webhook events.')
  }
}

function assertCreateRequest(args) {
  if (args.length !== 3) throw new TypeError('Webhook creation requires name, URL, and events.')
  assertName(args[0])
  if (typeof args[1] !== 'string' || args[1].length > 2_048) {
    throw new TypeError('Invalid webhook URL.')
  }
  validateWebhookUrl(args[1])
  assertEvents(args[2])
}

function assertSetActiveRequest(args) {
  if (args.length !== 2) throw new TypeError('Webhook state update requires id and state.')
  assertUuid(args[0], 'endpoint id')
  if (typeof args[1] !== 'boolean') throw new TypeError('Invalid webhook state.')
}

function assertDeliveriesRequest(args) {
  if (args.length !== 1) throw new TypeError('Webhook delivery list requires one endpoint id.')
  assertUuid(args[0], 'endpoint id')
}

function assertTimestamp(value, label, nullable = false) {
  if (nullable && value === null) return
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid webhook ${label}.`)
  }
}

function assertEndpointFields(value, expectedFields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid webhook endpoint response.')
  }
  const keys = Object.keys(value)
  if (keys.length !== expectedFields.size || keys.some((field) => !expectedFields.has(field))) {
    throw new TypeError('Invalid webhook endpoint response fields.')
  }
  assertUuid(value.id, 'endpoint id')
  assertName(value.name)
  assertUrl(value.url)
  assertEvents(value.events)
  if (typeof value.active !== 'boolean') throw new TypeError('Invalid webhook active state.')
  assertTimestamp(value.createdAt, 'creation time')
  assertTimestamp(value.updatedAt, 'update time')
}

function assertStoredEndpoint(value) {
  const fields = new Set([
    'id',
    'name',
    'url',
    'events',
    'active',
    'createdAt',
    'updatedAt',
    'pendingCount',
    'deadCount',
  ])
  assertEndpointFields(value, fields)
  for (const field of ['pendingCount', 'deadCount']) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      throw new TypeError(`Invalid webhook ${field}.`)
    }
  }
}

function assertEndpointList(value) {
  if (!Array.isArray(value) || value.length > MAX_ENDPOINT_COUNT) {
    throw new TypeError('Invalid webhook endpoint collection.')
  }
  value.forEach(assertStoredEndpoint)
}

function assertCreatedEndpoint(value) {
  const fields = new Set([
    'id',
    'name',
    'url',
    'events',
    'active',
    'createdAt',
    'updatedAt',
    'secret',
  ])
  assertEndpointFields(value, fields)
  if (typeof value.secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value.secret)) {
    throw new TypeError('Invalid one-time webhook secret.')
  }
}

function assertDelivery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid webhook delivery response.')
  }
  const fields = new Set([
    'id',
    'endpointId',
    'event',
    'status',
    'attempts',
    'nextAttemptAt',
    'lastError',
    'createdAt',
    'deliveredAt',
  ])
  const keys = Object.keys(value)
  if (keys.length !== fields.size || keys.some((field) => !fields.has(field))) {
    throw new TypeError('Invalid webhook delivery response fields.')
  }
  assertUuid(value.id, 'delivery id')
  assertUuid(value.endpointId, 'delivery endpoint id')
  if (!webhookEventSet.has(value.event)) throw new TypeError('Invalid webhook delivery event.')
  if (!['pending', 'leased', 'delivered', 'dead'].includes(value.status)) {
    throw new TypeError('Invalid webhook delivery status.')
  }
  if (!Number.isSafeInteger(value.attempts) || value.attempts < 0 || value.attempts > 8) {
    throw new TypeError('Invalid webhook delivery attempt count.')
  }
  assertTimestamp(value.nextAttemptAt, 'next attempt time')
  if (
    value.lastError !== null &&
    (typeof value.lastError !== 'string' || value.lastError.length > 2_000)
  ) {
    throw new TypeError('Invalid webhook delivery error.')
  }
  assertTimestamp(value.createdAt, 'delivery creation time')
  assertTimestamp(value.deliveredAt, 'delivery completion time', true)
}

function assertDeliveryList(value) {
  if (!Array.isArray(value) || value.length > MAX_DELIVERY_COUNT) {
    throw new TypeError('Invalid webhook delivery collection.')
  }
  value.forEach(assertDelivery)
}

function assertBooleanResponse(value) {
  if (typeof value !== 'boolean') throw new TypeError('Invalid webhook mutation response.')
}

const webhookIpcContracts = Object.freeze({
  list: Object.freeze({ assertRequest: assertNoArguments, assertResponse: assertEndpointList }),
  create: Object.freeze({
    assertRequest: assertCreateRequest,
    assertResponse: assertCreatedEndpoint,
  }),
  setActive: Object.freeze({
    assertRequest: assertSetActiveRequest,
    assertResponse: assertBooleanResponse,
  }),
  listDeliveries: Object.freeze({
    assertRequest: assertDeliveriesRequest,
    assertResponse: assertDeliveryList,
  }),
})

module.exports = { webhookIpcContracts }
