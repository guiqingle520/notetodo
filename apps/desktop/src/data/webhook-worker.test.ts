// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
const require = createRequire(import.meta.url)
const { WebhookWorker } = require('../../electron/webhook-worker.cjs')

describe('WebhookWorker', () => {
  it('signs leased deliveries and records successful completion', async () => {
    const complete = vi.fn(() => ({ status: 'delivered', attempt: 1 }))
    const database = { claimWebhookDeliveries: () => [{ id: 'delivery-1', event: 'page.updated', url: 'https://hooks.example.com', payload: '{"ok":true}', encryptedSecret: Buffer.from('cipher') }], completeWebhookDelivery: complete }
    const transport = vi.fn(async (_url: string, _body: string, headers: Record<string, string>) => ({ statusCode: 204, responsePreview: '' , signature: headers['x-notetodo-signature'] }))
    const worker = new WebhookWorker(database, () => 'webhook-secret-with-at-least-32-characters', { workerId: 'worker', transport })
    expect(await worker.tick()).toBe(1)
    expect(transport.mock.calls[0]?.[2]).toMatchObject({ 'x-notetodo-delivery': 'delivery-1', 'x-notetodo-event': 'page.updated' })
    expect(transport.mock.calls[0]?.[2]['x-notetodo-signature']).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(complete).toHaveBeenCalledWith('delivery-1', 'worker', expect.objectContaining({ statusCode: 204 }))
  })

  it('converts transport failures into retryable completion records', async () => {
    const complete = vi.fn(() => ({ status: 'pending', attempt: 1 }))
    const database = { claimWebhookDeliveries: () => [{ id: 'delivery-2', event: 'page.updated', url: 'https://hooks.example.com', payload: '{}', encryptedSecret: Buffer.from('cipher') }], completeWebhookDelivery: complete }
    const worker = new WebhookWorker(database, () => 'webhook-secret-with-at-least-32-characters', { workerId: 'worker', transport: async () => { throw new Error('offline') } })
    await worker.tick()
    expect(complete).toHaveBeenCalledWith('delivery-2', 'worker', expect.objectContaining({ statusCode: null, errorMessage: 'offline' }))
  })
})
