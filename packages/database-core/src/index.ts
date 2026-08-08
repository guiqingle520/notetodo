export type PropertyType = 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'multiSelect' | 'date' | 'url' | 'relation' | 'rollup' | 'formula'

export interface SelectOption {
  id: string
  name: string
  color: 'slate' | 'gray' | 'brown' | 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'purple' | 'pink'
}

export interface DatabaseProperty {
  id: string
  name: string
  type: PropertyType
  options?: SelectOption[]
  relation?: { databaseId: string }
  rollup?: { relationPropertyId: string; targetPropertyId: string; aggregation: 'count' | 'sum' | 'average' | 'min' | 'max' | 'showOriginal' }
  formula?: { expression: string }
}

export type PropertyValue = string | number | boolean | string[] | null

export interface DatabaseRecord {
  id: string
  values: Record<string, PropertyValue>
  /** Rich-text HTML owned by the record detail page. Optional for legacy snapshots. */
  content?: string
  createdAt: string
  updatedAt: string
}

export interface DatabaseSchema {
  id: string
  name: string
  properties: DatabaseProperty[]
}

export interface DatabaseView {
  id: string
  databaseId: string
  name: string
  type: 'table' | 'board' | 'list' | 'calendar' | 'timeline' | 'gallery'
  config: DatabaseViewConfig
}

export interface DatabaseViewConfig {
  filters?: FilterRule[]
  filterMode?: 'and' | 'or'
  sorts?: SortRule[]
  groupByPropertyId?: string
  datePropertyId?: string
  startDatePropertyId?: string
  endDatePropertyId?: string
  coverPropertyId?: string
  visiblePropertyIds?: string[]
  propertyWidths?: Record<string, number>
  rowHeight?: 'compact' | 'default' | 'comfortable'
  cardSize?: 'small' | 'medium' | 'large'
}

export interface DatabaseTemplate {
  id: string
  databaseId: string
  name: string
  values: Record<string, PropertyValue>
  content: string
  createdAt: string
  updatedAt: string
}

export interface CalendarDay {
  date: string
  day: number
  inCurrentMonth: boolean
}

export interface TimelineItem {
  record: DatabaseRecord
  startIndex: number
  endIndex: number
  durationDays: number
  startsBeforeRange: boolean
  endsAfterRange: boolean
}

export interface DatabaseSnapshot {
  schema: DatabaseSchema
  records: DatabaseRecord[]
  views: DatabaseView[]
  activeViewId: string
  /** Record templates are optional for snapshots created before schema v14. */
  templates?: DatabaseTemplate[]
}

export interface SortRule {
  propertyId: string
  direction: 'asc' | 'desc'
}

export interface FilterRule {
  propertyId: string
  operator: 'equals' | 'notEquals' | 'contains' | 'isEmpty' | 'isNotEmpty' | 'greaterThan' | 'lessThan'
  value?: PropertyValue
}

/**
 * Serializes the current database result set as UTF-8 CSV. Spreadsheet formula
 * prefixes are escaped so exported user text cannot execute when opened in
 * Excel or another desktop spreadsheet application.
 */
export function serializeDatabaseCsv(schema: DatabaseSchema, records: DatabaseRecord[]) {
  const escape = (value: PropertyValue | string) => {
    const plain = Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value)
    const safe = /^[=+\-@]/u.test(plain.trimStart()) ? `'${plain}` : plain
    return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
  }
  const header = schema.properties.map((property) => escape(property.name)).join(',')
  return [header, ...records.map((record) => schema.properties.map((property) => escape(record.values[property.id] ?? '')).join(','))].join('\r\n')
}

export interface ParsedDatabaseCsv {
  headers: string[]
  rows: string[][]
  /** True when the source contained more rows than the bounded preview/import limit. */
  truncated: boolean
}

/**
 * Parses RFC 4180-style CSV, including escaped quotes and embedded newlines.
 * Explicit byte/row/column limits keep a malformed import from monopolizing
 * the renderer while still covering normal spreadsheet exports.
 */
