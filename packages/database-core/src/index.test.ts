import { describe, expect, it } from 'vitest'
import { buildCalendarMonth, calculateColumn, coerceCsvPropertyValue, evaluateFormula, groupRecordsByDate, groupRecordsByProperty, inferCsvPropertyMappings, layoutTimelineRecords, moveRecordInOrder, normalizePropertyValue, normalizeViewConfig, orderRecordsByView, parseDatabaseCsv, prepareGalleryRecords, queryRecords, resolveDerivedRecords, resolveDerivedRecordsIncremental, runDatabaseAutomations, safeGalleryCover, searchDatabaseRecords, serializeDatabaseCsv, timelineDays, validateFormulaExpression, virtualWindow, type DatabaseRecord, type DatabaseSchema } from './index'

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

  it('searches raw values and human-readable option labels within budget', () => {
    const searchSchema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [
      { id: 'title', name: '名称', type: 'title' },
      { id: 'status', name: '状态', type: 'select', options: [{ id: 'doing', name: '进行中', color: 'blue' }] },
    ] }
    expect(searchDatabaseRecords(records, searchSchema, '进行')).toEqual([records[0], records[2]])
    expect(searchDatabaseRecords(records, searchSchema, '发布')).toEqual([records[1]])
    const many = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({ ...records[0]!, id: String(index), values: { title: `任务 ${index}`, status: index % 2 ? 'doing' : 'done' } }))
    const start = performance.now(); const result = searchDatabaseRecords(many, searchSchema, '任务 999')
    expect(result.length).toBeGreaterThan(0)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('applies and mutates partial view orders without losing new records', () => {
    expect(orderRecordsByView(records, ['c', 'a']).map((record) => record.id)).toEqual(['c', 'a', 'b'])
    expect(moveRecordInOrder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(moveRecordInOrder(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
    const many = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({ ...records[0]!, id: String(index) }))
    const start = performance.now(); const ordered = orderRecordsByView(many, many.map((record) => record.id).reverse())
    expect(ordered[0]?.id).toBe('9999')
    expect(performance.now() - start).toBeLessThan(250)
  })

  it('combines OR filters, sanitizes saved rules and groups in one pass', () => {
    expect(queryRecords(records, [{ propertyId: 'status', operator: 'equals', value: 'done' }, { propertyId: 'score', operator: 'lessThan', value: 4 }], [], 'or').map((record) => record.id)).toEqual(['a', 'b'])
    const schema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [{ id: 'status', name: 'Status', type: 'select' }, { id: 'score', name: 'Score', type: 'number' }] }
    expect(normalizeViewConfig(schema, { filters: [{ propertyId: 'missing', operator: 'equals', value: 1 }], quickFilters: [{ propertyId: 'status', operator: 'equals', value: 'doing' }, { propertyId: 'missing', operator: 'equals', value: 1 }], sorts: [{ propertyId: 'score', direction: 'desc' }, { propertyId: 'score', direction: 'asc' }], groupByPropertyId: 'status', collapsedGroupKeys: ['doing', 'doing', '', 'x'.repeat(201)], recordOrder: ['record-b', 'record-b', '', 'x'.repeat(201)], visiblePropertyIds: ['status', 'missing', 'status'], propertyWidths: { score: 900, missing: 120 }, rowHeight: 'compact', propertyOrder: ['score', 'missing'], freezeFirstColumn: true, calculations: { score: 'sum', status: 'average' } })).toMatchObject({ filters: [], quickFilters: [{ propertyId: 'status', operator: 'equals', value: 'doing' }], sorts: [{ propertyId: 'score', direction: 'desc' }], groupByPropertyId: 'status', collapsedGroupKeys: ['doing'], recordOrder: ['record-b'], filterMode: 'and', visiblePropertyIds: ['status'], propertyWidths: { score: 600 }, rowHeight: 'compact', propertyOrder: ['score', 'status'], freezeFirstColumn: true, calculations: { score: 'sum' } })
    const many = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({ ...records[0]!, id: String(index), values: { status: index % 2 ? 'doing' : null } }))
    const start = performance.now(); const groups = groupRecordsByProperty(many, 'status')
    expect(groups.map((group) => [group.label, group.records.length])).toEqual([['未填写', 5_000], ['doing', 5_000]])
    expect(performance.now() - start).toBeLessThan(250)
  })

  it('computes type-safe table footer aggregates in one pass', () => {
    expect(calculateColumn(records, 'score', 'sum')).toBe(13)
    expect(calculateColumn(records, 'score', 'average')).toBe(6.5)
    expect(calculateColumn(records, 'status', 'countValues')).toBe(3)
    expect(calculateColumn([{ ...records[0]!, values: { done: true } }, { ...records[1]!, values: { done: false } }], 'done', 'percentChecked')).toBe(50)
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
    expect(validateFormulaExpression('if([score] > 2, "高", "低")')).toBe(true)
    expect(validateFormulaExpression('if([score] >')).toBe(false)
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
    expect(resolveDerivedRecords({ ...schema, properties: schema.properties.map((property) => property.id === 'label' ? { ...property, formula: { expression: 'concat("分数 ", [Dependency Score])' } } : property) }, [
      { id: 'a', values: { score: 2, dependencies: ['b'] }, createdAt: '', updatedAt: '' },
      { id: 'b', values: { score: 3 }, createdAt: '', updatedAt: '' },
    ])[0]?.values.label).toBe('分数 3')
  })

  it('resolves rollups from a related external database', () => {
    const projectSchema: DatabaseSchema = { id: 'projects', name: 'Projects', properties: [
      { id: 'tasks', name: 'Tasks', type: 'relation', relation: { databaseId: 'tasks' } },
      { id: 'points', name: 'Points', type: 'rollup', rollup: { relationPropertyId: 'tasks', targetPropertyId: 'score', aggregation: 'sum' } },
    ] }
    const taskSchema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [{ id: 'score', name: 'Score', type: 'number' }] }
    const records: DatabaseRecord[] = [{ id: 'project-1', values: { tasks: ['task-1', 'task-2'] }, createdAt: '', updatedAt: '' }]
    const taskRecords: DatabaseRecord[] = [{ id: 'task-1', values: { score: 2 }, createdAt: '', updatedAt: '' }, { id: 'task-2', values: { score: 5 }, createdAt: '', updatedAt: '' }]
    expect(resolveDerivedRecords(projectSchema, records, { tasks: { schema: taskSchema, records: taskRecords } })[0]?.values.points).toBe(7)
  })

  it('incrementally recomputes only edited records and rollup dependents at 10k scale', () => {
    const schema: DatabaseSchema = { id: 'large', name: 'Large', properties: [
      { id: 'score', name: 'Score', type: 'number' },
      { id: 'dependencies', name: 'Dependencies', type: 'relation', relation: { databaseId: 'large' } },
      { id: 'total', name: 'Total', type: 'rollup', rollup: { relationPropertyId: 'dependencies', targetPropertyId: 'score', aggregation: 'sum' } },
      { id: 'label', name: 'Label', type: 'formula', formula: { expression: 'concat("P", [total])' } },
    ] }
    const many = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({ id: String(index), values: { score: index, dependencies: index > 0 && index % 1000 === 0 ? ['0'] : [] }, createdAt: '', updatedAt: '1' }))
    const previous = resolveDerivedRecords(schema, many)
    const changed = many.map((record, index) => index === 0 ? { ...record, values: { ...record.values, score: 99 }, updatedAt: '2' } : record)
    const start = performance.now(); const result = resolveDerivedRecordsIncremental(schema, changed, previous, ['0'])

    expect(result.recomputedCount).toBe(10)
    expect(result.records[1]).toBe(previous[1])
    expect(result.records[1000]?.values).toMatchObject({ total: 99, label: 'P99' })
    expect(performance.now() - start).toBeLessThan(150)
  })

  it('keeps virtual render windows bounded for million-row coordinates', () => {
    expect(virtualWindow(1_000_000, 21_000_000, 42, 336, 5)).toEqual({ start: 499_995, end: 500_013, offset: 20_999_790, totalSize: 42_000_000 })
    expect(virtualWindow(0, Number.NaN, 0, 0)).toEqual({ start: 0, end: 0, offset: 0, totalSize: 0 })
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

  it('exports quoted CSV while neutralizing spreadsheet formulas', () => {
    const schema: DatabaseSchema = { id: 'export', name: 'Export', properties: [
      { id: 'title', name: '名称', type: 'title' }, { id: 'note', name: '说明', type: 'text' },
    ] }
    const csv = serializeDatabaseCsv(schema, [{ id: '1', values: { title: '=HYPERLINK("x")', note: '包含,逗号\n和换行' }, createdAt: '', updatedAt: '' }])
    expect(csv).toBe('名称,说明\r\n"\'=HYPERLINK(""x"")","包含,逗号\n和换行"')
  })

  it('parses quoted CSV and infers safe schema mappings', () => {
    const parsed = parseDatabaseCsv('\uFEFF名称,说明,状态\r\n"发布,复盘","第一行\n第二行",已完成')
    expect(parsed).toEqual({ headers: ['名称', '说明', '状态'], rows: [['发布,复盘', '第一行\n第二行', '已完成']], truncated: false })
    const schema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [
      { id: 'title', name: '名称', type: 'title' }, { id: 'done', name: '状态', type: 'checkbox' }, { id: 'score', name: '得分', type: 'number' },
    ] }
    expect(inferCsvPropertyMappings(parsed.headers, schema)).toEqual(['title', null, 'done'])
    expect(coerceCsvPropertyValue(schema.properties[1]!, '已完成')).toBe(true)
    expect(coerceCsvPropertyValue(schema.properties[2]!, '12.5')).toBe(12.5)
  })
})
