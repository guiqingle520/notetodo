const { DatabaseSync } = require('node:sqlite')
const { chunkPage, cosineSimilarity, embedText, fuseRankings } = require('./retrieval-core.cjs')
const { createWorkspaceRepository } = require('./repositories/workspace-repository.cjs')
const { createDatabaseRecordRepository } = require('./repositories/database-record-repository.cjs')
const { createCollaborationRepository } = require('./repositories/collaboration-repository.cjs')
const { createPlatformRepository } = require('./repositories/platform-repository.cjs')

/**
 * SQLite is owned by the Electron main process. Keeping SQL out of the renderer
 * prevents a compromised document view from reading arbitrary workspace data
 * and gives sync/import code one transactional source of truth.
 */
class WorkspaceDatabase {
  constructor(databasePath) {
    this.database = new DatabaseSync(databasePath)
    this.workspaceRepository = createWorkspaceRepository(this.database)
    this.configure()
    this.migrate()
    this.recordRepository = createDatabaseRecordRepository(this.database)
    this.collaborationRepository = createCollaborationRepository(this.database)
    this.platformRepository = createPlatformRepository(this.database)
    this.prepareStatements()
    this.recoverInterruptedImports()
    this.seedIfEmpty()
    this.seedDatabaseIfEmpty()
    this.ensureAdvancedDatabaseSeed()
    this.backfillRetrievalIndex()
  }

  configure() {
    // WAL lets reads continue while the debounced editor writer commits a page.
    this.workspaceRepository.configure()
  }

  prepareStatements() {
    this.statements = this.workspaceRepository.prepareStatements()
  }

  loadWorkspace() {
    const pages = this.statements.listPages.all().map(mapPageRow)
    const storedActiveId = this.statements.activePage.get()?.active_page_id
    const activePageId = pages.some((page) => page.id === storedActiveId && !page.archivedAt)
      ? storedActiveId
      : pages.find((page) => !page.archivedAt)?.id

    return { pages, activePageId: activePageId ?? '' }
  }

  upsertPage(page) {
    this.workspaceRepository.transaction(() => {
      const current = this.statements.pageContentById.get(page.id)
      const retrievalChanged = !current || current.title !== page.title || current.content !== page.content
      if (current && retrievalChanged) this.captureAutomaticVersion(current)
      this.statements.upsertPage.run(
        page.id,
        page.title,
        page.icon,
        page.parentId,
        page.favorite ? 1 : 0,
        page.content,
        page.updatedAt,
        page.lastVisitedAt,
        page.archivedAt,
      )
      this.reconcilePageAttachments(page.id, page.content)
      if (retrievalChanged) this.indexPageForRetrieval(page.id, page.title, page.content)
      this.enqueueWebhookEvent(current ? 'page.updated' : 'page.created', page.id, { page: { id: page.id, title: page.title, icon: page.icon, parentId: page.parentId, updatedAt: page.updatedAt, archivedAt: page.archivedAt } }, page.updatedAt)
    })
    return page
  }

