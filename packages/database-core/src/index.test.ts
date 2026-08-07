import { describe, expect, it } from 'vitest'
import { buildCalendarMonth, evaluateFormula, groupRecordsByDate, layoutTimelineRecords, normalizePropertyValue, prepareGalleryRecords, queryRecords, resolveDerivedRecords, runDatabaseAutomations, safeGalleryCover, timelineDays, type DatabaseRecord, type DatabaseSchema } from './index'

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

  it('builds a Monday-first calendar and groups ten thousand records in one pass', () => {
    const august = buildCalendarMonth(2026, 7)
    expect(august).toHaveLength(42)
    expect(august[0]).toMatchObject({ date: '2026-07-27', inCurrentMonth: false })
    expect(august.find((day) => day.date === '2026-08-01')).toMatchObject({ day: 1, inCurrentMonth: true })
    const many = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({ ...records[0]!, id: String(index), values: { due: index % 10 ? `2026-08-${String(index % 28 + 1).padStart(2, '0')}` : null } }))
    const start = performance.now(); const grouped = groupRecordsByDate(many, 'due')
    expect(grouped.unscheduled).toHaveLength(1_000)
    expect(Object.values(grouped.groups).flat()).toHaveLength(9_000)
    expect(performance.now() - start).toBeLessThan(250)
  })

  it('clips and caps timeline ranges without scanning records repeatedly', () => {
    const many = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({ ...records[0]!, id: String(index), values: { start: index % 3 ? '2026-08-01' : null, end: index % 5 ? '2026-08-20' : null } }))
    const start = performance.now(); const layout = layoutTimelineRecords(many, 'start', 'end', '2026-08-03', 28, 120)
    expect(layout.items).toHaveLength(120)
    expect(layout.matchingCount).toBe(8_000)
    expect(layout.truncatedCount).toBe(7_880)
    expect(layout.items[0]).toMatchObject({ startIndex: 0, endIndex: 17, startsBeforeRange: true })
    expect(timelineDays('2026-08-03', 2)).toEqual([{ date: '2026-08-03', day: 3, weekday: 1, month: 8 }, { date: '2026-08-04', day: 4, weekday: 2, month: 8 }])
    expect(performance.now() - start).toBeLessThan(250)
  })

  it('caps Gallery cards and accepts only local bitmap cover sources', () => {
    const many = Array.from({ length: 10_000 }, (_, index) => ({ ...records[0]!, id: String(index) }))
    const start = performance.now(); const gallery = prepareGalleryRecords(many)
    expect(gallery.records).toHaveLength(120)
    expect(gallery.truncatedCount).toBe(9_880)
    expect(safeGalleryCover('notetodo-asset://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cover.webp')).toContain('notetodo-asset://')
    expect(safeGalleryCover('data:image/png;base64,iVBORw0KGgo=')).toContain('data:image/png')
    expect(safeGalleryCover('https://tracker.example/cover.png')).toBeNull()
    expect(safeGalleryCover('data:image/svg+xml,<svg/>')).toBeNull()
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('evaluates bounded formulas without executing arbitrary JavaScript', () => {
    expect(evaluateFormula('if([score] >= 3, concat("P", [score]), "普通")', { score: 3 })).toBe('P3')
    expect(evaluateFormula('[score] / 0', { score: 3 })).toBeNull()
    expect(evaluateFormula('globalThis.process.exit()', {})).toBeNull()
  })

  it('resolves relation rollups before dependent formulas', () => {
    const schema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [
      { id: 'score', name: 'Score', type: 'number' },
      { id: 'dependencies', name: 'Dependencies', type: 'relation', relation: { databaseId: 'tasks' } },
      { id: 'dependency-score', name: 'Dependency Score', type: 'rollup', rollup: { relationPropertyId: 'dependencies', targetPropertyId: 'score', aggregation: 'sum' } },
      { id: 'label', name: 'Label', type: 'formula', formula: { expression: 'concat("合计 ", [dependency-score])' } },
    ] }
    const derived = resolveDerivedRecords(schema, [
      { id: 'a', values: { score: 2, dependencies: ['b', 'c'] }, createdAt: '', updatedAt: '' },
      { id: 'b', values: { score: 3 }, createdAt: '', updatedAt: '' },
      { id: 'c', values: { score: 4 }, createdAt: '', updatedAt: '' },
    ])
    expect(derived[0]?.values).toMatchObject({ 'dependency-score': 7, label: '合计 7' })
  })

  it('deduplicates relation identifiers and rejects writes to derived fields', () => {
    expect(normalizePropertyValue({ id: 'rel', name: 'Rel', type: 'relation', relation: { databaseId: 'tasks' } }, ['a', 'a', 3])).toEqual(['a'])
    expect(normalizePropertyValue({ id: 'calc', name: 'Calc', type: 'formula', formula: { expression: '1' } }, 99)).toBeNull()
  })

  it('runs bounded automations only when trigger and condition match', () => {
    const schema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [
      { id: 'status', name: 'Status', type: 'select' },
      { id: 'score', name: 'Score', type: 'number' },
      { id: 'formula', name: 'Formula', type: 'formula', formula: { expression: '[score]' } },
    ] }
    const result = runDatabaseAutomations(schema, { id: 'a', values: { status: 'done', score: 3 }, createdAt: '', updatedAt: '' }, 'status', [{
      id: 'complete', name: 'Complete', enabled: true,
      trigger: { type: 'propertyChanged', propertyId: 'status' },
      condition: { propertyId: 'status', operator: 'equals', value: 'done' },
      actions: [{ type: 'setProperty', propertyId: 'score', value: 1 }, { type: 'setProperty', propertyId: 'formula', value: 99 }],
    }])
    expect(result.record.values.score).toBe(1)
    expect(result.executions).toEqual([{ automationId: 'complete', propertyId: 'score', value: 1 }])
  })
})
