const { isAnyArrayBuffer, isArrayBufferView } = require('node:util').types

const MAX_IPC_DEPTH = 24
const MAX_IPC_COLLECTION_SIZE = 100_000

/**
 * Validates the common IPC envelope before channel-specific validators run.
 * Electron normally structured-clones values, but this guard also protects
 * direct tests and future transports from exotic prototypes or executable values.
 */
function assertIpcRequest(channel, args) {
  if (typeof channel !== 'string' || !/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/u.test(channel)) {
    throw new TypeError('IPC channel is invalid.')
  }
  if (!Array.isArray(args) || args.length > 20) throw new TypeError('IPC argument list is invalid.')
  assertIpcValue(args, 'request')
}

/** Ensures handler results remain structured-clone-safe before Electron serializes them. */
function assertIpcResponse(value) {
  assertIpcValue(value, 'response')
  return value
}

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError('This IPC channel does not accept arguments.')
}

function assertAppInfoResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid app information response.')
  }
  const keys = Object.keys(value)
  if (keys.length !== 2 || !keys.includes('version') || !keys.includes('platform')) {
    throw new TypeError('Invalid app information response fields.')
  }
  if (typeof value.version !== 'string' || value.version.length < 1 || value.version.length > 100) {
    throw new TypeError('Invalid app version response.')
  }
  if (typeof value.platform !== 'string' || value.platform.length < 1 || value.platform.length > 32) {
    throw new TypeError('Invalid app platform response.')
  }
}

// Contracts are colocated with transport guards so request and response rules
// cannot silently diverge between the main process and security wrapper.
const appInfoIpcContract = Object.freeze({
  assertRequest: assertNoArguments,
  assertResponse: assertAppInfoResponse,
})

function assertIpcValue(value, path, depth = 0, ancestors = new Set()) {
  if (depth > MAX_IPC_DEPTH) throw new TypeError(`${path} exceeds the IPC nesting limit.`)
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    typeof value === 'bigint'
  ) return
  if (typeof value === 'number') throw new TypeError(`${path} contains a non-finite number.`)
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(`${path} contains a non-serializable value.`)
  }
  if (isAnyArrayBuffer(value) || isArrayBufferView(value) || value instanceof Date) return
  if (typeof value !== 'object') throw new TypeError(`${path} contains an unsupported value.`)
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference.`)

  const nextAncestors = new Set(ancestors).add(value)
  if (Array.isArray(value)) {
    if (value.length > MAX_IPC_COLLECTION_SIZE) throw new TypeError(`${path} exceeds the IPC collection limit.`)
    value.forEach((item, index) => assertIpcValue(item, `${path}[${index}]`, depth + 1, nextAncestors))
    return
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} contains an unsupported object prototype.`)
  }
  const entries = Object.entries(value)
  if (entries.length > MAX_IPC_COLLECTION_SIZE) throw new TypeError(`${path} exceeds the IPC collection limit.`)
  for (const [key, item] of entries) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new TypeError(`${path} contains an unsafe property.`)
    }
    assertIpcValue(item, `${path}.${key}`, depth + 1, nextAncestors)
  }
}

module.exports = { appInfoIpcContract, assertIpcRequest, assertIpcResponse }