export function parseDatabaseCsv(source: string, maxRows = 10_000, maxColumns = 100): ParsedDatabaseCsv {
  if (source.length > 10_000_000) throw new TypeError('CSV 文件不能超过 10 MB。')
  const rowLimit = Math.max(1, Math.min(50_000, Math.trunc(maxRows)))
  const columnLimit = Math.max(1, Math.min(500, Math.trunc(maxColumns)))
  const rows: string[][] = []
  let row: string[] = []; let field = ''; let quoted = false; let index = source.charCodeAt(0) === 0xFEFF ? 1 : 0
  const pushField = () => { if (row.length >= columnLimit) throw new TypeError(`CSV 不能超过 ${columnLimit} 列。`); row.push(field); field = '' }
  const pushRow = () => { pushField(); rows.push(row); row = [] }
  while (index < source.length) {
    const character = source[index]!
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 2; continue }
      if (character === '"') { quoted = false; index += 1; continue }
      field += character; index += 1; continue
    }
    if (character === '"' && field.length === 0) { quoted = true; index += 1; continue }
    if (character === ',') { pushField(); index += 1; continue }
    if (character === '\n' || character === '\r') {
      pushRow(); if (character === '\r' && source[index + 1] === '\n') index += 1
      index += 1
      if (rows.length > rowLimit + 1) return { headers: deduplicateCsvHeaders(rows[0] ?? []), rows: rows.slice(1, rowLimit + 1), truncated: true }
      continue
    }
    field += character; index += 1
  }
  if (quoted) throw new TypeError('CSV 中存在未闭合的引号。')
  if (field.length || row.length) pushRow()
  const headers = deduplicateCsvHeaders(rows.shift() ?? [])
  return { headers, rows: rows.filter((candidate) => candidate.some(Boolean)).slice(0, rowLimit), truncated: rows.length > rowLimit }
}

