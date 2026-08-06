import { describe, expect, it } from 'vitest'
import { normalizePropertyValue, queryRecords, type DatabaseRecord } from './index'

const records: DatabaseRecord[] = [
  { id: 'a', values: { title: '设计', score: 3, status: 'doing' }, createdAt: '', updatedAt: '' },
  { id: 'b', values: { title: '发布', score: 10, status: 'done' }, createdAt: '', updatedAt: '' },
  { id: 'c', values: { title: '测试', score: null, status: 'doing' }, createdAt: '', updatedAt: '' },
]

describe('database query engine', () => {
  it('normalizes property values without mixed numeric types', () => {
    expect(normalizePropertyValue({ id: 'score', name: 'Score', type: 'number' }, '12.5')).toBe(12.5)
    expect(normalizePropertyValue({ id: 'score', name: 'Score', type: 'number' }, 'invalid')).toBeNull()
  })

  it('filters and stably sorts records with nulls last', () => {
    const result = queryRecords(
      records,
      [{ propertyId: 'status', operator: 'equals', value: 'doing' }],
      [{ propertyId: 'score', direction: 'asc' }],
    )
    expect(result.map((record) => record.id)).toEqual(['a', 'c'])
  })

  it('queries ten thousand records within the table interaction budget', () => {
    const many = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({
      id: String(index),
      values: { title: `任务 ${index}`, score: 10_000 - index, status: index % 2 ? 'doing' : 'done' },
      createdAt: '',
      updatedAt: '',
    }))
    const start = performance.now()
    const result = queryRecords(many, [{ propertyId: 'status', operator: 'equals', value: 'doing' }], [{ propertyId: 'score', direction: 'asc' }])
    expect(result).toHaveLength(5_000)
    expect(performance.now() - start).toBeLessThan(500)
  })
})

