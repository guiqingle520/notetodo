// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { platformIpcContracts } = require('../../electron/ipc-platform-contracts.cjs') as {
  platformIpcContracts: Record<'listTokens' | 'issueToken' | 'revokeToken', IpcContract>
}

const id = '12345678-1234-4123-8123-123456789abc'
const createdAt = '2026-08-09T12:00:00.000Z'
const rawToken = `ntd_v1_${id}_${'a'.repeat(43)}`
const storedToken = {
  id,
  name: '本地集成',
  prefix: `${rawToken.slice(0, 18)}…`,
  scopes: ['pages:read'],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt,
}

describe('platform IPC contracts', () => {
  it('accepts the stored-token ledger without exposing token secrets', () => {
    expect(() => platformIpcContracts.listTokens.assertRequest([])).not.toThrow()
    expect(() => platformIpcContracts.listTokens.assertResponse([storedToken])).not.toThrow()
  })

  it('accepts a one-time issued secret bound to the returned id and prefix', () => {
    expect(() =>
      platformIpcContracts.issueToken.assertRequest(['本地集成', ['pages:read']]),
    ).not.toThrow()
    expect(() =>
      platformIpcContracts.issueToken.assertResponse({
        id,
        name: '本地集成',
        rawToken,
        prefix: storedToken.prefix,
        scopes: ['pages:read'],
        expiresAt: null,
        createdAt,
      }),
    ).not.toThrow()
  })

  it('rejects invalid or duplicate scopes before token creation', () => {
    expect(() =>
      platformIpcContracts.issueToken.assertRequest(['本地集成', ['pages:read', 'pages:read']]),
    ).toThrow(/scopes/)
    expect(() =>
      platformIpcContracts.issueToken.assertRequest(['本地集成', ['workspace:admin']]),
    ).toThrow(/scopes/)
  })

  it('rejects secret leakage in list responses and mismatched issued secrets', () => {
    expect(() =>
      platformIpcContracts.listTokens.assertResponse([{ ...storedToken, rawToken }]),
    ).toThrow(/fields/)
    expect(() =>
      platformIpcContracts.issueToken.assertResponse({
        id,
        name: '本地集成',
        rawToken: `ntd_v1_${'b'.repeat(36)}_${'a'.repeat(43)}`,
        prefix: storedToken.prefix,
        scopes: ['pages:read'],
        expiresAt: null,
        createdAt,
      }),
    ).toThrow(/secret/)
  })

  it('requires a UUID token id and boolean revocation response', () => {
    expect(() => platformIpcContracts.revokeToken.assertRequest(['../token'])).toThrow(/id/)
    expect(() => platformIpcContracts.revokeToken.assertResponse(undefined)).toThrow(/response/)
  })
})