  /**
   * Commits an entire converted archive atomically. Pages are ordered by tree
   * depth so parent foreign keys exist first; any malformed row rolls back the
   * root page, databases and values together.
   */
  importWorkspaceBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.pages) || !Array.isArray(bundle.databases) || bundle.pages.length < 1) {
      throw new TypeError('Invalid import bundle.')
    }
    const pages = [...bundle.pages].sort((left, right) => pageDepth(left, bundle.pages) - pageDepth(right, bundle.pages))
    const insertDatabase = this.statements.importInsertDatabase
    const insertProperty = this.statements.importInsertProperty
    const insertRecord = this.statements.importInsertRecord
    const insertValue = this.statements.importInsertValue
    const insertView = this.statements.importInsertView
    const insertAttachment = this.statements.insertAttachment
    const insertPageAttachment = this.statements.insertPageAttachment

    return this.workspaceRepository.transaction(() => {
      for (const page of pages) {
        if (!page.id || page.id.length > 128 || typeof page.content !== 'string' || page.content.length > 20_000_000) throw new TypeError('Imported page exceeds safety limits.')
        this.statements.upsertPage.run(page.id, String(page.title).slice(0, 1000), page.icon, page.parentId, page.favorite ? 1 : 0, page.content, page.updatedAt, page.lastVisitedAt, page.archivedAt)
        this.indexPageForRetrieval(page.id, page.title, page.content)
      }
      for (const imported of bundle.databases) {
        const viewId = `${imported.id}-table`
        insertDatabase.run(imported.id, imported.pageId, imported.name, viewId)
        imported.headers.forEach((header, index) => {
          const propertyId = `${imported.id}-p${index}`
          const type = index === 0 ? 'title' : (imported.inferredTypes[header] ?? 'text')
          insertProperty.run(propertyId, imported.id, header, type, index, '{}')
        })
        imported.rows.forEach((row, rowIndex) => {
          const recordId = `${imported.id}-r${rowIndex}`
          const now = new Date().toISOString()
          insertRecord.run(recordId, imported.id, rowIndex, now, now)
          imported.headers.forEach((header, propertyIndex) => {
            const type = propertyIndex === 0 ? 'title' : (imported.inferredTypes[header] ?? 'text')
            const raw = row[header] ?? ''
            const numberValue = type === 'number' && raw !== '' ? Number(raw) : null
            const booleanValue = type === 'checkbox' ? (/^(?:true|yes)$/i.test(raw) ? 1 : 0) : null
            insertValue.run(recordId, `${imported.id}-p${propertyIndex}`, ['number', 'checkbox'].includes(type) ? null : raw, Number.isFinite(numberValue) ? numberValue : null, booleanValue, null, now)
          })
        })
        insertView.run(viewId, imported.id, '全部', 'table', 0, '{}')
      }
      for (const attachment of bundle.attachments ?? []) {
        insertAttachment.run(attachment.hash, attachment.size, attachment.mimeType, attachment.relativePath, new Date().toISOString())
        for (const pageId of attachment.referencedBy) insertPageAttachment.run(pageId, attachment.hash, attachment.sourcePath, attachment.displayName)
      }
      this.statements.setActivePage.run(pages[0].id)
      this.statements.completeImportJob.run(JSON.stringify(bundle.report ?? {}), new Date().toISOString(), bundle.importId)
      return { rootPageId: pages[0].id, pageCount: pages.length, databaseCount: bundle.databases.length, ...bundle.report }
    })
  }

  createImportJob(id, sourceName) {
    const now = new Date().toISOString()
    this.statements.createImportJob.run(id, sourceName, now, now)
  }

  recoverInterruptedImports() {
    const now = new Date().toISOString()
    this.statements.recoverImports.run(now)
  }

  updateImportJob(id, status, errorMessage = null) {
    if (!['converting', 'committing', 'completed', 'failed', 'cancelled'].includes(status)) throw new TypeError('Invalid import status.')
    this.statements.updateImportJob.run(status, errorMessage?.slice(0, 2000) ?? null, new Date().toISOString(), id)
  }

  loadImportJobs() {
    return this.statements.importJobs.all()
      .map((job) => ({ ...job, report: JSON.parse(job.reportJson), reportJson: undefined }))
  }

  getAttachment(hash) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null
    return this.statements.attachmentByHash.get(hash) ?? null
  }

  registerPageAttachments(pageId, attachments) {
    const insertAttachment = this.statements.insertAttachment
    const insertReference = this.statements.insertPageAttachment
    this.workspaceRepository.transaction(() => {
      const createdAt = new Date().toISOString()
      for (const attachment of attachments) {
        insertAttachment.run(attachment.hash, attachment.size, attachment.mimeType, attachment.relativePath, createdAt)
        // A deterministic manual source prevents repeated insertion of the same
        // content on one page from inflating future reference-counted cleanup.
        insertReference.run(pageId, attachment.hash, `manual/${attachment.hash}`, attachment.displayName)
      }
    })
  }

  /**
   * Makes the serialized document the source of truth for reference counts.
   * Imported and manually selected assets share the same URL shape, so stale
   * references disappear after the normal debounced page save.
   */
  reconcilePageAttachments(pageId, content) {
    const referenced = extractAttachmentHashes(content)
    const existing = this.statements.pageAttachments.all(pageId)
    const existingByHash = new Map(existing.map((item) => [item.hash, item]))
    const removeReference = this.statements.removePageAttachment
    const insertReference = this.statements.insertDocumentAttachment
    for (const item of existing) if (!referenced.has(item.hash)) removeReference.run(pageId, item.hash)
    for (const hash of referenced) if (!existingByHash.has(hash)) insertReference.run(pageId, hash, `document/${hash}`, '附件', hash)
  }

  captureAutomaticVersion(page) {
    const latest = this.statements.latestPageVersion.get(page.id)
    if (latest && Date.now() - Date.parse(latest.createdAt) < 5 * 60_000) return null
    return this.insertPageVersion(page, 'autosave')
  }

  insertPageVersion(page, reason) {
    const result = this.statements.insertPageVersion
      .run(page.id, page.title, page.content, reason, new Date().toISOString())
    const versionId = Number(result.lastInsertRowid)
    const insertReference = this.statements.insertVersionAttachment
    for (const hash of extractAttachmentHashes(page.content)) insertReference.run(versionId, hash)
    this.statements.trimPageVersions.run(page.id, page.id)
    return versionId
  }

  listPageVersions(pageId, limit = 100) {
    const boundedLimit = Math.min(200, Math.max(1, Number(limit) || 100))
    return this.statements.pageVersions.all(pageId, boundedLimit)
  }

  getPageVersion(pageId, versionId) {
    return this.statements.pageVersion.get(pageId, versionId) ?? null
  }

  restorePageVersion(pageId, versionId) {
    return this.workspaceRepository.transaction(() => {
      const current = this.statements.pageById.get(pageId)
      const version = this.getPageVersion(pageId, versionId)
      if (!current || !version) throw new Error('历史版本不存在。')
      this.insertPageVersion({ id: pageId, title: current.title, content: current.content }, 'restore')
      const now = new Date().toISOString()
      this.statements.restorePageContent.run(version.title, version.content, now, pageId)
      this.reconcilePageAttachments(pageId, version.content)
      this.indexPageForRetrieval(pageId, version.title, version.content)
      this.enqueueWebhookEvent('page.updated', pageId, { page: { id: pageId, title: version.title, updatedAt: now, restoredFromVersionId: versionId } }, now)
      return mapPageRow(this.statements.pageById.get(pageId))
    })
  }

  listUnreferencedAttachments(cutoff) {
    return this.statements.unreferencedAttachments.all(cutoff)
  }

  deleteAttachmentIfUnreferenced(hash, cutoff) {
    return this.statements.deleteUnreferencedAttachment.run(hash, cutoff).changes > 0
  }

  backfillRetrievalIndex() {
    const pages = this.statements.pagesMissingRetrievalIndex.all()
    this.workspaceRepository.transaction(() => {
      for (const page of pages) this.indexPageForRetrieval(page.id, page.title, page.content)
    })
  }

  indexPageForRetrieval(pageId, title, content) {
    this.statements.deleteSearchFts.run(pageId)
    this.statements.deleteSearchChunks.run(pageId)
    const insertChunk = this.statements.insertSearchChunk
    const insertFts = this.statements.insertSearchFts
    for (const chunk of chunkPage(title, content)) {
      const result = insertChunk.run(pageId, chunk.index, chunk.heading, chunk.text, embedText(`${title}\n${chunk.text}`))
      insertFts.run(Number(result.lastInsertRowid), pageId, chunk.heading, chunk.text)
    }
  }

  hybridSearch(query, userId = null, limit = 8) {
    const normalized = String(query).trim().slice(0, 500)
    if (!normalized) return []
    const lexicalQuery = normalized.split(/\s+/u).filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ')
    let lexical = []
    try {
      lexical = this.statements.lexicalSearch.all(lexicalQuery, userId, userId)
    } catch { lexical = [] }
    const queryEmbedding = embedText(normalized)
    const semantic = this.statements.semanticSearch.all(userId, userId)
      .map((row) => ({ ...row, similarity: cosineSimilarity(queryEmbedding, row.embedding) }))
      .filter((row) => row.similarity > 0)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 50)
    return fuseRankings(lexical, semantic, Math.min(12, Math.max(1, limit))).map((item, index) => ({
      citationId: `S${index + 1}`, pageId: item.pageId, chunkIndex: item.chunkIndex, title: item.title,
      heading: item.heading, excerpt: item.text.slice(0, 900), score: item.score,
    }))
  }

  setActivePage(id) {
    const now = new Date().toISOString()
    this.workspaceRepository.transaction(() => {
      this.statements.setActivePage.run(id)
      this.statements.markVisited.run(now, id)
    })
  }

  archivePage(id) {
    const now = new Date().toISOString()
    this.workspaceRepository.transaction(() => {
      this.statements.archivePage.run(now, now, id)
      this.enqueueWebhookEvent('page.archived', id, { page: { id, archivedAt: now, updatedAt: now } }, now)
    })
  }

  restorePage(id) {
    const now = new Date().toISOString()
    this.workspaceRepository.transaction(() => {
      this.statements.restorePage.run(now, id)
      this.enqueueWebhookEvent('page.updated', id, { page: { id, archivedAt: null, updatedAt: now } }, now)
    })
  }

  searchPages(query, limit = 30) {
    const normalized = query.trim()
    if (!normalized) return this.statements.recentPages.all(limit).map(mapPageRow)

    // Quoting each token prevents user input from becoming an FTS operator.
    const safeMatch = normalized
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => `"${token.replaceAll('"', '""')}"*`)
      .join(' AND ')

    return this.statements.searchPages.all(safeMatch, limit).map(mapPageRow)
  }

  close() {
    this.database.close()
  }
}

function pageDepth(page, pages) {
  const byId = new Map(pages.map((candidate) => [candidate.id, candidate]))
  const visited = new Set([page.id])
  let depth = 0
  let parentId = page.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = byId.get(parentId)?.parentId
  }
  return depth
}

function mapPageRow(row) {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    parentId: row.parent_id,
    favorite: Boolean(row.favorite),
    content: row.content,
    updatedAt: row.updated_at,
    lastVisitedAt: row.last_visited_at,
    archivedAt: row.archived_at,
  }
}

function extractAttachmentHashes(content) {
  const hashes = new Set()
  const pattern = /notetodo-asset:\/\/([0-9a-f]{64})(?:[/?#]|$)/giu
  for (const match of content.matchAll(pattern)) hashes.add(match[1].toLowerCase())
  return hashes
}

Object.assign(
  WorkspaceDatabase.prototype,
  require('./workspace-db-migrations.cjs'),
  require('./workspace-db-seed.cjs'),
  require('./workspace-db-records.cjs'),
  require('./workspace-db-platform.cjs'),
  require('./workspace-db-collaboration.cjs'),
)

module.exports = { WorkspaceDatabase, extractAttachmentHashes }
