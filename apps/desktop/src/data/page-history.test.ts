import { describe, expect, it } from 'vitest'
import { diffHistoryHtml, historyTextLines } from './page-history'

describe('page history comparison', () => {
  it('renders stored HTML as inert text without executable content', () => {
    expect(historyTextLines('<h1>路线</h1><script>alert(1)</script><p>安全正文</p>')).toEqual(['路线', '安全正文'])
  })

  it('produces stable added and removed lines around unchanged context', () => {
    const diff = diffHistoryHtml('<p>Alpha</p><p>Old</p>', '<p>Alpha</p><p>New</p>')
    expect(diff).toEqual([
      { kind: 'same', text: 'Alpha' },
      { kind: 'removed', text: 'Old' },
      { kind: 'added', text: 'New' },
    ])
  })

  it('caps pathological imported pages before quadratic comparison', () => {
    const html = Array.from({ length: 300 }, (_, index) => `<p>line ${index}</p>`).join('')
    expect(historyTextLines(html)).toHaveLength(241)
  })
})
