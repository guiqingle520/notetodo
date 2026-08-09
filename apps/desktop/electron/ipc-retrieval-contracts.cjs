const MAX_RESULT_COUNT = 12

function assertRequest(args) {
  if (args.length < 1 || args.length > 2) {
    throw new TypeError('Retrieval search requires query and optional limit.')
  }
  if (typeof args[0] !== 'string' || args[0].length > 500) {
    throw new TypeError('Invalid retrieval query.')
  }
  if (
    args[1] !== undefined &&
    (!Number.isSafeInteger(args[1]) || args[1] < 1 || args[1] > MAX_RESULT_COUNT)
  ) {
    throw new TypeError('Retrieval limit must be between 1 and 12.')
  }
}

function assertText(value, maximumLength, label) {
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new TypeError(`Invalid retrieval ${label}.`)
  }
}

function assertCitation(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid retrieval citation.')
  }
  const fields = new Set([
    'citationId',
    'pageId',
    'chunkIndex',
    'title',
    'heading',
    'excerpt',
    'score',
  ])
  const keys = Object.keys(value)
  if (keys.length !== fields.size || keys.some((field) => !fields.has(field))) {
    throw new TypeError('Invalid retrieval citation fields.')
  }
  if (value.citationId !== `S${index + 1}`) {
    throw new TypeError('Retrieval citation ids must be ordered and contiguous.')
  }
  assertText(value.pageId, 128, 'page id')
  if (!value.pageId) throw new TypeError('Invalid retrieval page id.')
  if (!Number.isSafeInteger(value.chunkIndex) || value.chunkIndex < 0) {
    throw new TypeError('Invalid retrieval chunk index.')
  }
  assertText(value.title, 1_000, 'title')
  assertText(value.heading, 1_000, 'heading')
  assertText(value.excerpt, 900, 'excerpt')
  if (
    typeof value.score !== 'number' ||
    !Number.isFinite(value.score) ||
    value.score < 0 ||
    value.score > 1
  ) {
    throw new TypeError('Invalid retrieval score.')
  }
}

function assertResponse(value) {
  if (!Array.isArray(value) || value.length > MAX_RESULT_COUNT) {
    throw new TypeError('Invalid retrieval citation collection.')
  }
  value.forEach(assertCitation)
}

const retrievalIpcContract = Object.freeze({ assertRequest, assertResponse })

module.exports = { retrievalIpcContract }
