import { queryRecords } from './views'

export { inferCsvPropertyMappings, parseDatabaseCsv, serializeDatabaseCsv } from './csv'
export type { ParsedDatabaseCsv } from './csv'
export {
  buildCalendarMonth,
  calculateColumn,
  groupRecordsByDate,
  groupRecordsByProperty,
  layoutTimelineRecords,
  moveRecordInOrder,
  normalizeViewConfig,
  orderRecordsByView,
  prepareGalleryRecords,
  queryRecords,
  safeGalleryCover,
  searchDatabaseRecords,
  timelineDays,
  validColumnCalculations,
  virtualWindow,
} from './views'

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
  relation?: { databaseId: string; reciprocalPropertyId?: string }
  rollup?: { relationPropertyId: string; targetPropertyId: string; aggregation: 'count' | 'sum' | 'average' | 'min' | 'max' | 'showOriginal' }
  formula?: { expression: string }
  /** Write-time rules shared by SQLite, imports and the browser fallback. */
  constraints?: PropertyConstraints
}

export type PropertyValue = string | number | boolean | string[] | null

export interface PropertyConstraints {
  required?: boolean
  unique?: boolean
  defaultValue?: PropertyValue
}

export interface DatabaseRecord {
  id: string
  values: Record<string, PropertyValue>
  /** Rich-text HTML owned by the record detail page. Optional for legacy snapshots. */
  content?: string
  createdAt: string
  updatedAt: string
}

export interface DatabaseTrashRecord {
  id: string
  title: string
  trashedAt: string
}

export interface DatabaseRecordHistory {
  id: string
  recordId: string
  propertyId: string | null
  propertyName: string
  kind: 'property' | 'content'
  previous: PropertyValue | string
  next: PropertyValue | string
  createdAt: string
}

export interface DatabaseRecordComment {
  id: string
  recordId: string
  propertyId: string | null
  propertyName: string
  authorName: string
  body: string
  resolvedAt: string | null
  createdAt: string
}

export interface DatabaseRecordReminder {
  id: string
  recordId: string
  propertyId: string
  propertyName: string
  dueAt: string
  note: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
  overdue: boolean
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
  /** Compact AND filters shown as removable chips in the view toolbar. */
  quickFilters?: FilterRule[]
  filterMode?: 'and' | 'or'
  sorts?: SortRule[]
  groupByPropertyId?: string
  /** Stable group keys collapsed by the user in this saved view. */
  collapsedGroupKeys?: string[]
  /** View-local manual order. Missing record IDs retain their source order. */
  recordOrder?: string[]
  datePropertyId?: string
  startDatePropertyId?: string
  endDatePropertyId?: string
  coverPropertyId?: string
  visiblePropertyIds?: string[]
  propertyWidths?: Record<string, number>
  rowHeight?: 'compact' | 'default' | 'comfortable'
  propertyOrder?: string[]
  freezeFirstColumn?: boolean
  calculations?: Record<string, ColumnCalculation>
  cardSize?: 'small' | 'medium' | 'large'
}

export type ColumnCalculation = 'count' | 'countValues' | 'sum' | 'average' | 'min' | 'max' | 'earliest' | 'latest' | 'percentChecked'

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

/** Empty is deliberately narrower than JavaScript falsiness: 0 and false are valid values. */
export function isEmptyPropertyValue(value: PropertyValue | undefined): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

/** Returns the canonical configured default, or null when no default is configured. */
export function configuredDefaultValue(property: DatabaseProperty): PropertyValue {
  return Object.prototype.hasOwnProperty.call(property.constraints ?? {}, 'defaultValue')
    ? normalizePropertyValue(property, property.constraints!.defaultValue)
    : null
}

/**
 * Checks record-level rules without knowing anything about persistence. The
 * caller may exclude the edited record so unchanged unique values remain valid.
 */
export function validatePropertyConstraints(
  property: DatabaseProperty,
  value: PropertyValue,
  records: DatabaseRecord[] = [],
  recordId?: string,
): string | null {
  if (property.constraints?.required && isEmptyPropertyValue(value)) return `${property.name} 为必填属性。`
  if (property.constraints?.unique && !isEmptyPropertyValue(value)) {
    const key = stablePropertyValueKey(value)
    if (records.some((record) => record.id !== recordId && stablePropertyValueKey(record.values[property.id] ?? null) === key)) return `${property.name} 的值必须唯一。`
  }
  return null
}

function stablePropertyValueKey(value: PropertyValue) {
  return Array.isArray(value) ? `a:${[...value].sort().join('\u0000')}` : `${typeof value}:${String(value)}`
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
