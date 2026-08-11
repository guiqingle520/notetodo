import type {
  CalendarDay,
  ColumnCalculation,
  DatabaseProperty,
  DatabaseRecord,
  DatabaseSchema,
  DatabaseViewConfig,
  FilterRule,
  PropertyValue,
  SortRule,
  TimelineItem,
} from './index'

export function queryRecords(
  records: DatabaseRecord[],
  filters: FilterRule[] = [],
  sorts: SortRule[] = [],
  filterMode: 'and' | 'or' = 'and',
): DatabaseRecord[] {
  const filtered = filters.length
    ? records.filter((record) =>
        filterMode === 'or'
          ? filters.some((filter) =>
              matchesFilter(record.values[filter.propertyId] ?? null, filter),
            )
          : filters.every((filter) =>
              matchesFilter(record.values[filter.propertyId] ?? null, filter),
            ),
      )
    : [...records]

  if (!sorts.length) return filtered

  // Modern JS sort is stable; the original index remains the final tie-breaker.
  return filtered.sort((left, right) => {
    for (const sort of sorts) {
      const comparison = compareValues(
        left.values[sort.propertyId] ?? null,
        right.values[sort.propertyId] ?? null,
      )
      if (comparison !== 0) return sort.direction === 'asc' ? comparison : -comparison
    }
    return 0
  })
}

/**
 * Searches every visible database value without allocating a joined string per
 * record. Option labels are indexed once so saved IDs also match human text.
 */
export function searchDatabaseRecords(
  records: DatabaseRecord[],
  schema: DatabaseSchema,
  query: string,
): DatabaseRecord[] {
  const needle = query.trim().normalize('NFKC').toLocaleLowerCase().slice(0, 200)
  if (!needle) return records
  const properties = schema.properties.slice(0, 50)
  const optionLabels = new Map<string, string>()
  for (const property of properties)
    for (const option of property.options ?? [])
      optionLabels.set(
        `${property.id}\u0000${option.id}`,
        option.name.normalize('NFKC').toLocaleLowerCase(),
      )
  return records.filter((record) =>
    properties.some((property) => {
      const raw = record.values[property.id]
      const values = Array.isArray(raw) ? raw : [raw]
      return values.some((value) => {
        if (value === null) return false
        const normalized = String(value).normalize('NFKC').toLocaleLowerCase()
        return (
          normalized.includes(needle) ||
          (optionLabels.get(`${property.id}\u0000${String(value)}`)?.includes(needle) ?? false)
        )
      })
    }),
  )
}

/** Applies a partial saved order in O(records + saved IDs) without sorting. */
export function orderRecordsByView(
  records: DatabaseRecord[],
  recordOrder?: string[],
): DatabaseRecord[] {
  if (!recordOrder?.length) return records
  const byId = new Map(records.map((record) => [record.id, record]))
  const ordered: DatabaseRecord[] = []
  for (const id of recordOrder) {
    const record = byId.get(id)
    if (record) {
      ordered.push(record)
      byId.delete(id)
    }
  }
  for (const record of records) if (byId.has(record.id)) ordered.push(record)
  return ordered
}

/** Returns a deduplicated order with the dragged ID inserted before target. */
export function moveRecordInOrder(
  recordIds: string[],
  draggedId: string,
  targetId?: string,
): string[] {
  const unique = [...new Set(recordIds)]
  if (!unique.includes(draggedId) || targetId === draggedId) return unique
  const next = unique.filter((id) => id !== draggedId)
  const targetIndex = targetId ? next.indexOf(targetId) : -1
  next.splice(targetIndex < 0 ? next.length : targetIndex, 0, draggedId)
  return next
}

