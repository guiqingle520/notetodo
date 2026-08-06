const { createHmac, timingSafeEqual } = require('node:crypto')

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

module.exports = { signRoomTicket, verifyRoomTicket }
