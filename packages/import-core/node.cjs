const fs = require('node:fs')
const path = require('node:path')
const yauzl = require('yauzl')
const MarkdownIt = require('markdown-it')
const sanitizeHtml = require('sanitize-html')
const { createHash, randomUUID } = require('node:crypto')

const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 50_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxArchiveBytes: 10 * 1024 * 1024 * 1024,
  maxSourceBytes: 2 * 1024 * 1024 * 1024,
})

/**
 * Reads only ZIP central-directory metadata with lazyEntries enabled. No entry
 * body is decompressed during preflight, so a crafted archive cannot consume
 * memory proportional to its advertised uncompressed size.
 */
async function inspectZipArchive(filePath, limits = DEFAULT_LIMITS) {
  if (!path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== '.zip') {
    throw new TypeError('请选择有效的 ZIP 档案。')
  }
  const stat = await fs.promises.stat(filePath)
  if (!stat.isFile() || stat.size > limits.maxSourceBytes) throw new Error('导入档案不存在或压缩包超过 2 GB 上限。')

  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (openError, archive) => {
      if (openError || !archive) return reject(new Error(`无法读取 ZIP：${openError?.message ?? '未知错误'}`))
      const sourceEntries = []
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        archive.close()
        reject(error instanceof Error ? error : new Error(String(error)))
      }
      archive.on('error', fail)
      archive.on('entry', (entry) => {
        if (!entry.fileName.endsWith('/')) sourceEntries.push({ path: entry.fileName, uncompressedSize: entry.uncompressedSize })
        if (sourceEntries.length > limits.maxEntries) {
          archive.close()
          if (!settled) {
            settled = true
            resolve(buildPlan(sourceEntries, limits, path.basename(filePath), stat.size))
          }
          return
        }
        archive.readEntry()
      })
      archive.on('end', () => {
        if (settled) return
        settled = true
        resolve(buildPlan(sourceEntries, limits, path.basename(filePath), stat.size))
      })
      archive.readEntry()
    })
  })
}

/**
 * Sequentially converts textual entries. Only the current entry is buffered;
 * attachments remain inside the archive until the content-addressed store is
 * ready, keeping peak memory independent from total archive size.
 */
async function convertZipArchive(filePath, options = {}) {
  const signal = options.signal
  const onProgress = options.onProgress ?? (() => {})
  const importId = options.importId ?? randomUUID()
  if (signal?.aborted) throw new Error('IMPORT_CANCELLED')
  const inspection = await inspectZipArchive(filePath)
  if (inspection.rejected) throw new Error('IMPORT_PREFLIGHT_REJECTED')
  const convertible = inspection.entries.filter((entry) => entry.kind === 'page' || entry.kind === 'database')
  const plannedByPath = new Map(inspection.entries.map((entry) => [entry.path, entry]))
  const pageIds = new Map(convertible.map((entry) => [stripExtension(entry.path), `${importId}-${shortHash(entry.path)}`]))
  const rootId = `${importId}-root`
  const now = new Date().toISOString()
  const pages = [{ id: rootId, title: path.basename(inspection.fileName, '.zip'), icon: 'book', parentId: null, favorite: false, content: '<p>从 Notion 导入的工作区。</p>', updatedAt: now, lastVisitedAt: now, archivedAt: null }]
  const databases = []
  let completed = 0

  await visitZipEntries(filePath, signal, async (entry, readText) => {
    const normalized = normalizePath(entry.fileName)
    const planned = normalized && plannedByPath.get(normalized)
    if (!planned || (planned.kind !== 'page' && planned.kind !== 'database')) return
    const raw = await readText()
    const title = path.basename(stripExtension(normalized)).replace(/(?:\s|_)[0-9a-f]{32}$/i, '').trim() || '无标题'
    const pageId = pageIds.get(stripExtension(normalized))
    const parentId = findParentPageId(normalized, pageIds) ?? rootId
    if (planned.kind === 'page') {
      const extension = path.extname(normalized).toLowerCase()
      const rendered = extension === '.md' || extension === '.markdown' ? renderMarkdown(raw) : raw
      pages.push({ id: pageId, title, icon: 'note', parentId, favorite: false, content: sanitizeImportedHtml(rendered), updatedAt: now, lastVisitedAt: now, archivedAt: null })
    } else {
      const table = parseCsv(raw)
      pages.push({ id: pageId, title, icon: 'grid', parentId, favorite: false, content: '<p></p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
      databases.push({ id: `${pageId}-db`, pageId, name: title, headers: table.headers, rows: table.rows, inferredTypes: inferTypes(table.headers, table.rows) })
    }
    completed += 1
    onProgress({ phase: 'convert', completed, total: convertible.length, path: normalized })
  })

  return { importId, pages, databases, report: { importedPages: pages.length - 1, importedDatabases: databases.length, skippedAssets: inspection.summary.asset, unsupported: inspection.summary.unsupported } }
}

function visitZipEntries(filePath, signal, visitor) {
  if (signal?.aborted) return Promise.reject(new Error('IMPORT_CANCELLED'))
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, archive) => {
      if (error || !archive) return reject(error ?? new Error('ZIP_OPEN_FAILED'))
      let settled = false
      const fail = (reason) => {
        if (settled) return
        settled = true
        archive.close()
        reject(reason instanceof Error ? reason : new Error(String(reason)))
      }
      const abort = () => fail(new Error('IMPORT_CANCELLED'))
      signal?.addEventListener('abort', abort, { once: true })
      archive.on('error', fail)
      archive.on('end', () => {
        signal?.removeEventListener('abort', abort)
        if (!settled) { settled = true; resolve() }
      })
      archive.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) { archive.readEntry(); return }
        const readText = () => readEntryText(archive, entry, signal)
        Promise.resolve(visitor(entry, readText)).then(() => archive.readEntry(), fail)
      })
      archive.readEntry()
    })
  })
}

