// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createWebhookEndpoint } = require('../../electron/ipc-webhook-service.cjs') as {
  createWebhookEndpoint(options: {
    database: { createWebhookEndpoint: (...args: unknown[]) => Record<string, unknown> }
    safeStorageApi: {
      isEncryptionAvailable: () => boolean
      encryptString: (value: string) => Buffer
    }
    name: string
    url: string
    events: string[]
    createSecret?: () => string
  }): Record<string, unknown>
}

describe('webhook IPC service', () => {
  it('persists only encrypted secret bytes and returns plaintext once', () => {
    const create = vi.fn(() => ({ id: 'endpoint-1' }))
    const encryptString = vi.fn(() => Buffer.from('ciphertext'))
    const result = createWebhookEndpoint({
      database: { createWebhookEndpoint: create },
      safeStorageApi: { isEncryptionAvailable: () => true, encryptString },
      name: '产品事件',
      url: 'https://hooks.example.com/notetodo',
      events: ['page.updated'],
      createSecret: () => 'plaintext-secret',
    })

    expect(encryptString).toHaveBeenCalledWith('plaintext-secret')
    expect(create).toHaveBeenCalledWith(
      '产品事件',
      'https://hooks.example.com/notetodo',
      ['page.updated'],
      Buffer.from('ciphertext'),
    )
    expect(result).toEqual({ id: 'endpoint-1', secret: 'plaintext-secret' })
  })

  it('fails closed before creating a secret when the system keychain is unavailable', () => {
    const createSecret = vi.fn(() => 'must-not-be-created')
    expect(() =>
      createWebhookEndpoint({
        database: { createWebhookEndpoint: vi.fn() },
        safeStorageApi: { isEncryptionAvailable: () => false, encryptString: vi.fn() },
        name: '产品事件',
        url: 'https://hooks.example.com/notetodo',
        events: ['page.updated'],
        createSecret,
      }),
    ).toThrow(/密钥库不可用/)
    expect(createSecret).not.toHaveBeenCalled()
  })
})
