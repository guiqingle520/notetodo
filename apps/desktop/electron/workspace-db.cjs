const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const seedWorkspace = require('../shared/seed-workspace.json')
const { chunkPage, cosineSimilarity, embedText, fuseRankings } = require('./retrieval-core.cjs')
const { createApiToken, verifyApiToken } = require('@notetodo/auth-core')
const { planAutomationRuns, validateAutomationRule } = require('@notetodo/automation-core')
const { WEBHOOK_EVENTS, createWebhookEnvelope, nextWebhookAttempt, stableJson, validateWebhookUrl } = require('@notetodo/webhook-core')
const { createWorkspaceRepository } = require('./repositories/workspace-repository.cjs')
const { createDatabaseRecordRepository } = require('./repositories/database-record-repository.cjs')
const { createCollaborationRepository } = require('./repositories/collaboration-repository.cjs')
const { createPlatformRepository } = require('./repositories/platform-repository.cjs')

const LATEST_SCHEMA_VERSION = 16

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
    this.recoverInterruptedImports()
    this.seedIfEmpty()
    this.seedDatabaseIfEmpty()
    this.ensureAdvancedDatabaseSeed()
    this.backfillRetrievalIndex()
    this.prepareStatements()
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
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const current = this.database.prepare('SELECT id, title, content FROM pages WHERE id=?').get(page.id)
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
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
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
    const insertDatabase = this.database.prepare('INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)')
    const insertProperty = this.database.prepare('INSERT INTO database_properties(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
    const insertRecord = this.database.prepare('INSERT INTO database_records(id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    const insertValue = this.database.prepare('INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const insertView = this.database.prepare('INSERT INTO database_views(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
    const insertAttachment = this.database.prepare('INSERT INTO attachments(hash, size, mime_type, relative_path, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING')
    const insertPageAttachment = this.database.prepare('INSERT OR IGNORE INTO page_attachments(page_id, attachment_hash, source_path, display_name) VALUES (?, ?, ?, ?)')

    this.database.exec('BEGIN IMMEDIATE')
    try {
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
      this.database.prepare("UPDATE import_jobs SET status='completed', report_json=?, error_message=NULL, updated_at=? WHERE id=?")
        .run(JSON.stringify(bundle.report ?? {}), new Date().toISOString(), bundle.importId)
      this.database.exec('COMMIT')
      return { rootPageId: pages[0].id, pageCount: pages.length, databaseCount: bundle.databases.length, ...bundle.report }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  createImportJob(id, sourceName) {
    const now = new Date().toISOString()
    this.database.prepare("INSERT INTO import_jobs(id, source_name, status, created_at, updated_at) VALUES (?, ?, 'converting', ?, ?)").run(id, sourceName, now, now)
  }

  recoverInterruptedImports() {
    const now = new Date().toISOString()
    this.database.prepare("UPDATE import_jobs SET status='failed', error_message='应用在导入完成前退出，未提交的数据库写入已回滚。', updated_at=? WHERE status IN ('converting', 'committing')").run(now)
  }

  updateImportJob(id, status, errorMessage = null) {
    if (!['converting', 'committing', 'completed', 'failed', 'cancelled'].includes(status)) throw new TypeError('Invalid import status.')
    this.database.prepare('UPDATE import_jobs SET status=?, error_message=?, updated_at=? WHERE id=?').run(status, errorMessage?.slice(0, 2000) ?? null, new Date().toISOString(), id)
  }

  loadImportJobs() {
    return this.database.prepare('SELECT id, source_name AS sourceName, status, report_json AS reportJson, error_message AS errorMessage, created_at AS createdAt, updated_at AS updatedAt FROM import_jobs ORDER BY created_at DESC LIMIT 50').all()
      .map((job) => ({ ...job, report: JSON.parse(job.reportJson), reportJson: undefined }))
  }

  getAttachment(hash) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null
    return this.database.prepare('SELECT hash, size, mime_type AS mimeType, relative_path AS relativePath FROM attachments WHERE hash=?').get(hash) ?? null
  }

  registerPageAttachments(pageId, attachments) {
    const insertAttachment = this.database.prepare('INSERT INTO attachments(hash, size, mime_type, relative_path, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING')
    const insertReference = this.database.prepare('INSERT OR IGNORE INTO page_attachments(page_id, attachment_hash, source_path, display_name) VALUES (?, ?, ?, ?)')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const createdAt = new Date().toISOString()
      for (const attachment of attachments) {
        insertAttachment.run(attachment.hash, attachment.size, attachment.mimeType, attachment.relativePath, createdAt)
        // A deterministic manual source prevents repeated insertion of the same
        // content on one page from inflating future reference-counted cleanup.
        insertReference.run(pageId, attachment.hash, `manual/${attachment.hash}`, attachment.displayName)
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Makes the serialized document the source of truth for reference counts.
   * Imported and manually selected assets share the same URL shape, so stale
   * references disappear after the normal debounced page save.
   */
  reconcilePageAttachments(pageId, content) {
    const referenced = extractAttachmentHashes(content)
    const existing = this.database.prepare('SELECT attachment_hash AS hash, display_name AS displayName FROM page_attachments WHERE page_id=?').all(pageId)
    const existingByHash = new Map(existing.map((item) => [item.hash, item]))
    const removeReference = this.database.prepare('DELETE FROM page_attachments WHERE page_id=? AND attachment_hash=?')
    const insertReference = this.database.prepare('INSERT OR IGNORE INTO page_attachments(page_id, attachment_hash, source_path, display_name) SELECT ?, hash, ?, ? FROM attachments WHERE hash=?')
    for (const item of existing) if (!referenced.has(item.hash)) removeReference.run(pageId, item.hash)
    for (const hash of referenced) if (!existingByHash.has(hash)) insertReference.run(pageId, hash, `document/${hash}`, '附件', hash)
  }

  captureAutomaticVersion(page) {
    const latest = this.database.prepare('SELECT created_at AS createdAt FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT 1').get(page.id)
    if (latest && Date.now() - Date.parse(latest.createdAt) < 5 * 60_000) return null
    return this.insertPageVersion(page, 'autosave')
  }

  insertPageVersion(page, reason) {
    const result = this.database.prepare('INSERT INTO page_versions(page_id, title, content, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(page.id, page.title, page.content, reason, new Date().toISOString())
    const versionId = Number(result.lastInsertRowid)
    const insertReference = this.database.prepare('INSERT OR IGNORE INTO page_version_attachments(version_id, attachment_hash) SELECT ?, hash FROM attachments WHERE hash=?')
    for (const hash of extractAttachmentHashes(page.content)) insertReference.run(versionId, hash)
    this.database.prepare(`DELETE FROM page_versions WHERE page_id=? AND id NOT IN (
      SELECT id FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT 200
    )`).run(page.id, page.id)
    return versionId
  }

  listPageVersions(pageId, limit = 100) {
    const boundedLimit = Math.min(200, Math.max(1, Number(limit) || 100))
    return this.database.prepare(`
      SELECT id, page_id AS pageId, title, reason, created_at AS createdAt,
             length(content) AS contentLength, substr(content, 1, 500) AS preview
      FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(pageId, boundedLimit)
  }

  getPageVersion(pageId, versionId) {
    return this.database.prepare('SELECT id, page_id AS pageId, title, content, reason, created_at AS createdAt FROM page_versions WHERE page_id=? AND id=?').get(pageId, versionId) ?? null
  }

  restorePageVersion(pageId, versionId) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const current = this.database.prepare('SELECT * FROM pages WHERE id=?').get(pageId)
      const version = this.getPageVersion(pageId, versionId)
      if (!current || !version) throw new Error('历史版本不存在。')
      this.insertPageVersion({ id: pageId, title: current.title, content: current.content }, 'restore')
      const now = new Date().toISOString()
      this.database.prepare('UPDATE pages SET title=?, content=?, updated_at=? WHERE id=?').run(version.title, version.content, now, pageId)
      this.reconcilePageAttachments(pageId, version.content)
      this.indexPageForRetrieval(pageId, version.title, version.content)
      this.enqueueWebhookEvent('page.updated', pageId, { page: { id: pageId, title: version.title, updatedAt: now, restoredFromVersionId: versionId } }, now)
      this.database.exec('COMMIT')
      return mapPageRow(this.database.prepare('SELECT * FROM pages WHERE id=?').get(pageId))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  listUnreferencedAttachments(cutoff) {
    return this.database.prepare(`
      SELECT a.hash, a.relative_path AS relativePath
      FROM attachments a
      LEFT JOIN page_attachments pa ON pa.attachment_hash = a.hash
      LEFT JOIN page_version_attachments pva ON pva.attachment_hash = a.hash
      WHERE pa.attachment_hash IS NULL AND pva.attachment_hash IS NULL AND a.created_at < ?
      ORDER BY a.created_at
    `).all(cutoff)
  }

  deleteAttachmentIfUnreferenced(hash, cutoff) {
    return this.database.prepare(`
      DELETE FROM attachments
      WHERE hash=? AND created_at < ?
        AND NOT EXISTS (SELECT 1 FROM page_attachments WHERE attachment_hash=attachments.hash)
        AND NOT EXISTS (SELECT 1 FROM page_version_attachments WHERE attachment_hash=attachments.hash)
    `).run(hash, cutoff).changes > 0
  }

  backfillRetrievalIndex() {
    const pages = this.database.prepare('SELECT p.id, p.title, p.content FROM pages p WHERE NOT EXISTS (SELECT 1 FROM search_chunks sc WHERE sc.page_id=p.id)').all()
    this.database.exec('BEGIN IMMEDIATE')
    try { for (const page of pages) this.indexPageForRetrieval(page.id, page.title, page.content); this.database.exec('COMMIT') }
    catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  indexPageForRetrieval(pageId, title, content) {
    this.database.prepare('DELETE FROM search_chunks_fts WHERE rowid IN (SELECT id FROM search_chunks WHERE page_id=?)').run(pageId)
    this.database.prepare('DELETE FROM search_chunks WHERE page_id=?').run(pageId)
    const insertChunk = this.database.prepare('INSERT INTO search_chunks(page_id, chunk_index, heading, text, embedding) VALUES (?, ?, ?, ?, ?)')
    const insertFts = this.database.prepare('INSERT INTO search_chunks_fts(rowid, page_id, heading, text) VALUES (?, ?, ?, ?)')
    for (const chunk of chunkPage(title, content)) {
      const result = insertChunk.run(pageId, chunk.index, chunk.heading, chunk.text, embedText(`${title}\n${chunk.text}`))
      insertFts.run(Number(result.lastInsertRowid), pageId, chunk.heading, chunk.text)
    }
  }

  hybridSearch(query, userId = null, limit = 8) {
    const normalized = String(query).trim().slice(0, 500)
    if (!normalized) return []
    const permissionSql = `p.archived_at IS NULL AND (? IS NULL OR
      NOT EXISTS (SELECT 1 FROM page_permissions all_permissions WHERE all_permissions.page_id=p.id) OR
      EXISTS (SELECT 1 FROM page_permissions mine WHERE mine.page_id=p.id AND mine.subject_id=?))`
    const baseSelect = `SELECT sc.id, sc.page_id AS pageId, sc.chunk_index AS chunkIndex, p.title, sc.heading, sc.text, sc.embedding
      FROM search_chunks sc JOIN pages p ON p.id=sc.page_id`
    const lexicalQuery = normalized.split(/\s+/u).filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ')
    let lexical = []
    try {
      lexical = this.database.prepare(`${baseSelect} JOIN search_chunks_fts fts ON fts.rowid=sc.id
        WHERE search_chunks_fts MATCH ? AND ${permissionSql} ORDER BY bm25(search_chunks_fts, 0.0, 2.0, 1.0) LIMIT 50`)
        .all(lexicalQuery, userId, userId)
    } catch { lexical = [] }
    const queryEmbedding = embedText(normalized)
    const semantic = this.database.prepare(`${baseSelect} WHERE ${permissionSql} ORDER BY p.last_visited_at DESC LIMIT 2000`)
      .all(userId, userId)
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
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.statements.setActivePage.run(id)
      this.statements.markVisited.run(now, id)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  archivePage(id) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.statements.archivePage.run(now, now, id)
      this.enqueueWebhookEvent('page.archived', id, { page: { id, archivedAt: now, updatedAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  restorePage(id) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.statements.restorePage.run(now, id)
      this.enqueueWebhookEvent('page.updated', id, { page: { id, archivedAt: null, updatedAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
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