function readEntryText(archive, entry, signal) {
  const maxTextBytes = 20 * 1024 * 1024
  if (entry.uncompressedSize > maxTextBytes) return Promise.reject(new Error(`TEXT_ENTRY_TOO_LARGE:${entry.fileName}`))
  return new Promise((resolve, reject) => archive.openReadStream(entry, (error, stream) => {
    if (error || !stream) return reject(error ?? new Error('ZIP_STREAM_FAILED'))
    const chunks = []
    let size = 0
    const abort = () => stream.destroy(new Error('IMPORT_CANCELLED'))
    signal?.addEventListener('abort', abort, { once: true })
    stream.on('data', (chunk) => { size += chunk.length; if (size > maxTextBytes) stream.destroy(new Error('TEXT_ENTRY_TOO_LARGE')); else chunks.push(chunk) })
    stream.on('error', reject)
    stream.on('end', () => { signal?.removeEventListener('abort', abort); resolve(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')) })
  }))
}

function renderMarkdown(markdown) {
  return new MarkdownIt({ html: true, linkify: true, breaks: false }).render(markdown)
}

function sanitizeImportedHtml(html) {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'details', 'summary', 'figure', 'figcaption'],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, '*': ['class'], a: ['href', 'name', 'target'], img: ['src', 'alt', 'title', 'width', 'height'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
  })
}

function parseCsv(input) {
  const records = []
  let row = [], field = '', quoted = false
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1 }
      else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(field); field = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1
      row.push(field); field = ''
      if (row.some(Boolean)) records.push(row)
      row = []
    } else field += character
  }
  if (quoted) throw new Error('CSV_QUOTE_NOT_CLOSED')
  if (field || row.length) { row.push(field); if (row.some(Boolean)) records.push(row) }
  const rawHeaders = records.shift() ?? []
  const used = new Map()
  const headers = rawHeaders.map((raw, index) => { const base = raw.trim() || `Column ${index + 1}`; const count = (used.get(base) ?? 0) + 1; used.set(base, count); return count === 1 ? base : `${base} (${count})` })
  return { headers, rows: records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))) }
}

function inferTypes(headers, rows) {
  return Object.fromEntries(headers.map((header) => {
    const values = rows.map((row) => row[header].trim()).filter(Boolean)
    if (values.length && values.every((value) => /^(?:true|false|yes|no)$/i.test(value))) return [header, 'checkbox']
    if (values.length && values.every((value) => Number.isFinite(Number(value)))) return [header, 'number']
    if (values.length && values.every((value) => /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(value))) return [header, 'date']
    return [header, 'text']
  }))
}

function stripExtension(value) { return value.replace(/\.(?:md|markdown|html?|csv)$/i, '') }
function shortHash(value) { return createHash('sha256').update(value).digest('hex').slice(0, 20) }
function findParentPageId(filePath, pageIds) {
  let directory = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
  while (directory) {
    const direct = pageIds.get(directory)
    if (direct) return direct
    directory = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : ''
  }
  return null
}

function buildPlan(sourceEntries, limits, fileName, compressedBytes) {
  const issues = []
  const entries = []
  const seen = new Set()
  let acceptedBytes = 0
  if (sourceEntries.length > limits.maxEntries) issues.push({ code: 'TOO_MANY_ENTRIES', message: `档案项目超过 ${limits.maxEntries} 项上限。` })

  for (const source of sourceEntries.slice(0, limits.maxEntries)) {
    const normalizedPath = normalizePath(source.path)
    if (!normalizedPath) { issues.push({ code: 'UNSAFE_PATH', path: source.path, message: '路径会逃逸暂存目录。' }); continue }
    const key = normalizedPath.toLowerCase()
    if (seen.has(key)) { issues.push({ code: 'DUPLICATE_PATH', path: source.path, message: '存在重复路径。' }); continue }
    seen.add(key)
    if (!Number.isSafeInteger(source.uncompressedSize) || source.uncompressedSize < 0 || source.uncompressedSize > limits.maxEntryBytes) {
      issues.push({ code: 'ENTRY_TOO_LARGE', path: source.path, message: '文件解压大小超过上限。' }); continue
    }
    if (acceptedBytes + source.uncompressedSize > limits.maxArchiveBytes) {
      issues.push({ code: 'ARCHIVE_TOO_LARGE', path: source.path, message: '累计解压大小超过上限。' }); continue
    }
    acceptedBytes += source.uncompressedSize
    entries.push({ path: normalizedPath, kind: classify(normalizedPath), size: source.uncompressedSize })
  }
  const summary = { page: 0, database: 0, asset: 0, sitemap: 0, unsupported: 0 }
  for (const entry of entries) summary[entry.kind] += 1
  return { fileName, compressedBytes, acceptedBytes, entries, issues, summary, rejected: issues.length > 0 }
}

function normalizePath(input) {
  const value = input.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!value || value.includes('\0') || value.startsWith('/') || /^[a-z]:\//i.test(value)) return null
  const segments = value.split('/')
  if (segments.some((segment) => segment === '..' || segment === '')) return null
  return segments.filter((segment) => segment !== '.').join('/') || null
}

function classify(filePath) {
  if (filePath.toLowerCase() === 'index.html') return 'sitemap'
  const extension = path.extname(filePath).slice(1).toLowerCase()
  if (['md', 'markdown', 'html', 'htm'].includes(extension)) return 'page'
  if (extension === 'csv') return 'database'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf', 'mp4', 'mov', 'mp3', 'wav', 'zip'].includes(extension)) return 'asset'
  return 'unsupported'
}

module.exports = { DEFAULT_LIMITS, convertZipArchive, inspectZipArchive }
