import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createApiToken, signRoomTicket, verifyApiToken, verifyRoomTicket } = require('./index.cjs')
const secret = 'a-development-secret-with-32-characters'

describe('room tickets', () => {
  it('binds a short-lived ticket to one page', () => {
    const token = signRoomTicket({ pageId: 'page-a', userId: 'user-a', name: 'Lin', color: '#c45134', role: 'viewer', ttlSeconds: 60 }, secret, 1_000_000)
    expect(verifyRoomTicket(token, 'page-a', secret, 1_010_000)?.userId).toBe('user-a')
    expect(verifyRoomTicket(token, 'page-a', secret, 1_010_000)?.role).toBe('viewer')
    expect(verifyRoomTicket(token, 'page-b', secret, 1_010_000)).toBeNull()
    expect(verifyRoomTicket(token, 'page-a', secret, 1_061_000)).toBeNull()
  })
})

describe('API tokens', () => {
  it('returns a one-time secret and verifies only granted scopes', () => {
    const created = createApiToken(['pages:read', 'pages:read'], {
      id: '12345678-1234-1234-1234-123456789abc',
      randomBytes: () => Buffer.alloc(32, 7),
    })
    expect(created.rawToken).toMatch(/^ntd_v1_/)
    expect(created.secretHash).not.toContain(created.rawToken)
    expect(created.scopes).toEqual(['pages:read'])
    expect(verifyApiToken(created.rawToken, created, 'pages:read')).toBe(true)
    expect(verifyApiToken(created.rawToken, created, 'pages:write')).toBe(false)
  })

  it('rejects tampered, expired and revoked credentials', () => {
    const created = createApiToken(['databases:read'])
    expect(verifyApiToken(`${created.rawToken}x`, created, 'databases:read')).toBe(false)
    expect(verifyApiToken(created.rawToken, { ...created, expiresAt: '2026-01-01T00:00:00.000Z' }, 'databases:read', Date.parse('2026-01-02T00:00:00.000Z'))).toBe(false)
    expect(verifyApiToken(created.rawToken, { ...created, revokedAt: new Date().toISOString() }, 'databases:read')).toBe(false)
  })
})
