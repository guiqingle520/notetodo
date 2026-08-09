const MAX_COMMENTS = 10_000
const MAX_NOTIFICATIONS = 100

function assertId(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) {
    throw new TypeError(`Invalid ${label}.`)
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid ${label}.`)
  }
}

function assertPageRequest(args) {
  if (args.length !== 1) throw new TypeError('Comment list requires one page id.')
  assertId(args[0], 'comment page id')
}

function assertAnchor(value) {
  if (value === null) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid comment anchor.')
  }
  const keys = Object.keys(value)
  if (
    keys.length !== 3 ||
    !keys.includes('from') ||
    !keys.includes('to') ||
    !keys.includes('quote') ||
    !Number.isSafeInteger(value.from) ||
    !Number.isSafeInteger(value.to) ||
    value.from < 0 ||
    value.to < value.from ||
    typeof value.quote !== 'string' ||
    value.quote.length > 1_000
  ) {
    throw new TypeError('Invalid comment anchor.')
  }
}

function assertMentions(value) {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some((id) => typeof id !== 'string' || id.length < 1 || id.length > 128)
  ) {
    throw new TypeError('Invalid comment mentions.')
  }
}

function assertCreateRequest(args) {
  if (args.length < 3 || args.length > 4) {
    throw new TypeError('Comment creation requires page, body, anchor, and optional mentions.')
  }
  assertId(args[0], 'comment page id')
  if (typeof args[1] !== 'string' || args[1].trim().length < 1 || args[1].length > 10_000) {
    throw new TypeError('Invalid comment body.')
  }
  assertAnchor(args[2])
  if (args[3] !== undefined) assertMentions(args[3])
}

function assertComment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid comment response.')
  }
  const allowedFields = new Set([
    'id',
    'authorName',
    'body',
    'anchor',
    'mentions',
    'resolvedAt',
    'createdAt',
  ])
  const keys = Object.keys(value)
  if (keys.length !== 7 || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid comment response fields.')
  }
  assertId(value.id, 'comment id')
  if (
    typeof value.authorName !== 'string' ||
    value.authorName.length < 1 ||
    value.authorName.length > 80
  ) {
    throw new TypeError('Invalid comment author name.')
  }
  if (typeof value.body !== 'string' || value.body.length < 1 || value.body.length > 10_000) {
    throw new TypeError('Invalid comment response body.')
  }
  assertAnchor(value.anchor)
  assertMentions(value.mentions)
  if (value.resolvedAt !== null) assertTimestamp(value.resolvedAt, 'comment resolution time')
  assertTimestamp(value.createdAt, 'comment creation time')
}

function assertCommentList(value) {
  if (!Array.isArray(value) || value.length > MAX_COMMENTS) {
    throw new TypeError('Invalid comment response collection.')
  }
  value.forEach(assertComment)
}

function assertIdRequest(args) {
  if (args.length !== 1) throw new TypeError('Operation requires one id.')
  assertId(args[0], 'operation id')
}

function assertIdResponse(value) {
  assertId(value, 'created comment id')
}

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError('Notification list does not accept arguments.')
}

function assertNotification(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid notification response.')
  }
  const allowedFields = new Set([
    'id',
    'type',
    'readAt',
    'createdAt',
    'pageId',
    'pageTitle',
    'authorName',
    'body',
  ])
  const keys = Object.keys(value)
  if (keys.length !== 8 || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid notification response fields.')
  }
  assertId(value.id, 'notification id')
  assertId(value.pageId, 'notification page id')
  if (!['mention', 'comment'].includes(value.type))
    throw new TypeError('Invalid notification type.')
  if (value.readAt !== null) assertTimestamp(value.readAt, 'notification read time')
  assertTimestamp(value.createdAt, 'notification creation time')
  if (typeof value.pageTitle !== 'string' || value.pageTitle.length > 1_000) {
    throw new TypeError('Invalid notification page title.')
  }
  if (typeof value.authorName !== 'string' || value.authorName.length > 80) {
    throw new TypeError('Invalid notification author name.')
  }
  if (typeof value.body !== 'string' || value.body.length > 10_000) {
    throw new TypeError('Invalid notification body.')
  }
}

function assertNotificationList(value) {
  if (!Array.isArray(value) || value.length > MAX_NOTIFICATIONS) {
    throw new TypeError('Invalid notification collection.')
  }
  value.forEach(assertNotification)
}

function assertVoidResponse(value) {
  if (value !== undefined) throw new TypeError('Mutation returned unexpected data.')
}

const commentsIpcContracts = Object.freeze({
  list: Object.freeze({ assertRequest: assertPageRequest, assertResponse: assertCommentList }),
  create: Object.freeze({ assertRequest: assertCreateRequest, assertResponse: assertIdResponse }),
  resolve: Object.freeze({ assertRequest: assertIdRequest, assertResponse: assertVoidResponse }),
  listNotifications: Object.freeze({
    assertRequest: assertNoArguments,
    assertResponse: assertNotificationList,
  }),
  markNotificationRead: Object.freeze({
    assertRequest: assertIdRequest,
    assertResponse: assertVoidResponse,
  }),
})

module.exports = { commentsIpcContracts }