function deduplicateCsvHeaders(headers: string[]) {
  const counts = new Map<string, number>()
  return headers.map((header, index) => {
    const base = header.trim() || `列 ${index + 1}`
    const count = (counts.get(base) ?? 0) + 1; counts.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

/** Matches columns by normalized display name so the mapping panel starts useful. */
export function inferCsvPropertyMappings(headers: string[], schema: DatabaseSchema) {
  const writable = schema.properties.filter((property) => !['formula', 'rollup', 'relation'].includes(property.type))
  const key = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s_-]+/gu, '')
  return headers.map((header) => writable.find((property) => key(property.name) === key(header))?.id ?? null)
}

/** Converts a spreadsheet cell into the database property's canonical value. */
export function coerceCsvPropertyValue(property: DatabaseProperty, raw: string): PropertyValue {
  const value = raw.trim()
  if (!value) return null
  if (property.type === 'checkbox') return /^(?:1|true|yes|y|是|已完成|✓)$/iu.test(value)
  if (property.type === 'multiSelect') return [...new Set(value.split(/[,，;；]/u).map((item) => item.trim()).filter(Boolean))]
  if (property.type === 'select') return property.options?.find((option) => option.id === value || option.name.toLocaleLowerCase() === value.toLocaleLowerCase())?.id ?? value
  return normalizePropertyValue(property, value)
}

export interface DatabaseAutomation {
  id: string
  name: string
  enabled: boolean
  trigger: { type: 'propertyChanged'; propertyId: string }
  condition?: FilterRule
  actions: Array<{ type: 'setProperty'; propertyId: string; value: PropertyValue }>
}

export interface AutomationExecution {
  automationId: string
  propertyId: string
  value: PropertyValue
}

/**
 * Converts UI input to the schema's canonical value. Invalid values become
 * null instead of leaking mixed types into sorting, formulas and sync.
 */
export function normalizePropertyValue(property: DatabaseProperty, input: unknown): PropertyValue {
  if (input === null || input === undefined || input === '') return null
  switch (property.type) {
    case 'formula':
    case 'rollup': return null
    case 'checkbox': return Boolean(input)
    case 'number': {
      const value = typeof input === 'number' ? input : Number(input)
      return Number.isFinite(value) ? value : null
    }
    case 'multiSelect':
    case 'relation': return Array.isArray(input) ? [...new Set(input.filter((value): value is string => typeof value === 'string'))] : null
    default: return typeof input === 'string' ? input : String(input)
  }
}

/** Resolves rollups before formulas without mutating persisted source values. */
export type RelationTargetSnapshot = { schema: DatabaseSchema; records: DatabaseRecord[] }

export function resolveDerivedRecords(schema: DatabaseSchema, records: DatabaseRecord[], relationTargets: Record<string, RelationTargetSnapshot> = {}): DatabaseRecord[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  const derived = derivedProperties(schema)
  return records.map((record) => resolveRecord(record, byId, derived, relationTargets))
}

/**
 * Recomputes only the edited records and records whose rollups reference them.
 * The linear dependency scan is cheap and preserves object identity for every
 * unaffected row, which lets React skip work in windowed database views.
 */
export function resolveDerivedRecordsIncremental(
  schema: DatabaseSchema,
  records: DatabaseRecord[],
  previous: DatabaseRecord[] | undefined,
  changedRecordIds: Iterable<string>,
  relationTargets: Record<string, RelationTargetSnapshot> = {},
) {
  if (!previous?.length) return { records: resolveDerivedRecords(schema, records, relationTargets), recomputedCount: records.length }
  const changed = new Set(changedRecordIds)
  const previousById = new Map(previous.map((record) => [record.id, record]))
  const byId = new Map(records.map((record) => [record.id, record]))
  const derived = derivedProperties(schema)

  if (derived.rollups.length) {
    for (const record of records) {
      if (changed.has(record.id)) continue
      for (const property of derived.rollups) {
        const relatedIds = record.values[property.rollup!.relationPropertyId]
        if (Array.isArray(relatedIds) && relatedIds.some((id) => changed.has(id))) { changed.add(record.id); break }
      }
    }
  }

  let recomputedCount = 0
  const projected = records.map((record) => {
    const cached = previousById.get(record.id)
    if (cached && !changed.has(record.id) && cached.updatedAt === record.updatedAt) return cached
    recomputedCount += 1
    return resolveRecord(record, byId, derived, relationTargets)
  })
  return { records: projected, recomputedCount }
}

function derivedProperties(schema: DatabaseSchema) {
  return {
    schemaId: schema.id,
    properties: schema.properties,
    rollups: schema.properties.filter((candidate) => candidate.type === 'rollup' && candidate.rollup),
    formulas: schema.properties.filter((candidate) => candidate.type === 'formula' && candidate.formula),
  }
}

function resolveRecord(record: DatabaseRecord, byId: Map<string, DatabaseRecord>, derived: ReturnType<typeof derivedProperties>, relationTargets: Record<string, RelationTargetSnapshot>) {
  const values = { ...record.values }
  for (const property of derived.rollups) {
    const config = property.rollup!
    const relationProperty = derived.properties.find((candidate) => candidate.id === config.relationPropertyId && candidate.type === 'relation')
    const targetDatabaseId = relationProperty?.relation?.databaseId
    const targetRecords = targetDatabaseId && targetDatabaseId !== derived.schemaId
      ? relationTargets[targetDatabaseId]?.records
      : undefined
    const targetById = targetRecords ? new Map(targetRecords.map((candidate) => [candidate.id, candidate])) : byId
    const relatedIds = values[config.relationPropertyId]
    const relatedValues = Array.isArray(relatedIds)
      ? relatedIds.map((id) => targetById.get(id)?.values[config.targetPropertyId] ?? null).filter((value) => value !== null)
      : []
    values[property.id] = aggregateRollup(relatedValues, config.aggregation)
  }
  for (const property of derived.formulas) {
    // Notion-style formulas address properties by display name. Internal IDs
    // remain available so existing formulas and imported workspaces stay valid.
    const context = { ...values }
    for (const candidate of derived.properties) context[candidate.name] = values[candidate.id] ?? null
    values[property.id] = evaluateFormula(property.formula!.expression, context)
  }
  return { ...record, values }
}

export function evaluateFormula(expression: string, values: Record<string, PropertyValue>): PropertyValue {
  try {
    if (expression.length > 1000) return null
    const parser = new FormulaParser(tokenizeFormula(expression), values)
    return normalizeFormulaResult(parser.parse())
  } catch { return null }
}

/** Syntax-only validation used by the visual formula editor before saving. */
export function validateFormulaExpression(expression: string) {
  try {
    if (!expression.trim() || expression.length > 1000) return false
    new FormulaParser(tokenizeFormula(expression), Object.create(null) as Record<string, PropertyValue>).parse()
    return true
  } catch { return false }
}

function aggregateRollup(values: PropertyValue[], aggregation: NonNullable<DatabaseProperty['rollup']>['aggregation']): PropertyValue {
  if (aggregation === 'count') return values.length
  if (aggregation === 'showOriginal') return values.flatMap((value) => Array.isArray(value) ? value : [String(value)])
  const numbers = values.map(Number).filter(Number.isFinite)
  if (!numbers.length) return null
  if (aggregation === 'sum') return numbers.reduce((sum, value) => sum + value, 0)
  if (aggregation === 'average') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  return aggregation === 'min' ? Math.min(...numbers) : Math.max(...numbers)
}

type FormulaToken = { type: 'number' | 'string' | 'reference' | 'identifier' | 'operator' | 'punctuation' | 'eof'; value: string }

function tokenizeFormula(expression: string) {
  const tokens: FormulaToken[] = []
  let index = 0
  while (index < expression.length) {
    const rest = expression.slice(index)
    const whitespace = rest.match(/^\s+/u); if (whitespace) { index += whitespace[0].length; continue }
    const reference = rest.match(/^\[([^\]\n]{1,128})\]/u); if (reference) { tokens.push({ type: 'reference', value: reference[1]! }); index += reference[0].length; continue }
    const string = rest.match(/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/u); if (string) { tokens.push({ type: 'string', value: string[0] }); index += string[0].length; continue }
    const number = rest.match(/^\d+(?:\.\d+)?/u); if (number) { tokens.push({ type: 'number', value: number[0] }); index += number[0].length; continue }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/u); if (identifier) { tokens.push({ type: 'identifier', value: identifier[0] }); index += identifier[0].length; continue }
    const operator = rest.match(/^(?:>=|<=|==|!=|&&|\|\||[+\-*/><!])/u); if (operator) { tokens.push({ type: 'operator', value: operator[0] }); index += operator[0].length; continue }
    if (['(', ')', ','].includes(rest[0]!)) { tokens.push({ type: 'punctuation', value: rest[0]! }); index += 1; continue }
    throw new Error('Invalid formula token')
  }
  if (tokens.length > 256) throw new Error('Formula is too complex')
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

