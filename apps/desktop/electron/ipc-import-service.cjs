const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { convertZipArchive, inspectZipArchive } = require('@notetodo/import-core/node')
const { assertImportProgress, importIpcContracts } = require('./ipc-import-contracts.cjs')
const { createImportAssetStaging } = require('./ipc-import-assets.cjs')

const SOURCE_TTL_MS = 30 * 60_000
const MAX_ARCHIVE_LABEL_LENGTH = 16_384
const reportFields = [
  'importedPages',
  'importedDatabases',
  'importedAssets',
  'skippedAssets',
  'unsupported',
  'unresolvedLinks',
]

function createImportIpcService(options) {
  // Archive paths remain in this main-process-only registry. The renderer can
  // refer to a source only through a short-lived opaque identifier.
  const sources = new Map()
  const activeImports = new Map()
  const activeSources = new Set()
  const inspectArchive = options.inspectArchive ?? inspectZipArchive
  const convertArchive = options.convertArchive ?? convertZipArchive
  const createId = options.createId ?? randomUUID
  const now = options.now ?? Date.now
  const assetStaging =
    options.assetStaging ?? createImportAssetStaging({ assetStoreDir: options.assetStoreDir })

  async function pickAndInspect() {
    pruneExpiredSources()
    const selected = await options.dialogApi.showOpenDialog({
      title: '导入 Notion 工作区',
      buttonLabel: '检查档案',
      properties: ['openFile'],
      filters: [{ name: 'Notion 导出档案', extensions: ['zip'] }],
    })
    if (selected.canceled || !selected.filePaths[0]) return null
    const filePath = selected.filePaths[0]
    let inspection
    try {
      inspection = await inspectArchive(filePath)
    } catch (error) {
      throw new Error(safeErrorMessage(error, [filePath, options.assetStoreDir]))
    }
    const importId = createId()
    const response = projectInspection(inspection, importId, filePath, options.assetStoreDir)
    // Validate before retaining the source so malformed import-core output
    // cannot create an opaque id that will never be consumable.
    importIpcContracts.pickAndInspect.assertResponse(response)
    sources.set(importId, { filePath, expiresAt: now() + SOURCE_TTL_MS })
    return response
  }

  function sendProgress(event, requestId, progress) {
    const response = {
      phase: progress?.phase,
      completed: progress?.completed,
      total: progress?.total,
      ...(progress?.path === undefined ? {} : { path: progress.path }),
    }
    assertImportProgress(response)
    try {
      // Progress is advisory. A renderer closing between isDestroyed() and
      // send() must not alter the database transaction's outcome.
      if (!event.sender.isDestroyed()) event.sender.send(`import:progress:${requestId}`, response)
    } catch {
      // The renderer may have been disposed after the liveness check.
    }
  }

  async function start(event, importId, requestId) {
    const source = sources.get(importId)
    if (!source || source.expiresAt < now()) {
      sources.delete(importId)
      throw new Error('导入预检已过期，请重新选择档案。')
    }
    if (activeImports.has(requestId)) throw new Error('导入任务已存在。')
    if (activeSources.has(importId)) throw new Error('该档案正在导入。')

    const controller = new AbortController()
    activeImports.set(requestId, controller)
    activeSources.add(importId)
    let jobCreated = false
    let committed = false
    let assetSession
    try {
      options.database.createImportJob(importId, safeArchiveName(source.filePath))
      jobCreated = true
      assetSession = await assetStaging.prepare(importId)
      const bundle = await convertArchive(source.filePath, {
        importId,
        assetStoreDir: assetSession.directory,
        signal: controller.signal,
        onProgress: (progress) => sendProgress(event, requestId, progress),
      })
      if (controller.signal.aborted) throw new Error('IMPORT_CANCELLED')
      // Derive and validate the renderer response before any final asset or
      // database mutation, eliminating post-commit contract failures.
      const result = projectBundleResult(bundle)
      importIpcContracts.start.assertResponse(result)
      sendProgress(event, requestId, { phase: 'commit', completed: 0, total: 1 })
      options.database.updateImportJob(importId, 'committing')
      await assetStaging.promote(assetSession, bundle.attachments ?? [], controller.signal)
      options.database.importWorkspaceBundle(bundle)
      committed = true
      sendProgress(event, requestId, { phase: 'done', completed: 1, total: 1 })
      sources.delete(importId)
      return result
    } catch (error) {
      const message = safeErrorMessage(error, [source.filePath, options.assetStoreDir])
      // Do not mutate an existing row when creation itself failed (for example,
      // after an opaque id was replayed). Only this service's own job is updated.
      if (jobCreated && !committed) {
        try {
          options.database.updateImportJob(
            importId,
            controller.signal.aborted || message === 'IMPORT_CANCELLED' ? 'cancelled' : 'failed',
            message,
          )
        } catch {
          // Persisting diagnostic state is secondary to preserving the original,
          // already-redacted failure returned to the renderer.
        }
      }
      throw new Error(message)
    } finally {
      if (assetSession) {
        await assetStaging.cleanup(assetSession, { rollback: !committed }).catch(() => {})
      }
      activeImports.delete(requestId)
      activeSources.delete(importId)
    }
  }

  function cancel(requestId) {
    activeImports.get(requestId)?.abort()
  }

  function pruneExpiredSources() {
    const currentTime = now()
    for (const [importId, source] of sources) {
      if (source.expiresAt < currentTime && !activeSources.has(importId)) sources.delete(importId)
    }
  }

  return Object.freeze({
    pickAndInspect,
    start,
    cancel,
    listJobs: () => projectJobs(options.database.loadImportJobs()),
  })
}

