// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { webhookIpcContracts } = require('../../electron/ipc-webhook-contracts.cjs') as {
  webhookIpcContracts: Record<'list' | 'create' | 'setActive' | 'listDeliveries', IpcContract>
}

const endpointId = '12345678-1234-4123-8123-123456789abc'
const deliveryId = 'abcdefab-1234-4123-8123-abcdefabcdef'
const timestamp = '2026-08-09T12:00:00.000Z'
const endpoint = {
  id: endpointId,
  name: '产品事件',
  url: 'https://hooks.example.com/notetodo',
  events: ['page.updated'],
  active: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  pendingCount: 0,
  deadCount: 0,
}

describe('webhook IPC contracts', () => {
  it('accepts canonical HTTPS endpoints and one-time creation secrets', () => {
    expect(() => webhookIpcContracts.list.assertResponse([endpoint])).not.toThrow()
    expect(() =>
      webhookIpcContracts.create.assertResponse({
        ...endpoint,
        secret: 'a'.repeat(43),
        pendingCount: undefined,
        deadCount: undefined,
      }),
    ).toThrow(/fields/)
    const createdEndpoint = {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      active: endpoint.active,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    }
    expect(() =>
      webhookIpcContracts.create.assertResponse({ ...createdEndpoint, secret: 'a'.repeat(43) }),
    ).not.toThrow()
  })

  it('rejects private, credentialed, and duplicate-event endpoint requests', () => {
    expect(() =>
      webhookIpcContracts.create.assertRequest([
        '内网',
        'https://127.0.0.1/hook',
        ['page.updated'],
      ]),
    ).toThrow(/private network/)
    expect(() =>
      webhookIpcContracts.create.assertRequest([
        '凭据',
        'https://user:secret@hooks.example.com/hook',
        ['page.updated'],
      ]),
    ).toThrow(/credentials/)
    expect(() =>
      webhookIpcContracts.create.assertRequest([
        '重复',
        'https://hooks.example.com/hook',
        ['page.updated', 'page.updated'],
      ]),
    ).toThrow(/events/)
  })

  it('rejects encrypted or unexpected secret fields in endpoint ledgers', () => {
    expect(() =>
      webhookIpcContracts.list.assertResponse([{ ...endpoint, secret: 'plaintext' }]),
    ).toThrow(/fields/)
    expect(() =>
      webhookIpcContracts.list.assertResponse([{ ...endpoint, encryptedSecret: new Uint8Array() }]),
    ).toThrow(/fields/)
  })

  it('validates bounded delivery attempts and endpoint ownership fields', () => {
    const delivery = {
      id: deliveryId,
      endpointId,
      event: 'page.updated',
      status: 'pending',
      attempts: 2,
      nextAttemptAt: timestamp,
      lastError: null,
      createdAt: timestamp,
      deliveredAt: null,
    }
    expect(() => webhookIpcContracts.listDeliveries.assertResponse([delivery])).not.toThrow()
    expect(() =>
      webhookIpcContracts.listDeliveries.assertResponse([{ ...delivery, attempts: 9 }]),
    ).toThrow(/attempt/)
  })

  it('requires exact UUID and boolean state mutation contracts', () => {
    expect(() => webhookIpcContracts.setActive.assertRequest([endpointId, false])).not.toThrow()
    expect(() => webhookIpcContracts.setActive.assertRequest(['../endpoint', false])).toThrow(/id/)
    expect(() => webhookIpcContracts.setActive.assertResponse(undefined)).toThrow(/response/)
  })
})
