const { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } = require('node:crypto')

const API_SCOPES = Object.freeze([
  'pages:read', 'pages:write', 'databases:read', 'databases:write',
  'webhooks:manage', 'automations:manage',
])

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signRoomTicket(claims, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Collaboration signing secret must contain at least 32 characters.')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({ aud: 'notetodo-collaboration', pageId: claims.pageId, userId: claims.userId, name: claims.name, color: claims.color, role: claims.role ?? 'editor', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + (claims.ttlSeconds ?? 300) })
  const body = `${header}.${payload}`
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

function verifyRoomTicket(token, pageId, secret, now = Date.now()) {
  try {
    const [header, payload, signature] = token.split('.')
    if (!header || !payload || !signature) return null
    const body = `${header}.${payload}`
    const expected = createHmac('sha256', secret).update(body).digest()
    const candidate = Buffer.from(signature, 'base64url')
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return null
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (claims.aud !== 'notetodo-collaboration' || claims.pageId !== pageId || claims.exp < Math.floor(now / 1000)) return null
    return claims
  } catch { return null }
}

function hashApiTokenSecret(secret) {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

/**
 * Creates an opaque API credential. Only secretHash is safe to persist; rawToken
 * is returned once so the UI can hand it to the workspace owner.
 */
function createApiToken(scopes, options = {}) {
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some((scope) => !API_SCOPES.includes(scope))) {
    throw new TypeError('API token requires at least one valid scope.')
  }
  const id = options.id ?? randomUUID()
  const secret = (options.randomBytes ?? randomBytes)(32).toString('base64url')
  const rawToken = `ntd_v1_${id}_${secret}`
  return {
    id,
    rawToken,
    prefix: `${rawToken.slice(0, 18)}…`,
    secretHash: hashApiTokenSecret(secret),
    scopes: [...new Set(scopes)],
  }
}

function verifyApiToken(rawToken, storedToken, requiredScope, now = Date.now()) {
  try {
    if (!API_SCOPES.includes(requiredScope) || storedToken.revokedAt) return false
    if (storedToken.expiresAt && Date.parse(storedToken.expiresAt) <= now) return false
    const match = /^ntd_v1_([0-9a-f-]{36})_([A-Za-z0-9_-]{43})$/u.exec(rawToken)
    if (!match || match[1] !== storedToken.id || !storedToken.scopes.includes(requiredScope)) return false
    const candidate = Buffer.from(hashApiTokenSecret(match[2]), 'hex')
    const expected = Buffer.from(storedToken.secretHash, 'hex')
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch { return false }
}

module.exports = { API_SCOPES, createApiToken, hashApiTokenSecret, signRoomTicket, verifyApiToken, verifyRoomTicket }
