import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { signRoomTicket, verifyRoomTicket } = require('./index.cjs')
const secret = 'a-development-secret-with-32-characters'

describe('room tickets', () => {
  it('binds a short-lived ticket to one page', () => {
    const token = signRoomTicket({ pageId: 'page-a', userId: 'user-a', name: 'Lin', color: '#c45134', ttlSeconds: 60 }, secret, 1_000_000)
    expect(verifyRoomTicket(token, 'page-a', secret, 1_010_000)?.userId).toBe('user-a')
    expect(verifyRoomTicket(token, 'page-b', secret, 1_010_000)).toBeNull()
    expect(verifyRoomTicket(token, 'page-a', secret, 1_061_000)).toBeNull()
  })
})
