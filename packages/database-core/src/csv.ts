import type { DatabaseRecord, DatabaseSchema, PropertyValue } from './index'

/** Serializes rows as UTF-8 CSV while neutralizing spreadsheet formulas. */
export function serializeDatabaseCsv(schema: DatabaseSchema, records: DatabaseRecord[]) {
  const escape = (value: PropertyValue | string) => {
    const plain = Array.isArray(value)
      ? value.join(', ')
      : value === null || value === undefined
        ? ''
        : String(value)
    const safe = /^[=+\-@]/u.test(plain.trimStart()) ? `'${plain}` : plain
    return /[",\r\n]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
  }
  const header = schema.properties.map((property) => escape(property.name)).join(',')
  return [
    header,
    ...records.map((record) =>
      schema.properties.map((property) => escape(record.values[property.id] ?? '')).join(','),
    ),
  ].join('\r\n')
}

export interface ParsedDatabaseCsv {
  headers: string[]
  rows: string[][]
  truncated: boolean
}

/** Parses bounded RFC 4180-style CSV, including quotes and embedded newlines. */
export function parseDatabaseCsv(
  source: string,
  maxRows = 10_000,
  maxColumns = 100,
): ParsedDatabaseCsv {
  if (source.length > 10_000_000) throw new TypeError('CSV 文件不能超过 10 MB。')
  const rowLimit = Math.max(1, Math.min(50_000, Math.trunc(maxRows)))
  const columnLimit = Math.max(1, Math.min(500, Math.trunc(maxColumns)))
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0
  const pushField = () => {
    if (row.length >= columnLimit) throw new TypeError(`CSV 不能超过 ${columnLimit} 列。`)
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  while (index < source.length) {
    const character = source[index]!
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 2
        continue
      }
      if (character === '"') {
        quoted = false
        index += 1
        continue
      }
      field += character
      index += 1
      continue
    }
    if (character === '"' && field.length === 0) {
      quoted = true
      index += 1
      continue
    }
    if (character === ',') {
      pushField()
      index += 1
      continue
    }
    if (character === '\n' || character === '\r') {
      pushRow()
      if (character === '\r' && source[index + 1] === '\n') index += 1
      index += 1
      if (rows.length > rowLimit + 1) {
        return {
          headers: deduplicateCsvHeaders(rows[0] ?? []),
          rows: rows.slice(1, rowLimit + 1),
          truncated: true,
        }
      }
      continue
    }
    field += character
    index += 1
  }
  if (quoted) throw new TypeError('CSV 中存在未闭合的引号。')
  if (field.length || row.length) pushRow()
  const headers = deduplicateCsvHeaders(rows.shift() ?? [])
  return {
    headers,
    rows: rows.filter((candidate) => candidate.some(Boolean)).slice(0, rowLimit),
    truncated: rows.length > rowLimit,
  }
}

function deduplicateCsvHeaders(headers: string[]) {
  const counts = new Map<string, number>()
  return headers.map((header, index) => {
    const base = header.trim() || `列 ${index + 1}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

/** Matches columns by normalized display name. */
export function inferCsvPropertyMappings(headers: string[], schema: DatabaseSchema) {
  const writable = schema.properties.filter(
    (property) => !['formula', 'rollup', 'relation'].includes(property.type),
  )
  const key = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[\s_-]+/gu, '')
  return headers.map(
    (header) => writable.find((property) => key(property.name) === key(header))?.id ?? null,
  )
}
