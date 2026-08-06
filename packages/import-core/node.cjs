const fs = require('node:fs')
const path = require('node:path')
const yauzl = require('yauzl')

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

module.exports = { DEFAULT_LIMITS, inspectZipArchive }
