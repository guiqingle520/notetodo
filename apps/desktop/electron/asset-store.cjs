const fs = require('node:fs')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')

const MAX_FILE_BYTES = 250 * 1024 * 1024

/**
 * Streams one user-selected file into the content-addressed attachment store.
 * The renderer never receives the source path, and bounded streaming keeps
 * memory flat even when a user inserts a large video or design archive.
 */
async function storeLocalAsset(sourcePath, assetRoot, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_FILE_BYTES
  const stat = await fs.promises.stat(sourcePath)
  if (!stat.isFile()) throw new TypeError('只能添加普通文件。')
  if (stat.size > maxBytes) throw new RangeError(`单个附件不能超过 ${formatLimit(maxBytes)}。`)

  const temporaryDir = path.join(assetRoot, '.pending')
  await fs.promises.mkdir(temporaryDir, { recursive: true })
  const temporaryPath = path.join(temporaryDir, randomUUID())
  const hash = createHash('sha256')
  let bytes = 0
  let firstChunk = Buffer.alloc(0)
  let output

  try {
    output = await fs.promises.open(temporaryPath, 'wx')
    for await (const chunk of fs.createReadStream(sourcePath)) {
      bytes += chunk.length
      if (bytes > maxBytes) throw new RangeError(`单个附件不能超过 ${formatLimit(maxBytes)}。`)
      if (!firstChunk.length) firstChunk = chunk.subarray(0, 32)
      hash.update(chunk)
      // FileHandle.write may legally write fewer bytes than requested. Looping
      // here prevents a rare truncated CAS object on busy or unusual volumes.
      let offset = 0
      while (offset < chunk.length) {
        const { bytesWritten } = await output.write(chunk, offset, chunk.length - offset, null)
        if (!bytesWritten) throw new Error('附件写入未取得进展。')
        offset += bytesWritten
      }
      options.onProgress?.(bytes, stat.size)
    }
    await output.sync()
    await output.close()
    output = undefined

    const digest = hash.digest('hex')
    const relativePath = path.join(digest.slice(0, 2), digest)
    const finalPath = path.join(assetRoot, relativePath)
    await fs.promises.mkdir(path.dirname(finalPath), { recursive: true })
    try {
      await fs.promises.access(finalPath)
      await fs.promises.unlink(temporaryPath)
    } catch {
      try { await fs.promises.rename(temporaryPath, finalPath) } catch (error) {
        if (error?.code !== 'EEXIST') throw error
        await fs.promises.unlink(temporaryPath)
      }
    }

    const displayName = safeDisplayName(options.displayName ?? path.basename(sourcePath))
    const mimeType = detectMimeType(displayName, firstChunk)
    return { hash: digest, size: bytes, mimeType, relativePath, displayName }
  } catch (error) {
    await output?.close().catch(() => {})
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

function isRenderableImage(asset) {
  return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(asset.mimeType)
}

function detectMimeType(fileName, bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  const extension = path.extname(fileName).toLowerCase()
  return ({
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
    '.json': 'application/json', '.zip': 'application/zip', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[extension] ?? 'application/octet-stream'
}

function safeDisplayName(value) {
  const leaf = path.win32.basename(String(value).replaceAll('/', '\\'))
  const normalized = leaf.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  return (!normalized || normalized === '.' || normalized === '..' ? '附件' : normalized).slice(0, 240)
}

function formatLimit(bytes) {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

/**
 * Quarantines files synchronously before deleting their database rows. This
 * closes the race where a duplicate upload could re-reference a hash between
 * the final reference check and physical removal.
 */
async function collectUnusedAssets(database, assetRoot, graceMs = 7 * 24 * 60 * 60_000) {
  const cutoff = new Date(Date.now() - graceMs).toISOString()
  const candidates = database.listUnreferencedAttachments(cutoff)
  const trashRoot = path.join(assetRoot, '.trash')
  fs.mkdirSync(trashRoot, { recursive: true })
  const quarantined = []
  for (const candidate of candidates) {
    const source = path.resolve(assetRoot, candidate.relativePath)
    if (!source.startsWith(`${path.resolve(assetRoot)}${path.sep}`)) continue
    const quarantine = path.join(trashRoot, `${candidate.hash}-${randomUUID()}`)
    try { fs.renameSync(source, quarantine) } catch (error) { if (error?.code !== 'ENOENT') continue }
    if (database.deleteAttachmentIfUnreferenced(candidate.hash, cutoff)) {
      quarantined.push(quarantine, path.join(assetRoot, 'thumbnails', candidate.hash.slice(0, 2), `${candidate.hash}.png`))
    } else if (fs.existsSync(quarantine)) {
      fs.mkdirSync(path.dirname(source), { recursive: true })
      fs.renameSync(quarantine, source)
    }
  }
  await Promise.all(quarantined.map((target) => fs.promises.rm(target, { force: true }).catch(() => {})))
  return candidates.length
}

module.exports = { MAX_FILE_BYTES, collectUnusedAssets, detectMimeType, isRenderableImage, safeDisplayName, storeLocalAsset }
