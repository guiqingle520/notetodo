export type ImportEntryKind = 'page' | 'database' | 'asset' | 'sitemap' | 'unsupported'

export interface ImportArchiveEntry {
  /** POSIX or Windows-style path as reported by the archive reader. */
  path: string
  uncompressedSize: number
}

export interface PlannedImportEntry extends ImportArchiveEntry {
  normalizedPath: string
  kind: ImportEntryKind
  format?: 'markdown' | 'html' | 'csv'
  title?: string
  notionId?: string
  parentPath?: string
}

export interface ImportIssue {
  code: 'UNSAFE_PATH' | 'ENTRY_TOO_LARGE' | 'ARCHIVE_TOO_LARGE' | 'TOO_MANY_ENTRIES' | 'DUPLICATE_PATH'
  path?: string
  message: string
}

export interface ImportPlan {
  entries: PlannedImportEntry[]
  issues: ImportIssue[]
  acceptedBytes: number
  rejected: boolean
  summary: Record<ImportEntryKind, number>
}

export interface CsvTable {
  headers: string[]
  rows: Array<Record<string, string>>
  inferredTypes: Record<string, 'checkbox' | 'number' | 'date' | 'text'>
}

export interface LocalLink {
  rawTarget: string
  resolvedPath: string | null
  fragment?: string
}

export interface ImportLimits {
  maxEntries: number
  maxEntryBytes: number
  maxArchiveBytes: number
}

export const DEFAULT_IMPORT_LIMITS: ImportLimits = {
  maxEntries: 50_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxArchiveBytes: 10 * 1024 * 1024 * 1024,
}

const NOTION_ID_SUFFIX = /(?:\s|_)([0-9a-f]{32})(?=\.[^.]+$)/i

/**
 * Builds a deterministic, side-effect-free plan before any archive content is
 * extracted. Rejecting unsafe paths and oversized input at this boundary keeps
 * import workers from writing outside their staging directory or exhausting RAM.
 */
export function planImportArchive(
  sourceEntries: readonly ImportArchiveEntry[],
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): ImportPlan {
  const issues: ImportIssue[] = []
  const entries: PlannedImportEntry[] = []
  const seen = new Set<string>()
  let acceptedBytes = 0

  if (sourceEntries.length > limits.maxEntries) {
    issues.push({ code: 'TOO_MANY_ENTRIES', message: `档案包含 ${sourceEntries.length} 项，超过上限 ${limits.maxEntries}。` })
  }

  for (const source of sourceEntries.slice(0, limits.maxEntries)) {
    const normalizedPath = normalizeArchivePath(source.path)
    if (!normalizedPath) {
      issues.push({ code: 'UNSAFE_PATH', path: source.path, message: '路径会逃逸导入暂存目录。' })
      continue
    }
    const pathKey = normalizedPath.toLocaleLowerCase('en-US')
    if (seen.has(pathKey)) {
      issues.push({ code: 'DUPLICATE_PATH', path: source.path, message: '档案中存在大小写不敏感的重复路径。' })
      continue
    }
    seen.add(pathKey)

    if (!Number.isSafeInteger(source.uncompressedSize) || source.uncompressedSize < 0 || source.uncompressedSize > limits.maxEntryBytes) {
      issues.push({ code: 'ENTRY_TOO_LARGE', path: source.path, message: '文件解压后大小无效或超过单文件上限。' })
      continue
    }
    if (acceptedBytes + source.uncompressedSize > limits.maxArchiveBytes) {
      issues.push({ code: 'ARCHIVE_TOO_LARGE', path: source.path, message: '档案解压后累计大小超过上限。' })
      continue
    }

    acceptedBytes += source.uncompressedSize
    entries.push(classifyEntry(source, normalizedPath))
  }

  const summary = { page: 0, database: 0, asset: 0, sitemap: 0, unsupported: 0 } satisfies Record<ImportEntryKind, number>
  for (const entry of entries) summary[entry.kind] += 1

  return {
    entries,
    issues,
    acceptedBytes,
    // Security and resource-limit violations reject the transaction atomically;
    // unsupported files remain visible in the report but do not block import.
    rejected: issues.length > 0,
    summary,
  }
}

