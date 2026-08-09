const { assertIpcResponse } = require('./ipc-contracts.cjs')

const MAX_ENTRY_COUNT = 50_000
const MAX_ENTRY_BYTES = 512 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024 * 1024
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024
const MAX_UNRESOLVED_LINKS = MAX_ARCHIVE_BYTES
const entryKinds = new Set(['page', 'database', 'asset', 'sitemap', 'unsupported'])
const issueCodes = new Set([
  'TOO_MANY_ENTRIES',
  'UNSAFE_PATH',
  'DUPLICATE_PATH',
  'ENTRY_TOO_LARGE',
  'ARCHIVE_TOO_LARGE',
])
const jobStatuses = new Set(['converting', 'committing', 'completed', 'failed', 'cancelled'])
const reportFields = new Set([
  'importedPages',
  'importedDatabases',
  'importedAssets',
  'skippedAssets',
  'unsupported',
  'unresolvedLinks',
])

function assertId(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/u.test(value)) {
    throw new TypeError(`Invalid import ${label}.`)
  }
}

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError('Import operation does not accept arguments.')
}

function assertStartRequest(args) {
  if (args.length !== 2) throw new TypeError('Import start requires import and request ids.')
  assertId(args[0], 'id')
  assertId(args[1], 'request id')
}

function assertCancelRequest(args) {
  if (args.length !== 1) throw new TypeError('Import cancellation requires one request id.')
  assertId(args[0], 'request id')
}

function assertExactFields(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Invalid import ${label}.`)
  }
  const keys = Object.keys(value)
  if (keys.length !== fields.size || keys.some((field) => !fields.has(field))) {
    throw new TypeError(`Invalid import ${label} fields.`)
  }
}

function assertSafeCount(value, label, maximum = MAX_ENTRY_COUNT) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`Invalid import ${label}.`)
  }
}

function assertArchivePath(value, label, allowUnsafe = false) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 16_384 ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError(`Invalid import ${label}.`)
  }
  if (
    !allowUnsafe &&
    (value.startsWith('/') ||
      value.includes('\\') ||
      /^[a-z]:/iu.test(value) ||
      value.split('/').some((segment) => !segment || segment === '.' || segment === '..'))
  ) {
    throw new TypeError(`Unsafe import ${label}.`)
  }
}

function assertSummary(value) {
  const fields = new Set(['page', 'database', 'asset', 'sitemap', 'unsupported'])
  assertExactFields(value, fields, 'summary')
  for (const field of fields) assertSafeCount(value[field], `summary ${field}`)
}

function assertEntry(value) {
  const fields = new Set(['path', 'kind', 'size'])
  assertExactFields(value, fields, 'entry')
  assertArchivePath(value.path, 'entry path')
  if (!entryKinds.has(value.kind)) throw new TypeError('Invalid import entry kind.')
  assertSafeCount(value.size, 'entry size', MAX_ENTRY_BYTES)
}

function assertIssue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid import issue.')
  }
  const allowedFields = new Set(['code', 'path', 'message'])
  const keys = Object.keys(value)
  if (
    !keys.includes('code') ||
    !keys.includes('message') ||
    keys.some((field) => !allowedFields.has(field))
  ) {
    throw new TypeError('Invalid import issue fields.')
  }
  if (!issueCodes.has(value.code)) throw new TypeError('Invalid import issue code.')
  if (value.path !== undefined) assertArchivePath(value.path, 'issue path', true)
  if (
    typeof value.message !== 'string' ||
    value.message.length < 1 ||
    value.message.length > 1_000
  ) {
    throw new TypeError('Invalid import issue message.')
  }
}

function assertInspection(value) {
  if (value === null) return
  const fields = new Set([
    'importId',
    'fileName',
    'compressedBytes',
    'acceptedBytes',
    'rejected',
    'summary',
    'entries',
    'issues',
  ])
  assertExactFields(value, fields, 'inspection')
  assertId(value.importId, 'id')
  if (
    typeof value.fileName !== 'string' ||
    value.fileName.length < 1 ||
    value.fileName.length > 255 ||
    /[\\/\p{Cc}]/u.test(value.fileName)
  ) {
    throw new TypeError('Invalid import archive name.')
  }
  assertSafeCount(value.compressedBytes, 'compressed bytes', MAX_SOURCE_BYTES)
  assertSafeCount(value.acceptedBytes, 'accepted bytes', MAX_ARCHIVE_BYTES)
  if (typeof value.rejected !== 'boolean') throw new TypeError('Invalid import rejection state.')
  assertSummary(value.summary)
  if (!Array.isArray(value.entries) || value.entries.length > MAX_ENTRY_COUNT) {
    throw new TypeError('Invalid import entry collection.')
  }
  value.entries.forEach(assertEntry)
  const uniquePaths = new Set(value.entries.map((entry) => entry.path.toLocaleLowerCase('en-US')))
  if (uniquePaths.size !== value.entries.length)
    throw new TypeError('Import entry paths must be unique.')
  if (value.entries.reduce((sum, entry) => sum + entry.size, 0) !== value.acceptedBytes) {
    throw new TypeError('Import accepted bytes do not match entries.')
  }
  if (
    [...entryKinds].some(
      (kind) => value.entries.filter((entry) => entry.kind === kind).length !== value.summary[kind],
    )
  ) {
    throw new TypeError('Import summary does not match entries.')
  }
  if (!Array.isArray(value.issues) || value.issues.length > MAX_ENTRY_COUNT + 1) {
    throw new TypeError('Invalid import issue collection.')
  }
  value.issues.forEach(assertIssue)
  if (value.rejected !== value.issues.length > 0) {
    throw new TypeError('Import rejection state does not match issues.')
  }
}

function assertReport(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid import report.')
  }
  const keys = Object.keys(value)
  if (keys.some((field) => !reportFields.has(field))) {
    throw new TypeError('Invalid import report fields.')
  }
  for (const field of keys) {
    const maximum = field === 'unresolvedLinks' ? MAX_UNRESOLVED_LINKS : MAX_ENTRY_COUNT
    assertSafeCount(value[field], `report ${field}`, maximum)
  }
}

function assertResult(value) {
  const fields = new Set(['rootPageId', 'pageCount', 'databaseCount', ...reportFields])
  assertExactFields(value, fields, 'result')
  assertId(value.rootPageId, 'root page id')
  for (const field of fields) {
    if (field !== 'rootPageId') {
      // A valid archive can contain MAX_ENTRY_COUNT imported pages in addition
      // to the synthetic root page created by import-core.
      const maximum =
        field === 'pageCount'
          ? MAX_ENTRY_COUNT + 1
          : field === 'unresolvedLinks'
            ? MAX_UNRESOLVED_LINKS
            : MAX_ENTRY_COUNT
      assertSafeCount(value[field], `result ${field}`, maximum)
    }
  }
  if (value.pageCount !== value.importedPages + 1) {
    throw new TypeError('Import page totals are inconsistent.')
  }
  if (value.databaseCount !== value.importedDatabases) {
    throw new TypeError('Import database totals are inconsistent.')
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid import ${label}.`)
  }
}