function projectInspection(inspection, importId, filePath, assetStoreDir) {
  return {
    importId,
    fileName: safeArchiveName(filePath),
    compressedBytes: inspection?.compressedBytes,
    acceptedBytes: inspection?.acceptedBytes,
    rejected: inspection?.rejected,
    summary: {
      page: inspection?.summary?.page,
      database: inspection?.summary?.database,
      asset: inspection?.summary?.asset,
      sitemap: inspection?.summary?.sitemap,
      unsupported: inspection?.summary?.unsupported,
    },
    entries: Array.isArray(inspection?.entries)
      ? inspection.entries.map((entry) => ({
          path: entry?.path,
          kind: entry?.kind,
          size: entry?.size,
        }))
      : inspection?.entries,
    issues: Array.isArray(inspection?.issues)
      ? inspection.issues.map((issue) => ({
          code: issue?.code,
          ...(issue?.path === undefined ? {} : { path: safeArchiveLabel(issue.path) }),
          message:
            typeof issue?.message === 'string'
              ? safeErrorMessage(issue.message, [filePath, assetStoreDir], 1_000)
              : issue?.message,
        }))
      : inspection?.issues,
  }
}

function projectBundleResult(bundle) {
  return {
    rootPageId: bundle?.pages?.[0]?.id,
    pageCount: bundle?.pages?.length,
    databaseCount: bundle?.databases?.length,
    ...Object.fromEntries(reportFields.map((field) => [field, bundle?.report?.[field]])),
  }
}

function projectJobs(jobs) {
  if (!Array.isArray(jobs)) return jobs
  return jobs.map((job) => ({
    id: job?.id,
    sourceName: safeArchiveName(job?.sourceName),
    status: job?.status,
    report:
      job?.report && typeof job.report === 'object' && !Array.isArray(job.report)
        ? Object.fromEntries(
            reportFields
              .filter((field) => Object.hasOwn(job.report, field))
              .map((field) => [field, job.report[field]]),
          )
        : job?.report,
    errorMessage:
      typeof job?.errorMessage === 'string'
        ? redactAbsolutePaths(job.errorMessage).slice(0, 2_000)
        : job?.errorMessage,
    createdAt: job?.createdAt,
    updatedAt: job?.updatedAt,
  }))
}

function safeArchiveName(value) {
  if (typeof value !== 'string') return value
  const leaf = path.win32.basename(path.posix.basename(value))
  const normalized = leaf.replace(/\p{Cc}/gu, '�').trim()
  return (normalized || 'Workspace.zip').slice(0, 255)
}

function safeArchiveLabel(value) {
  if (typeof value !== 'string') return value
  return value.replace(/\p{Cc}/gu, '�').slice(0, MAX_ARCHIVE_LABEL_LENGTH)
}

function safeErrorMessage(error, privatePaths, maximumLength = 2_000) {
  let message = error instanceof Error ? error.message : String(error)
  const candidates = new Set()
  for (const privatePath of privatePaths) {
    if (typeof privatePath !== 'string' || privatePath.length < 3) continue
    candidates.add(privatePath)
    candidates.add(privatePath.replaceAll('\\', '/'))
    candidates.add(privatePath.replaceAll('/', '\\'))
  }
  for (const privatePath of [...candidates].sort((left, right) => right.length - left.length)) {
    message = replaceCaseInsensitive(message, privatePath, safeArchiveName(privatePath))
  }
  return redactAbsolutePaths(message).slice(0, maximumLength)
}

function replaceCaseInsensitive(input, search, replacement) {
  let output = input
  let offset = 0
  const foldedSearch = search.toLocaleLowerCase('en-US')
  while (offset <= output.length) {
    const index = output.toLocaleLowerCase('en-US').indexOf(foldedSearch, offset)
    if (index < 0) break
    output = `${output.slice(0, index)}${replacement}${output.slice(index + search.length)}`
    offset = index + replacement.length
  }
  return output
}

function redactAbsolutePaths(message) {
  return message
    .replace(/file:\/\/\/[^'"\r\n]*/giu, '[本地路径]')
    .replace(/[a-z]:[\\/][^'"\r\n]*/giu, '[本地路径]')
    .replace(/(^|[\s'"(,])\/[^'"\r\n]*/gu, '$1[本地路径]')
}

module.exports = { createImportIpcService }
