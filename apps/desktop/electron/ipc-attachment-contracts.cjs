const path = require('node:path')
const { isAnyArrayBuffer } = require('node:util').types

const MAX_ATTACHMENT_BYTES = 250 * 1024 * 1024
const MAX_MEMORY_ATTACHMENT_BYTES = 25 * 1024 * 1024
const MAX_MEMORY_BATCH_BYTES = 100 * 1024 * 1024
const MAX_ATTACHMENT_COUNT = 20
const hashPattern = /^[0-9a-f]{64}$/u

function assertId(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new TypeError(`Invalid attachment ${label}.`)
  }
}

function assertRequestId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/u.test(value)) {
    throw new TypeError('Invalid attachment request id.')
  }
}

function assertDisplayName(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 240 ||
    value === '.' ||
    value === '..' ||
    /[\\/\p{Cc}]/u.test(value)
  ) {
    throw new TypeError('Invalid attachment display name.')
  }
}

function assertPickRequest(args) {
  if (args.length !== 3)
    throw new TypeError('Attachment picker requires page, kind, and request id.')
  assertId(args[0], 'page id')
  if (!['image', 'file'].includes(args[1])) throw new TypeError('Invalid attachment kind.')
  assertRequestId(args[2])
}

function assertDroppedRequest(args) {
  if (args.length !== 3) throw new TypeError('Dropped attachment request is incomplete.')
  assertId(args[0], 'page id')
  if (
    !Array.isArray(args[1]) ||
    args[1].length < 1 ||
    args[1].length > MAX_ATTACHMENT_COUNT ||
    args[1].some(
      (filePath) =>
        typeof filePath !== 'string' || filePath.length > 32_768 || !path.isAbsolute(filePath),
    )
  ) {
    throw new TypeError('Invalid dropped attachment paths.')
  }
  assertRequestId(args[2])
}

function assertMemoryRequest(args) {
  if (args.length !== 3) throw new TypeError('Memory attachment request is incomplete.')
  assertId(args[0], 'page id')
  if (!Array.isArray(args[1]) || args[1].length < 1 || args[1].length > MAX_ATTACHMENT_COUNT) {
    throw new TypeError('Invalid memory attachment selection.')
  }

  let totalBytes = 0
  for (const item of args[1]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Invalid memory attachment.')
    }
    const keys = Object.keys(item)
    if (keys.length !== 2 || !keys.includes('name') || !keys.includes('data')) {
      throw new TypeError('Invalid memory attachment fields.')
    }
    assertDisplayName(item.name)
    if (!isAnyArrayBuffer(item.data) || item.data.byteLength > MAX_MEMORY_ATTACHMENT_BYTES) {
      throw new RangeError('单个内存附件不能超过 25 MB。')
    }
    totalBytes += item.data.byteLength
  }
  if (totalBytes > MAX_MEMORY_BATCH_BYTES) throw new RangeError('内存附件总大小不能超过 100 MB。')
  assertRequestId(args[2])
}

function parseAttachmentUrl(value, hash, isPreview) {
  if (typeof value !== 'string' || value.length > 2_048) {
    throw new TypeError('Invalid attachment URL.')
  }
  const url = new URL(value)
  if (url.protocol !== 'notetodo-asset:' || url.hostname !== hash || url.username || url.password) {
    throw new TypeError('Invalid attachment URL origin.')
  }
  if (isPreview) {
    if (url.searchParams.get('variant') !== 'thumbnail') {
      throw new TypeError('Invalid attachment preview URL.')
    }
  } else if (url.search) {
    throw new TypeError('Invalid attachment URL query.')
  }
}

function assertAttachment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid attachment response.')
  }
  const allowedFields = new Set(['hash', 'size', 'mimeType', 'displayName', 'url', 'previewUrl'])
  const keys = Object.keys(value)
  if (keys.length !== 6 || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid attachment response fields.')
  }
  if (typeof value.hash !== 'string' || !hashPattern.test(value.hash)) {
    throw new TypeError('Invalid attachment hash.')
  }
  if (!Number.isSafeInteger(value.size) || value.size < 0 || value.size > MAX_ATTACHMENT_BYTES) {
    throw new TypeError('Invalid attachment size.')
  }
  if (
    typeof value.mimeType !== 'string' ||
    value.mimeType.length > 200 ||
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(value.mimeType)
  ) {
    throw new TypeError('Invalid attachment MIME type.')
  }
  assertDisplayName(value.displayName)
  parseAttachmentUrl(value.url, value.hash, false)
  if (value.previewUrl !== null) parseAttachmentUrl(value.previewUrl, value.hash, true)
}

function assertAttachmentList(value) {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENT_COUNT) {
    throw new TypeError('Invalid attachment response collection.')
  }
  value.forEach(assertAttachment)
}

function assertStoredAttachmentRequest(args) {
  if (args.length !== 2) throw new TypeError('Stored attachment request requires hash and name.')
  if (typeof args[0] !== 'string' || !hashPattern.test(args[0])) {
    throw new TypeError('Invalid attachment hash.')
  }
  assertDisplayName(args[1])
}

function assertVoidResponse(value) {
  if (value !== undefined) throw new TypeError('Attachment open returned unexpected data.')
}

function assertBooleanResponse(value) {
  if (typeof value !== 'boolean') throw new TypeError('Invalid attachment export response.')
}

const attachmentIpcContracts = Object.freeze({
  pickAndStore: Object.freeze({
    assertRequest: assertPickRequest,
    assertResponse: assertAttachmentList,
  }),
  storeDropped: Object.freeze({
    assertRequest: assertDroppedRequest,
    assertResponse: assertAttachmentList,
  }),
  storeMemory: Object.freeze({
    assertRequest: assertMemoryRequest,
    assertResponse: assertAttachmentList,
  }),
  open: Object.freeze({
    assertRequest: assertStoredAttachmentRequest,
    assertResponse: assertVoidResponse,
  }),
  export: Object.freeze({
    assertRequest: assertStoredAttachmentRequest,
    assertResponse: assertBooleanResponse,
  }),
})

module.exports = { attachmentIpcContracts }