/** Removes stale or oversized rules before view configuration is persisted. */
export function normalizeViewConfig(
  schema: DatabaseSchema,
  config: DatabaseViewConfig,
): DatabaseViewConfig {
  const propertyIds = new Set(schema.properties.map((property) => property.id))
  const validOperators = new Set<FilterRule['operator']>([
    'equals',
    'notEquals',
    'contains',
    'isEmpty',
    'isNotEmpty',
    'greaterThan',
    'lessThan',
  ])
  const sanitizeFilters = (rules: FilterRule[] | undefined, limit: number) =>
    (rules ?? [])
      .filter((rule) => propertyIds.has(rule.propertyId) && validOperators.has(rule.operator))
      .slice(0, limit)
  const filters = sanitizeFilters(config.filters, 20)
  const quickFilters = sanitizeFilters(config.quickFilters, 5)
  const seenSorts = new Set<string>()
  const sorts = (config.sorts ?? [])
    .filter(
      (rule) =>
        propertyIds.has(rule.propertyId) &&
        ['asc', 'desc'].includes(rule.direction) &&
        !seenSorts.has(rule.propertyId) &&
        Boolean(seenSorts.add(rule.propertyId)),
    )
    .slice(0, 10)
  const groupByPropertyId =
    config.groupByPropertyId && propertyIds.has(config.groupByPropertyId)
      ? config.groupByPropertyId
      : undefined
  const collapsedGroupKeys = groupByPropertyId
    ? [
        ...new Set(
          (config.collapsedGroupKeys ?? []).filter(
            (key) => typeof key === 'string' && key.length > 0 && key.length <= 200,
          ),
        ),
      ].slice(0, 100)
    : []
  const recordOrder = [
    ...new Set(
      (config.recordOrder ?? []).filter(
        (id) => typeof id === 'string' && id.length > 0 && id.length <= 200,
      ),
    ),
  ].slice(0, 10_000)
  const visiblePropertyIds =
    config.visiblePropertyIds === undefined
      ? undefined
      : [...new Set(config.visiblePropertyIds.filter((id) => propertyIds.has(id)))].slice(0, 50)
  const propertyWidths = Object.fromEntries(
    Object.entries(config.propertyWidths ?? {})
      .filter(([id, width]) => propertyIds.has(id) && Number.isFinite(width))
      .map(([id, width]) => [id, Math.max(80, Math.min(600, Math.round(width)))]),
  )
  const rowHeight = ['compact', 'default', 'comfortable'].includes(config.rowHeight ?? '')
    ? config.rowHeight
    : 'default'
  const orderedIds = [...new Set((config.propertyOrder ?? []).filter((id) => propertyIds.has(id)))]
  const propertyOrder =
    config.propertyOrder === undefined
      ? undefined
      : [
          ...orderedIds,
          ...schema.properties
            .map((property) => property.id)
            .filter((id) => !orderedIds.includes(id)),
        ]
  const calculations = Object.fromEntries(
    Object.entries(config.calculations ?? {}).filter(([id, calculation]) => {
      const property = schema.properties.find((candidate) => candidate.id === id)
      return property && validColumnCalculations(property).includes(calculation)
    }),
  )
  return {
    ...config,
    filters,
    quickFilters,
    filterMode: config.filterMode === 'or' ? 'or' : 'and',
    sorts,
    groupByPropertyId,
    collapsedGroupKeys,
    recordOrder,
    visiblePropertyIds,
    propertyWidths,
    rowHeight,
    propertyOrder,
    freezeFirstColumn: Boolean(config.freezeFirstColumn),
    calculations,
  }
}

export function validColumnCalculations(property: DatabaseProperty): ColumnCalculation[] {
  const base: ColumnCalculation[] = ['count', 'countValues']
  if (property.type === 'number' || property.type === 'rollup' || property.type === 'formula')
    return [...base, 'sum', 'average', 'min', 'max']
  if (property.type === 'date') return [...base, 'earliest', 'latest']
  if (property.type === 'checkbox') return [...base, 'percentChecked']
  return base
}

/** Computes one configured footer aggregate in a single bounded pass. */
export function calculateColumn(
  records: DatabaseRecord[],
  propertyId: string,
  calculation: ColumnCalculation,
): PropertyValue {
  if (calculation === 'count') return records.length
  const values = records
    .map((record) => record.values[propertyId])
    .filter(
      (value) => value !== null && value !== '' && (!Array.isArray(value) || value.length > 0),
    )
  if (calculation === 'countValues') return values.length
  if (calculation === 'percentChecked')
    return records.length
      ? Math.round((values.filter(Boolean).length / records.length) * 1000) / 10
      : 0
  if (calculation === 'earliest' || calculation === 'latest') {
    const dates = values
      .filter(
        (value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/u.test(value),
      )
      .sort()
    return dates.length ? (calculation === 'earliest' ? dates[0]! : dates.at(-1)!) : null
  }
  const numbers = values.map(Number).filter(Number.isFinite)
  if (!numbers.length) return null
  if (calculation === 'sum') return numbers.reduce((sum, value) => sum + value, 0)
  if (calculation === 'average')
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  return calculation === 'min' ? Math.min(...numbers) : Math.max(...numbers)
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
      group.push(record)
      groups.set(targetKey, group)
    }
  }
  return [...groups].map(([key, groupedRecords]) => ({
    key,
    label: key === '__empty__' ? '未填写' : key === '__other__' ? '其他' : key,
    records: groupedRecords,
  }))
}

/** Builds a stable Monday-first 6×7 grid without local-time/DST drift. */
export function buildCalendarMonth(year: number, month: number): CalendarDay[] {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 0 ||
    month > 11
  )
    throw new TypeError('Invalid calendar month.')
  const first = new Date(Date.UTC(year, month, 1))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const start = Date.UTC(year, month, 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + index * 86_400_000)
    return {
      date: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === month,
    }
  })
}

