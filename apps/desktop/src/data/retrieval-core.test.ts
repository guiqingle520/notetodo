// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { chunkPage, cosineSimilarity, embedText, fuseRankings } = require('../../electron/retrieval-core.cjs') as {
  chunkPage: (title: string, html: string, targetSize?: number, overlap?: number) => Array<{ index: number; heading: string; text: string }>
  embedText: (value: string) => Buffer
  cosineSimilarity: (left: Buffer, right: Buffer) => number
  fuseRankings: (lexical: Array<{ id: number }>, semantic: Array<{ id: number }>, limit?: number) => Array<{ id: number; score: number }>
}

describe('local hybrid retrieval core', () => {
  it('creates bounded overlapping chunks without executable markup', () => {
    const chunks = chunkPage('路线', `<script>steal()</script><p>${'离线优先。'.repeat(80)}</p>`, 120, 20)
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every((chunk) => chunk.text.length <= 125 && !chunk.text.includes('steal'))).toBe(true)
  })

  it('ranks semantically related Chinese text above unrelated content', () => {
    const query = embedText('离线数据库同步')
    const related = cosineSimilarity(query, embedText('本地 SQLite 数据库与离线同步'))
    const unrelated = cosineSimilarity(query, embedText('品牌设计与市场活动'))
    expect(related).toBeGreaterThan(unrelated)
  })

  it('uses reciprocal-rank fusion to reward agreement', () => {
    const fused = fuseRankings([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }])
    expect(fused[0]?.id).toBe(2)
  })
})