class FormulaParser {
  private index = 0
  private depth = 0
  constructor(private readonly tokens: FormulaToken[], private readonly values: Record<string, PropertyValue>) {}
  parse(): unknown { const value = this.expression(0); if (this.peek().type !== 'eof') throw new Error('Unexpected token'); return value }
  private expression(minimum: number): unknown {
    if (++this.depth > 32) throw new Error('Formula nesting is too deep')
    let left = this.prefix()
    const precedence: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6 }
    while (this.peek().type === 'operator' && (precedence[this.peek().value] ?? 0) >= minimum) {
      const operator = this.take().value; const level = precedence[operator]!
      const right = this.expression(level + 1); left = applyFormulaOperator(operator, left, right)
    }
    this.depth -= 1
    return left
  }
  private prefix(): unknown {
    const token = this.take()
    if (token.type === 'number') return Number(token.value)
    if (token.type === 'string') return JSON.parse(token.value.startsWith("'") ? `"${token.value.slice(1, -1).replaceAll('"', '\\"')}"` : token.value)
    if (token.type === 'reference') return this.values[token.value] ?? null
    if (token.type === 'operator' && ['-', '!'].includes(token.value)) { const value = this.expression(7); return token.value === '-' ? -Number(value) : !value }
    if (token.value === '(') { const value = this.expression(0); this.expect(')'); return value }
    if (token.type === 'identifier') {
      if (['true', 'false', 'null'].includes(token.value)) return token.value === 'true' ? true : token.value === 'false' ? false : null
      this.expect('('); const args: unknown[] = []
      if (this.peek().value !== ')') { do { args.push(this.expression(0)) } while (this.peek().value === ',' && this.take()) }
      this.expect(')'); return applyFormulaFunction(token.value, args)
    }
    throw new Error('Invalid formula expression')
  }
  private peek() { return this.tokens[this.index]! }
  private take() { return this.tokens[this.index++]! }
  private expect(value: string) { if (this.take().value !== value) throw new Error(`Expected ${value}`) }
}

