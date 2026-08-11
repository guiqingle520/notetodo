import { describe, expect, it } from 'vitest'
import { VECTOR_DIMENSIONS, chunkPage, cosineSimilarity, embedText, fuseRankings } from '.'

describe('main process retrieval core', () => {
  it('sanitizes and chunks editor HTML with stable headings', () => {
    const chunks = chunkPage('规划', '<p>第一段</p><script>泄露</script><p>第二段</p>', 8, 2)
    expect(chunks.map((chunk) => chunk.heading)).toEqual(chunks.map(() => '规划'))
    expect(chunks.map((chunk) => chunk.text).join('')).not.toContain('泄露')
  })

  it('creates normalized deterministic embeddings', () => {
    const first = embedText('本地语义检索')
    const second = embedText('本地语义检索')
    expect(first).toEqual(second)
    expect(first.byteLength).toBe(VECTOR_DIMENSIONS * 4)
    expect(cosineSimilarity(first, second)).toBeCloseTo(1, 5)
  })

  it('fuses lexical and semantic rankings without duplicating resources', () => {
    expect(fuseRankings([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }], 2).map((item) => item.id)).toEqual(['a', 'b'])
  })
})
