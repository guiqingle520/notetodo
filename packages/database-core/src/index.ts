export type PropertyType = 'title' | 'text' | 'number' | 'checkbox' | 'select' | 'multiSelect' | 'date' | 'url'

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
  type: 'table' | 'board' | 'list'
  config: {
    filters?: FilterRule[]
    sorts?: SortRule[]
    groupByPropertyId?: string
  }
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

/**
 * Converts UI input to the schema's canonical value. Invalid values become
 * null instead of leaking mixed types into sorting, formulas and sync.
 */
export function normalizePropertyValue(property: DatabaseProperty, input: unknown): PropertyValue {
  if (input === null || input === undefined || input === '') return null
  switch (property.type) {
    case 'checkbox': return Boolean(input)
    case 'number': {
      const value = typeof input === 'number' ? input : Number(input)
      return Number.isFinite(value) ? value : null
    }
    case 'multiSelect': return Array.isArray(input) ? input.filter((value): value is string => typeof value === 'string') : null
    default: return typeof input === 'string' ? input : String(input)
  }
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