function applyFormulaOperator(operator: string, left: unknown, right: unknown): unknown {
  if (operator === '+') return typeof left === 'string' || typeof right === 'string' ? `${left ?? ''}${right ?? ''}` : Number(left) + Number(right)
  if (operator === '-') return Number(left) - Number(right)
  if (operator === '*') return Number(left) * Number(right)
  if (operator === '/') return Number(right) === 0 ? null : Number(left) / Number(right)
  if (operator === '&&') return Boolean(left) && Boolean(right)
  if (operator === '||') return Boolean(left) || Boolean(right)
  if (operator === '==') return left === right
  if (operator === '!=') return left !== right
  if (operator === '>') return Number(left) > Number(right)
  if (operator === '<') return Number(left) < Number(right)
  if (operator === '>=') return Number(left) >= Number(right)
  return Number(left) <= Number(right)
}

function applyFormulaFunction(name: string, args: unknown[]): unknown {
  if (name === 'if') return args[0] ? args[1] : args[2]
  if (name === 'concat') return args.map((value) => String(value ?? '')).join('')
  if (name === 'round') { const precision = Math.max(0, Math.min(8, Number(args[1] ?? 0))); const factor = 10 ** precision; return Math.round(Number(args[0]) * factor) / factor }
  if (name === 'length') return Array.isArray(args[0]) || typeof args[0] === 'string' ? args[0].length : 0
  throw new Error('Unknown formula function')
}

function normalizeFormulaResult(value: unknown): PropertyValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(String)
  return null
}

export function queryRecords(
  records: DatabaseRecord[],
  filters: FilterRule[] = [],
  sorts: SortRule[] = [],
  filterMode: 'and' | 'or' = 'and',
): DatabaseRecord[] {
  const filtered = filters.length
    ? records.filter((record) => filterMode === 'or'
      ? filters.some((filter) => matchesFilter(record.values[filter.propertyId], filter))
      : filters.every((filter) => matchesFilter(record.values[filter.propertyId], filter)))
    : [...records]

  if (!sorts.length) return filtered

  // Modern JS sort is stable; the original index remains the final tie-breaker.
  return filtered.sort((left, right) => {
    for (const sort of sorts) {
      const comparison = compareValues(left.values[sort.propertyId], right.values[sort.propertyId])
      if (comparison !== 0) return sort.direction === 'asc' ? comparison : -comparison
    }
    return 0
  })
}

/** Removes stale or oversized rules before view configuration is persisted. */
export function normalizeViewConfig(schema: DatabaseSchema, config: DatabaseViewConfig): DatabaseViewConfig {
  const propertyIds = new Set(schema.properties.map((property) => property.id))
  const validOperators = new Set<FilterRule['operator']>(['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty', 'greaterThan', 'lessThan'])
  const filters = (config.filters ?? []).filter((rule) => propertyIds.has(rule.propertyId) && validOperators.has(rule.operator)).slice(0, 20)
  const seenSorts = new Set<string>()
  const sorts = (config.sorts ?? []).filter((rule) => propertyIds.has(rule.propertyId) && ['asc', 'desc'].includes(rule.direction) && !seenSorts.has(rule.propertyId) && Boolean(seenSorts.add(rule.propertyId))).slice(0, 10)
  const groupByPropertyId = config.groupByPropertyId && propertyIds.has(config.groupByPropertyId) ? config.groupByPropertyId : undefined
  const visiblePropertyIds = config.visiblePropertyIds === undefined ? undefined : [...new Set(config.visiblePropertyIds.filter((id) => propertyIds.has(id)))].slice(0, 50)
  const propertyWidths = Object.fromEntries(Object.entries(config.propertyWidths ?? {}).filter(([id, width]) => propertyIds.has(id) && Number.isFinite(width)).map(([id, width]) => [id, Math.max(80, Math.min(600, Math.round(width)))]))
  const rowHeight = ['compact', 'default', 'comfortable'].includes(config.rowHeight ?? '') ? config.rowHeight : 'default'
  return { ...config, filters, filterMode: config.filterMode === 'or' ? 'or' : 'and', sorts, groupByPropertyId, visiblePropertyIds, propertyWidths, rowHeight }
}

/**
 * Builds stable groups in one pass. Multi-value properties can place a record
 * in several groups, while the group cap prevents unbounded section creation.
 */
