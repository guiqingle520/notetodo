const { assertWorkspacePage } = require('./ipc-workspace-contracts.cjs')

const MAX_VERSION_COUNT = 200
const MAX_PAGE_CONTENT_LENGTH = 20_000_000

function assertPageId(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 128 ||
    value.trim() !== value ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError('Invalid history page id.')
  }
}

function assertVersionId(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('Invalid history version id.')
  }
}

function assertTimestamp(value) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError('Invalid history timestamp.')
  }
}

function assertReason(value) {
  if (!['autosave', 'restore'].includes(value)) throw new TypeError('Invalid history reason.')
}

function assertTitle(value) {
  if (typeof value !== 'string' || value.length > 1_000) {
    throw new TypeError('Invalid history page title.')
  }
}

function assertListRequest(args) {
  if (args.length !== 1) throw new TypeError('History list requires one page id.')
  assertPageId(args[0])
}

function assertVersionRequest(args) {
  if (args.length !== 2) throw new TypeError('History operation requires page and version ids.')
  assertPageId(args[0])
  assertVersionId(args[1])
}

function assertExactFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Invalid history ${label}.`)
  }
  const keys = Object.keys(value)
  if (keys.length !== fields.size || keys.some((field) => !fields.has(field))) {
    throw new TypeError(`Invalid history ${label} fields.`)
  }
}

function assertSummary(value) {
  const fields = new Set([
    'id',
    'pageId',
    'title',
    'reason',
    'createdAt',
    'contentLength',
    'preview',
  ])
  assertExactFields(value, fields, 'summary')
  assertVersionId(value.id)
  assertPageId(value.pageId)
  assertTitle(value.title)
  assertReason(value.reason)
  assertTimestamp(value.createdAt)
  if (
    !Number.isSafeInteger(value.contentLength) ||
    value.contentLength < 0 ||
    value.contentLength > MAX_PAGE_CONTENT_LENGTH
  ) {
    throw new TypeError('Invalid history content length.')
  }
  if (typeof value.preview !== 'string' || value.preview.length > 500) {
    throw new TypeError('Invalid history preview.')
  }
}

function assertSummaryList(value) {
  if (!Array.isArray(value) || value.length > MAX_VERSION_COUNT) {
    throw new TypeError('Invalid history summary collection.')
  }
  value.forEach(assertSummary)
}

function assertDetail(value) {
  if (value === null) return
  const fields = new Set(['id', 'pageId', 'title', 'content', 'reason', 'createdAt'])
  assertExactFields(value, fields, 'detail')
  assertVersionId(value.id)
  assertPageId(value.pageId)
  assertTitle(value.title)
  if (typeof value.content !== 'string' || value.content.length > MAX_PAGE_CONTENT_LENGTH) {
    throw new TypeError('Invalid history page content.')
  }
  assertReason(value.reason)
  assertTimestamp(value.createdAt)
}

const historyIpcContracts = Object.freeze({
  list: Object.freeze({ assertRequest: assertListRequest, assertResponse: assertSummaryList }),
  get: Object.freeze({ assertRequest: assertVersionRequest, assertResponse: assertDetail }),
  restore: Object.freeze({
    assertRequest: assertVersionRequest,
    assertResponse: assertWorkspacePage,
  }),
})

module.exports = { historyIpcContracts }