function assertJob(value) {
  const fields = new Set([
    'id',
    'sourceName',
    'status',
    'report',
    'errorMessage',
    'createdAt',
    'updatedAt',
  ])
  assertExactFields(value, fields, 'job')
  assertId(value.id, 'job id')
  if (
    typeof value.sourceName !== 'string' ||
    value.sourceName.length < 1 ||
    value.sourceName.length > 255 ||
    /[\\/\p{Cc}]/u.test(value.sourceName)
  ) {
    throw new TypeError('Invalid import job source name.')
  }
  if (!jobStatuses.has(value.status)) throw new TypeError('Invalid import job status.')
  assertReport(value.report)
  if (value.status === 'completed' && Object.keys(value.report).length !== reportFields.size) {
    throw new TypeError('Completed import job requires a complete report.')
  }
  if (
    value.errorMessage !== null &&
    (typeof value.errorMessage !== 'string' || value.errorMessage.length > 2_000)
  ) {
    throw new TypeError('Invalid import job error.')
  }
  assertTimestamp(value.createdAt, 'job creation time')
  assertTimestamp(value.updatedAt, 'job update time')
}

function assertJobList(value) {
  if (!Array.isArray(value) || value.length > 50) {
    throw new TypeError('Invalid import job collection.')
  }
  value.forEach(assertJob)
}

function assertImportProgress(value) {
  // Progress uses a dynamic channel and therefore bypasses handleTrusted's
  // normal response guard. Apply the same clone/prototype rules explicitly.
  assertIpcResponse(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid import progress event.')
  }
  const allowedFields = new Set(['phase', 'completed', 'total', 'path'])
  const keys = Object.keys(value)
  if (
    !keys.includes('phase') ||
    !keys.includes('completed') ||
    !keys.includes('total') ||
    keys.some((field) => !allowedFields.has(field))
  ) {
    throw new TypeError('Invalid import progress fields.')
  }
  if (!['convert', 'commit', 'done'].includes(value.phase)) {
    throw new TypeError('Invalid import progress phase.')
  }
  assertSafeCount(value.completed, 'progress completed')
  assertSafeCount(value.total, 'progress total')
  if (value.completed > value.total) throw new TypeError('Invalid import progress range.')
  if (value.path !== undefined) assertArchivePath(value.path, 'progress path')
  if (value.phase === 'convert' && value.path === undefined) {
    throw new TypeError('Conversion progress requires an archive path.')
  }
  if (value.phase !== 'convert' && value.path !== undefined) {
    throw new TypeError('Commit progress cannot contain an archive path.')
  }
}

const importIpcContracts = Object.freeze({
  pickAndInspect: Object.freeze({
    assertRequest: assertNoArguments,
    assertResponse: assertInspection,
  }),
  start: Object.freeze({ assertRequest: assertStartRequest, assertResponse: assertResult }),
  listJobs: Object.freeze({ assertRequest: assertNoArguments, assertResponse: assertJobList }),
  cancel: Object.freeze({ assertRequest: assertCancelRequest }),
})

module.exports = { assertImportProgress, importIpcContracts }