export function groupRecordsByProperty(records: DatabaseRecord[], propertyId: string, limit = 100) {
  const groups = new Map<string, DatabaseRecord[]>()
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  for (const record of records) {
    const raw = record.values[propertyId]
    const values = Array.isArray(raw) ? [...new Set(raw)].slice(0, 20) : [raw]
    for (const value of values.length ? values : [null]) {
      const key = value === null || value === '' ? '__empty__' : String(value)
      const targetKey = groups.has(key) || groups.size < safeLimit ? key : '__other__'
      const group = groups.get(targetKey) ?? []
      group.push(record); groups.set(targetKey, group)
    }
  }
  return [...groups].map(([key, groupedRecords]) => ({ key, label: key === '__empty__' ? '未填写' : key === '__other__' ? '其他' : key, records: groupedRecords }))
}

/** Builds a stable Monday-first 6×7 grid without local-time/DST drift. */
export function buildCalendarMonth(year: number, month: number): CalendarDay[] {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 0 || month > 11) throw new TypeError('Invalid calendar month.')
  const first = new Date(Date.UTC(year, month, 1))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const start = Date.UTC(year, month, 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + index * 86_400_000)
    return { date: date.toISOString().slice(0, 10), day: date.getUTCDate(), inCurrentMonth: date.getUTCMonth() === month }
  })
}

/** Groups valid ISO dates in one pass so month rendering remains O(records + 42). */
export function groupRecordsByDate(records: DatabaseRecord[], propertyId: string) {
  const groups: Record<string, DatabaseRecord[]> = Object.create(null) as Record<string, DatabaseRecord[]>
  const unscheduled: DatabaseRecord[] = []
  for (const record of records) {
    const value = record.values[propertyId]
    const date = typeof value === 'string' ? /^\d{4}-\d{2}-\d{2}/u.exec(value)?.[0] : undefined
    if (!date || !isValidIsoDate(date)) { unscheduled.push(record); continue }
    ;(groups[date] ??= []).push(record)
  }
  return { groups, unscheduled }
}

function isValidIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return false
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

/**
 * Clips record ranges to a bounded timeline window in one pass. The result cap
 * prevents a pathological database from creating thousands of DOM rows.
 */
export function layoutTimelineRecords(records: DatabaseRecord[], startPropertyId: string, endPropertyId: string, rangeStart: string, rangeDays = 28, limit = 200) {
  const startMs = isoDateMilliseconds(rangeStart)
  if (startMs === null || !Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 366) throw new TypeError('Invalid timeline range.')
  const rangeEndMs = startMs + (rangeDays - 1) * 86_400_000
  const items: TimelineItem[] = []; const unscheduled: DatabaseRecord[] = []; let matchingCount = 0
  for (const record of records) {
    const rawStart = record.values[startPropertyId]; const rawEnd = record.values[endPropertyId]
    const recordStart = typeof rawStart === 'string' ? isoDateMilliseconds(rawStart.slice(0, 10)) : null
    const recordEnd = typeof rawEnd === 'string' ? isoDateMilliseconds(rawEnd.slice(0, 10)) : null
    if (recordStart === null && recordEnd === null) { unscheduled.push(record); continue }
    const normalizedStart = recordStart ?? recordEnd!; const normalizedEnd = Math.max(normalizedStart, recordEnd ?? normalizedStart)
    if (normalizedEnd < startMs || normalizedStart > rangeEndMs) continue
    matchingCount += 1
    if (items.length >= Math.max(1, Math.min(500, limit))) continue
    items.push({ record, startIndex: Math.max(0, Math.floor((normalizedStart - startMs) / 86_400_000)), endIndex: Math.min(rangeDays - 1, Math.floor((normalizedEnd - startMs) / 86_400_000)), durationDays: Math.floor((normalizedEnd - normalizedStart) / 86_400_000) + 1, startsBeforeRange: normalizedStart < startMs, endsAfterRange: normalizedEnd > rangeEndMs })
  }
  return { items, unscheduled, matchingCount, truncatedCount: matchingCount - items.length }
}

