const { API_SCOPES } = require('@notetodo/auth-core')

const MAX_TOKEN_COUNT = 10_000
const apiScopeSet = new Set(API_SCOPES)
const tokenIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const rawTokenPattern = /^ntd_v1_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/u

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError('API token list does not accept arguments.')
}

function assertTokenId(value) {
  if (typeof value !== 'string' || !tokenIdPattern.test(value)) {
    throw new TypeError('Invalid API token id.')
  }
}

function assertTokenName(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 100 ||
    value.trim() !== value ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError('Invalid API token name.')
  }
}

function assertScopes(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > API_SCOPES.length ||
    new Set(value).size !== value.length ||
    value.some((scope) => typeof scope !== 'string' || !apiScopeSet.has(scope))
  ) {
    throw new TypeError('Invalid API token scopes.')
  }
}

function assertIssueRequest(args) {
  if (args.length !== 2) throw new TypeError('API token issue requires name and scopes.')
  assertTokenName(args[0])
  assertScopes(args[1])
}

function assertRevokeRequest(args) {
  if (args.length !== 1) throw new TypeError('API token revoke requires one id.')
  assertTokenId(args[0])
}

function assertTimestamp(value, label, nullable = false) {
  if (nullable && value === null) return
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid API token ${label}.`)
  }
}

function assertPrefix(value) {
  if (typeof value !== 'string' || !/^ntd_v1_[0-9a-f-]{11}…$/iu.test(value)) {
    throw new TypeError('Invalid API token prefix.')
  }
}

function assertStoredToken(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid stored API token response.')
  }
  const allowedFields = new Set([
    'id',
    'name',
    'prefix',
    'scopes',
    'expiresAt',
    'revokedAt',
    'lastUsedAt',
    'createdAt',
  ])
  const keys = Object.keys(value)
  if (keys.length !== allowedFields.size || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid stored API token response fields.')
  }
  assertTokenId(value.id)
  assertTokenName(value.name)
  assertPrefix(value.prefix)
  assertScopes(value.scopes)
  assertTimestamp(value.expiresAt, 'expiry', true)
  assertTimestamp(value.revokedAt, 'revocation time', true)
  assertTimestamp(value.lastUsedAt, 'last-used time', true)
  assertTimestamp(value.createdAt, 'creation time')
}

function assertTokenList(value) {
  if (!Array.isArray(value) || value.length > MAX_TOKEN_COUNT) {
    throw new TypeError('Invalid API token response collection.')
  }
  value.forEach(assertStoredToken)
}

function assertIssuedToken(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid issued API token response.')
  }
  const allowedFields = new Set([
    'id',
    'name',
    'rawToken',
    'prefix',
    'scopes',
    'expiresAt',
    'createdAt',
  ])
  const keys = Object.keys(value)
  if (keys.length !== allowedFields.size || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid issued API token response fields.')
  }
  assertTokenId(value.id)
  assertTokenName(value.name)
  assertScopes(value.scopes)
  assertTimestamp(value.expiresAt, 'expiry', true)
  assertTimestamp(value.createdAt, 'creation time')

  const rawTokenMatch = typeof value.rawToken === 'string' && rawTokenPattern.exec(value.rawToken)
  if (!rawTokenMatch || rawTokenMatch[1] !== value.id) {
    throw new TypeError('Invalid issued API token secret.')
  }
  assertPrefix(value.prefix)
  if (value.prefix !== `${value.rawToken.slice(0, 18)}…`) {
    throw new TypeError('API token prefix does not match its secret.')
  }
}

function assertBooleanResponse(value) {
  if (typeof value !== 'boolean') throw new TypeError('Invalid API token revoke response.')
}

const platformIpcContracts = Object.freeze({
  listTokens: Object.freeze({ assertRequest: assertNoArguments, assertResponse: assertTokenList }),
  issueToken: Object.freeze({
    assertRequest: assertIssueRequest,
    assertResponse: assertIssuedToken,
  }),
  revokeToken: Object.freeze({
    assertRequest: assertRevokeRequest,
    assertResponse: assertBooleanResponse,
  }),
})

module.exports = { platformIpcContracts }
