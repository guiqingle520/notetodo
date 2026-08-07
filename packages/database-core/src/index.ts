export type PropertyType = 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'multiSelect' | 'date' | 'url' | 'relation' | 'rollup' | 'formula'

export interface SelectOption {
  id: string
  name: string
  color: 'slate' | 'red' | 'amber' | 'green' | 'blue'
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
  type: 'table' | 'board' | 'list' | 'calendar'
  config: {
    filters?: FilterRule[]
    sorts?: SortRule[]
    groupByPropertyId?: string
    datePropertyId?: string
  }
}

export interface CalendarDay {
  date: string
  day: number
  inCurrentMonth: boolean
}

export interface DatabaseSnapshot {
  schema: DatabaseSchema
  records: DatabaseRecord[]
  views: DatabaseView[]
  activeViewId: string
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
export function resolveDerivedRecords(schema: DatabaseSchema, records: DatabaseRecord[]): DatabaseRecord[] {
  const byId = new Map(records.map((record) => [record.id, record]))
  return records.map((record) => {
    const values = { ...record.values }
    for (const property of schema.properties.filter((candidate) => candidate.type === 'rollup' && candidate.rollup)) {
      const config = property.rollup!
      const relatedIds = values[config.relationPropertyId]
      const relatedValues = Array.isArray(relatedIds)
        ? relatedIds.map((id) => byId.get(id)?.values[config.targetPropertyId] ?? null).filter((value) => value !== null)
        : []
      values[property.id] = aggregateRollup(relatedValues, config.aggregation)
    }
    for (const property of schema.properties.filter((candidate) => candidate.type === 'formula' && candidate.formula)) {
      values[property.id] = evaluateFormula(property.formula!.expression, values)
    }
    return { ...record, values }
  })
}

export function evaluateFormula(expression: string, values: Record<string, PropertyValue>): PropertyValue {
  try {
    if (expression.length > 1000) return null
    const parser = new FormulaParser(tokenizeFormula(expression), values)
    return normalizeFormulaResult(parser.parse())
  } catch { return null }
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
): DatabaseRecord[] {
  const filtered = filters.length
    ? records.filter((record) => filters.every((filter) => matchesFilter(record.values[filter.propertyId], filter)))
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