export function timelineDays(rangeStart: string, count = 28) {
  const start = isoDateMilliseconds(rangeStart)
  if (start === null || !Number.isInteger(count) || count < 1 || count > 366) throw new TypeError('Invalid timeline range.')
  return Array.from({ length: count }, (_, index) => { const date = new Date(start + index * 86_400_000); return { date: date.toISOString().slice(0, 10), day: date.getUTCDate(), weekday: date.getUTCDay(), month: date.getUTCMonth() + 1 } })
}

/**
 * Selects a bounded card window for Gallery views. Keeping this operation
 * separate from React makes the DOM budget explicit and easy to benchmark.
 */
export function prepareGalleryRecords(records: DatabaseRecord[], limit = 120) {
  const safeLimit = Math.max(1, Math.min(300, Math.trunc(limit)))
  return { records: records.slice(0, safeLimit), truncatedCount: Math.max(0, records.length - safeLimit) }
}

/** Returns a bounded render window shared by table, list and board views. */
export function virtualWindow(itemCount: number, scrollTop: number, rowHeight: number, viewportHeight: number, overscan = 4) {
  const count = Math.max(0, Math.trunc(itemCount))
  const height = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 1
  const viewport = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : height
  const safeScroll = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0)
  const buffer = Math.max(0, Math.min(50, Math.trunc(overscan)))
  const start = Math.max(0, Math.floor(safeScroll / height) - buffer)
  const end = Math.min(count, Math.ceil((safeScroll + viewport) / height) + buffer)
  return { start, end, offset: start * height, totalSize: count * height }
}

/**
 * Allows only renderer-safe local bitmap sources. Remote URLs are deliberately
 * rejected: database text must not become an unapproved outbound request.
 */
export function safeGalleryCover(value: PropertyValue | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_000_000) return null
  if (/^notetodo-asset:\/\/[a-f0-9]{64}(?:\/[^?#]*)?(?:[?#].*)?$/u.test(value)) return value
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/iu.test(value)) return value
  return null
}

function isoDateMilliseconds(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !isValidIsoDate(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year!, month! - 1, day!)
}

/**
 * Applies deterministic, record-local automations after a user edit. The
 * engine has no timers, network access or dynamic code execution, so the same
 * input produces the same patches in the renderer, desktop process and tests.
 */
export function runDatabaseAutomations(
  schema: DatabaseSchema,
  record: DatabaseRecord,
  changedPropertyId: string,
  automations: DatabaseAutomation[],
): { record: DatabaseRecord; executions: AutomationExecution[] } {
  let nextRecord = { ...record, values: { ...record.values } }
  const executions: AutomationExecution[] = []
  for (const automation of automations.slice(0, 50)) {
    if (!automation.enabled || automation.trigger.propertyId !== changedPropertyId) continue
    if (automation.condition && queryRecords([nextRecord], [automation.condition]).length === 0) continue
    for (const action of automation.actions.slice(0, 20)) {
      const property = schema.properties.find((candidate) => candidate.id === action.propertyId)
      if (!property || property.type === 'formula' || property.type === 'rollup') continue
      const value = normalizePropertyValue(property, action.value)
      nextRecord = { ...nextRecord, values: { ...nextRecord.values, [property.id]: value } }
      executions.push({ automationId: automation.id, propertyId: property.id, value })
    }
  }
  return { record: nextRecord, executions }
}

function matchesFilter(value: PropertyValue, filter: FilterRule) {
  const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0)
  if (filter.operator === 'isEmpty') return empty
  if (filter.operator === 'isNotEmpty') return !empty
  if (filter.operator === 'equals') return Object.is(value, filter.value)
  if (filter.operator === 'notEquals') return !Object.is(value, filter.value)
  if (filter.operator === 'contains') {
    if (Array.isArray(value)) return typeof filter.value === 'string' && value.includes(filter.value)
    return String(value ?? '').toLocaleLowerCase().includes(String(filter.value ?? '').toLocaleLowerCase())
  }
  if (empty) return false
  const left = Number(value)
  const right = Number(filter.value)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  return filter.operator === 'greaterThan' ? left > right : left < right
}

function compareValues(left: PropertyValue, right: PropertyValue) {
  if (left === right) return 0
  if (left === null) return 1
  if (right === null) return -1
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
  return String(left).localeCompare(String(right), 'zh-CN', { numeric: true, sensitivity: 'base' })
}