/** Groups valid ISO dates in one pass so month rendering remains O(records + 42). */
export function groupRecordsByDate(records: DatabaseRecord[], propertyId: string) {
  const groups: Record<string, DatabaseRecord[]> = Object.create(null) as Record<
    string,
    DatabaseRecord[]
  >
  const unscheduled: DatabaseRecord[] = []
  for (const record of records) {
    const value = record.values[propertyId]
    const date = typeof value === 'string' ? /^\d{4}-\d{2}-\d{2}/u.exec(value)?.[0] : undefined
    if (!date || !isValidIsoDate(date)) {
      unscheduled.push(record)
      continue
    }
    ;(groups[date] ??= []).push(record)
  }
  return { groups, unscheduled }
}

function isValidIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return false
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

/**
 * Clips record ranges to a bounded timeline window in one pass. The result cap
 * prevents a pathological database from creating thousands of DOM rows.
 */
export function layoutTimelineRecords(
  records: DatabaseRecord[],
  startPropertyId: string,
  endPropertyId: string,
  rangeStart: string,
  rangeDays = 28,
  limit = 200,
) {
  const startMs = isoDateMilliseconds(rangeStart)
  if (startMs === null || !Number.isInteger(rangeDays) || rangeDays < 1 || rangeDays > 366)
    throw new TypeError('Invalid timeline range.')
  const rangeEndMs = startMs + (rangeDays - 1) * 86_400_000
  const items: TimelineItem[] = []
  const unscheduled: DatabaseRecord[] = []
  let matchingCount = 0
  for (const record of records) {
    const rawStart = record.values[startPropertyId]
    const rawEnd = record.values[endPropertyId]
    const recordStart =
      typeof rawStart === 'string' ? isoDateMilliseconds(rawStart.slice(0, 10)) : null
    const recordEnd = typeof rawEnd === 'string' ? isoDateMilliseconds(rawEnd.slice(0, 10)) : null
    if (recordStart === null && recordEnd === null) {
      unscheduled.push(record)
      continue
    }
    const normalizedStart = recordStart ?? recordEnd!
    const normalizedEnd = Math.max(normalizedStart, recordEnd ?? normalizedStart)
    if (normalizedEnd < startMs || normalizedStart > rangeEndMs) continue
    matchingCount += 1
    if (items.length >= Math.max(1, Math.min(500, limit))) continue
    items.push({
      record,
      startIndex: Math.max(0, Math.floor((normalizedStart - startMs) / 86_400_000)),
      endIndex: Math.min(rangeDays - 1, Math.floor((normalizedEnd - startMs) / 86_400_000)),
      durationDays: Math.floor((normalizedEnd - normalizedStart) / 86_400_000) + 1,
      startsBeforeRange: normalizedStart < startMs,
      endsAfterRange: normalizedEnd > rangeEndMs,
    })
  }
  return { items, unscheduled, matchingCount, truncatedCount: matchingCount - items.length }
}

export function timelineDays(rangeStart: string, count = 28) {
  const start = isoDateMilliseconds(rangeStart)
  if (start === null || !Number.isInteger(count) || count < 1 || count > 366)
    throw new TypeError('Invalid timeline range.')
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + index * 86_400_000)
    return {
      date: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      weekday: date.getUTCDay(),
      month: date.getUTCMonth() + 1,
    }
  })
}

/**
 * Selects a bounded card window for Gallery views. Keeping this operation
 * separate from React makes the DOM budget explicit and easy to benchmark.
 */
export function prepareGalleryRecords(records: DatabaseRecord[], limit = 120) {
  const safeLimit = Math.max(1, Math.min(300, Math.trunc(limit)))
  return {
    records: records.slice(0, safeLimit),
    truncatedCount: Math.max(0, records.length - safeLimit),
  }
}

/** Returns a bounded render window shared by table, list and board views. */
export function virtualWindow(
  itemCount: number,
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
  overscan = 4,
) {
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
function matchesFilter(value: PropertyValue, filter: FilterRule) {
  const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0)
  if (filter.operator === 'isEmpty') return empty
  if (filter.operator === 'isNotEmpty') return !empty
  if (filter.operator === 'equals') return Object.is(value, filter.value)
  if (filter.operator === 'notEquals') return !Object.is(value, filter.value)
  if (filter.operator === 'contains') {
    if (Array.isArray(value))
      return typeof filter.value === 'string' && value.includes(filter.value)
    return String(value ?? '')
      .toLocaleLowerCase()
      .includes(String(filter.value ?? '').toLocaleLowerCase())
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
