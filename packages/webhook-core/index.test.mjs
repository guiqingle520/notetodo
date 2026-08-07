import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { createWebhookEnvelope, nextWebhookAttempt, signWebhook, stableJson, validateWebhookUrl, verifyWebhookSignature } = require('./index.cjs')

describe('webhook protocol', () => {
  it('serializes payloads canonically and signs the timestamp plus body', () => {
    const body = stableJson(createWebhookEnvelope('page.updated', 'delivery-1', '2026-08-07T00:00:00.000Z', { z: 1, a: { y: 2, x: 3 } }))
    expect(body.indexOf('"a"')).toBeLessThan(body.indexOf('"z"'))
    const secret = 'webhook-secret-with-at-least-32-characters'
    const signature = signWebhook(secret, 1_786_060_800, body)
    expect(verifyWebhookSignature(secret, 1_786_060_800, body, signature, 1_786_060_800_000)).toBe(true)
    expect(verifyWebhookSignature(secret, 1_786_060_800, `${body}x`, signature, 1_786_060_800_000)).toBe(false)
  })

  it('uses bounded exponential retry delays', () => {
    expect(nextWebhookAttempt(1, 0)).toBe('1970-01-01T00:00:05.000Z')
    expect(nextWebhookAttempt(5, 0)).toBe('1970-01-01T01:00:00.000Z')
    expect(nextWebhookAttempt(99, 0)).toBe('1970-01-01T01:00:00.000Z')
  })

  it('accepts public HTTPS endpoints and rejects SSRF-prone literals', () => {
    expect(validateWebhookUrl('https://hooks.example.com/notetodo#fragment')).toBe('https://hooks.example.com/notetodo')
    expect(() => validateWebhookUrl('http://example.com/hook')).toThrow(/HTTPS/)
    expect(() => validateWebhookUrl('https://127.0.0.1/hook')).toThrow(/private network/)
    expect(() => validateWebhookUrl('https://169.254.169.254/latest')).toThrow(/private network/)
  })
})