/** Returns null when an entry is absolute, contains traversal, or has no file name. */
export function normalizeArchivePath(input: string): string | null {
  const path = input.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!path || path.includes('\0') || path.startsWith('/') || /^[a-z]:\//i.test(path)) return null
  const segments = path.split('/')
  if (segments.some((segment) => segment === '..' || segment === '')) return null
  const normalized = segments.filter((segment) => segment !== '.').join('/')
  return normalized && !normalized.endsWith('/') ? normalized : null
}

function classifyEntry(source: ImportArchiveEntry, normalizedPath: string): PlannedImportEntry {
  const fileName = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1)
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLocaleLowerCase('en-US') : ''
  const notionId = fileName.match(NOTION_ID_SUFFIX)?.[1]?.toLocaleLowerCase('en-US')
  const title = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/(?:\s|_)[0-9a-f]{32}$/i, '')
    .trim()
  const parentPath = normalizedPath.includes('/') ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) : undefined
  const base = { ...source, normalizedPath, title, notionId, parentPath }

  if (normalizedPath.toLocaleLowerCase('en-US') === 'index.html') return { ...base, kind: 'sitemap', format: 'html' }
  if (extension === 'md' || extension === 'markdown') return { ...base, kind: 'page', format: 'markdown' }
  if (extension === 'html' || extension === 'htm') return { ...base, kind: 'page', format: 'html' }
  if (extension === 'csv') return { ...base, kind: 'database', format: 'csv' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'mp4', 'mov', 'mp3', 'wav', 'zip'].includes(extension)) {
    return { ...base, kind: 'asset' }
  }
  return { ...base, kind: 'unsupported' }
}

/**
 * Parses RFC 4180-style CSV without splitting quoted commas or embedded lines.
 * UTF-8 BOM is removed here because Notion and spreadsheet exports commonly add it.
 */
export function parseCsvTable(input: string): CsvTable {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const source = input.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
      continue
    }
    if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      field = ''
      if (row.some((value) => value.length > 0)) records.push(row)
      row = []
    } else field += character
  }
  if (quoted) throw new Error('CSV_QUOTE_NOT_CLOSED')
  if (field.length || row.length) {
    row.push(field)
    if (row.some((value) => value.length > 0)) records.push(row)
  }

  const rawHeaders = records.shift() ?? []
  const headers = makeUniqueHeaders(rawHeaders)
  const rows = records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
  return { headers, rows, inferredTypes: inferCsvTypes(headers, rows) }
}

/** Resolves Markdown links against their source page without allowing traversal. */
export function discoverLocalLinks(markdown: string, sourcePath: string): LocalLink[] {
  const baseSegments = sourcePath.split('/').slice(0, -1)
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((match) => {
    const rawTarget = match[1]!.trim().replace(/^<|>$/g, '')
    if (/^(?:[a-z]+:|#)/i.test(rawTarget)) return { rawTarget, resolvedPath: null }
    const [encodedPath, fragment] = rawTarget.split('#', 2)
    let decodedPath: string
    try { decodedPath = decodeURIComponent(encodedPath!) } catch { return { rawTarget, resolvedPath: null } }
    const stack = [...baseSegments]
    for (const segment of decodedPath.replaceAll('\\', '/').split('/')) {
      if (!segment || segment === '.') continue
      if (segment === '..') stack.pop()
      else stack.push(segment)
    }
    const resolvedPath = normalizeArchivePath(stack.join('/'))
    return { rawTarget, resolvedPath, ...(fragment ? { fragment } : {}) }
  })
}

function makeUniqueHeaders(input: string[]) {
  const counts = new Map<string, number>()
  return input.map((raw, index) => {
    const base = raw.trim() || `Column ${index + 1}`
    const count = (counts.get(base) ?? 0) + 1
    counts.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

function inferCsvTypes(headers: string[], rows: Array<Record<string, string>>) {
  return Object.fromEntries(headers.map((header) => {
    const values = rows.map((row) => row[header]!.trim()).filter(Boolean)
    if (values.length && values.every((value) => /^(?:true|false|yes|no)$/i.test(value))) return [header, 'checkbox']
    if (values.length && values.every((value) => Number.isFinite(Number(value)))) return [header, 'number']
    if (values.length && values.every((value) => /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(value))) return [header, 'date']
    return [header, 'text']
  })) as CsvTable['inferredTypes']
}
