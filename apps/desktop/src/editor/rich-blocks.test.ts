// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { assetHashFromUrl, normalizeEmbedUrl, safeHttpsUrl } from './rich-blocks'

describe('rich block URL safety', () => {
  it('accepts HTTPS bookmarks and rejects executable or insecure schemes', () => {
    expect(safeHttpsUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(safeHttpsUrl('javascript:alert(1)')).toBe('')
    expect(safeHttpsUrl('http://example.com')).toBe('')
  })

  it('normalizes supported embeds and rejects arbitrary iframe origins', () => {
    expect(normalizeEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123')
    expect(normalizeEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube.com/embed/abc123')
    expect(normalizeEmbedUrl('https://attacker.example/embed')).toBe('')
  })

  it('extracts only canonical content-addressed attachment hashes', () => {
    const hash = 'a'.repeat(64)
    expect(assetHashFromUrl(`notetodo-asset://${hash}/brief.pdf`)).toBe(hash)
    expect(assetHashFromUrl('https://example.com/brief.pdf')).toBe('')
    expect(assetHashFromUrl('notetodo-asset://short/brief.pdf')).toBe('')
  })
})
