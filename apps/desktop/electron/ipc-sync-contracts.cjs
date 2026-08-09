const MAX_UPDATE_BASE64_LENGTH = 2_000_000
const MAX_SNAPSHOT_BASE64_LENGTH = 20_000_000
const MAX_PENDING_UPDATES = 100_000

function assertId(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new TypeError(`Invalid sync ${label}.`)
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`Invalid sync ${label}.`)
}

function assertBase64(value, maxLength, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maxLength ||
    value.length % 4 !== 0 ||
    !/^[a-zA-Z0-9+/]+={0,2}$/u.test(value) ||
    Buffer.from(value, 'base64').toString('base64') !== value
  ) {
    throw new TypeError(`Invalid sync ${label}.`)
  }
}

function assertLoadRequest(args) {
  if (args.length !== 1) throw new TypeError('Sync load requires one page id.')
  assertId(args[0], 'page id')
}

function assertAppendRequest(args) {
  if (args.length !== 3) throw new TypeError('Sync append requires page, client, and update.')
  assertId(args[0], 'page id')
  assertId(args[1], 'client id')
  assertBase64(args[2], MAX_UPDATE_BASE64_LENGTH, 'update')
}

function assertCompactRequest(args) {
  if (args.length !== 3) throw new TypeError('Sync compaction requires page, snapshot, and cursor.')
  assertId(args[0], 'page id')
  assertBase64(args[1], MAX_SNAPSHOT_BASE64_LENGTH, 'snapshot')
  assertPositiveInteger(args[2], 'compaction cursor')
}

function assertAppendResponse(value) {
  assertPositiveInteger(value, 'update cursor')
}

function assertVoidResponse(value) {
  if (value !== undefined) throw new TypeError('Sync compaction returned an unexpected response.')
}

function assertLoadResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid sync document response.')
  }
  const keys = Object.keys(value)
  if (
    keys.length !== 3 ||
    !keys.includes('snapshot') ||
    !keys.includes('updates') ||
    !keys.includes('latestUpdateId')
  ) {
    throw new TypeError('Invalid sync document response fields.')
  }
  if (value.snapshot !== null) {
    assertBase64(value.snapshot, MAX_SNAPSHOT_BASE64_LENGTH, 'snapshot response')
  }
  if (!Array.isArray(value.updates) || value.updates.length > MAX_PENDING_UPDATES) {
    throw new TypeError('Invalid sync update collection.')
  }
  if (!Number.isSafeInteger(value.latestUpdateId) || value.latestUpdateId < 0) {
    throw new TypeError('Invalid latest sync cursor.')
  }

  let previousId = 0
  for (const update of value.updates) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw new TypeError('Invalid sync update response.')
    }
    const updateKeys = Object.keys(update)
    if (
      updateKeys.length !== 3 ||
      !updateKeys.includes('id') ||
      !updateKeys.includes('clientId') ||
      !updateKeys.includes('data')
    ) {
      throw new TypeError('Invalid sync update response fields.')
    }
    assertPositiveInteger(update.id, 'update cursor')
    if (update.id <= previousId || update.id > value.latestUpdateId) {
      throw new TypeError('Sync update cursors must be ordered and bounded.')
    }
    assertId(update.clientId, 'client id')
    assertBase64(update.data, MAX_UPDATE_BASE64_LENGTH, 'update response')
    previousId = update.id
  }
}

/** Runtime contracts for the complete persistent document sync IPC surface. */
const syncIpcContracts = Object.freeze({
  loadDocument: Object.freeze({
    assertRequest: assertLoadRequest,
    assertResponse: assertLoadResponse,
  }),
  appendUpdate: Object.freeze({
    assertRequest: assertAppendRequest,
    assertResponse: assertAppendResponse,
  }),
  compactDocument: Object.freeze({
    assertRequest: assertCompactRequest,
    assertResponse: assertVoidResponse,
  }),
})

module.exports = { syncIpcContracts }
