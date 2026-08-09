/** Queries for imports, assets, page history, and local retrieval indexing. */
module.exports = Object.freeze({
  pageContentById: 'SELECT id, title, content FROM pages WHERE id=?',
  importInsertDatabase:
    'INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)',
  importInsertProperty: `INSERT INTO database_properties
    (id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)`,
  importInsertRecord: `INSERT INTO database_records
    (id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  importInsertValue: `INSERT INTO property_values
    (record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  importInsertView: `INSERT INTO database_views
    (id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)`,
  insertAttachment: `INSERT INTO attachments
    (hash, size, mime_type, relative_path, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(hash) DO NOTHING`,
  insertPageAttachment: `INSERT OR IGNORE INTO page_attachments
    (page_id, attachment_hash, source_path, display_name) VALUES (?, ?, ?, ?)`,
  completeImportJob: `UPDATE import_jobs SET status='completed', report_json=?,
    error_message=NULL, updated_at=? WHERE id=?`,
  createImportJob: `INSERT INTO import_jobs
    (id, source_name, status, created_at, updated_at) VALUES (?, ?, 'converting', ?, ?)`,
  recoverImports: `UPDATE import_jobs SET status='failed',
    error_message='应用在导入完成前退出，未提交的数据库写入已回滚。', updated_at=?
    WHERE status IN ('converting', 'committing')`,
  updateImportJob: 'UPDATE import_jobs SET status=?, error_message=?, updated_at=? WHERE id=?',
  importJobs: `SELECT id, source_name AS sourceName, status, report_json AS reportJson,
    error_message AS errorMessage, created_at AS createdAt, updated_at AS updatedAt
    FROM import_jobs ORDER BY created_at DESC LIMIT 50`,
  attachmentByHash:
    'SELECT hash, size, mime_type AS mimeType, relative_path AS relativePath FROM attachments WHERE hash=?',
  pageAttachments:
    'SELECT attachment_hash AS hash, display_name AS displayName FROM page_attachments WHERE page_id=?',
  removePageAttachment: 'DELETE FROM page_attachments WHERE page_id=? AND attachment_hash=?',
  insertDocumentAttachment: `INSERT OR IGNORE INTO page_attachments
    (page_id, attachment_hash, source_path, display_name)
    SELECT ?, hash, ?, ? FROM attachments WHERE hash=?`,
  latestPageVersion: `SELECT created_at AS createdAt FROM page_versions
    WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT 1`,
  insertPageVersion:
    'INSERT INTO page_versions(page_id, title, content, reason, created_at) VALUES (?, ?, ?, ?, ?)',
  insertVersionAttachment: `INSERT OR IGNORE INTO page_version_attachments
    (version_id, attachment_hash) SELECT ?, hash FROM attachments WHERE hash=?`,
  trimPageVersions: `DELETE FROM page_versions WHERE page_id=? AND id NOT IN (
    SELECT id FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT 200
  )`,
  pageVersions: `SELECT id, page_id AS pageId, title, reason, created_at AS createdAt,
    length(content) AS contentLength, substr(content, 1, 500) AS preview
    FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT ?`,
  pageVersion: `SELECT id, page_id AS pageId, title, content, reason,
    created_at AS createdAt FROM page_versions WHERE page_id=? AND id=?`,
  restorePageContent: 'UPDATE pages SET title=?, content=?, updated_at=? WHERE id=?',
  unreferencedAttachments: `SELECT a.hash, a.relative_path AS relativePath
    FROM attachments a
    LEFT JOIN page_attachments pa ON pa.attachment_hash = a.hash
    LEFT JOIN page_version_attachments pva ON pva.attachment_hash = a.hash
    WHERE pa.attachment_hash IS NULL AND pva.attachment_hash IS NULL AND a.created_at < ?
    ORDER BY a.created_at`,
  deleteUnreferencedAttachment: `DELETE FROM attachments WHERE hash=? AND created_at < ?
    AND NOT EXISTS (SELECT 1 FROM page_attachments WHERE attachment_hash=attachments.hash)
    AND NOT EXISTS (SELECT 1 FROM page_version_attachments WHERE attachment_hash=attachments.hash)`,
  pagesMissingRetrievalIndex: `SELECT p.id, p.title, p.content FROM pages p
    WHERE NOT EXISTS (SELECT 1 FROM search_chunks sc WHERE sc.page_id=p.id)`,
  deleteSearchFts:
    'DELETE FROM search_chunks_fts WHERE rowid IN (SELECT id FROM search_chunks WHERE page_id=?)',
  deleteSearchChunks: 'DELETE FROM search_chunks WHERE page_id=?',
  insertSearchChunk: `INSERT INTO search_chunks
    (page_id, chunk_index, heading, text, embedding) VALUES (?, ?, ?, ?, ?)`,
  insertSearchFts:
    'INSERT INTO search_chunks_fts(rowid, page_id, heading, text) VALUES (?, ?, ?, ?)',
  lexicalSearch: `SELECT sc.id, sc.page_id AS pageId, sc.chunk_index AS chunkIndex,
      p.title, sc.heading, sc.text, sc.embedding
    FROM search_chunks sc JOIN pages p ON p.id=sc.page_id
    JOIN search_chunks_fts fts ON fts.rowid=sc.id
    WHERE search_chunks_fts MATCH ? AND p.archived_at IS NULL AND (? IS NULL OR
      NOT EXISTS (SELECT 1 FROM page_permissions permission WHERE permission.page_id=p.id) OR
      EXISTS (SELECT 1 FROM page_permissions mine WHERE mine.page_id=p.id AND mine.subject_id=?))
    ORDER BY bm25(search_chunks_fts, 0.0, 2.0, 1.0) LIMIT 50`,
  semanticSearch: `SELECT sc.id, sc.page_id AS pageId, sc.chunk_index AS chunkIndex,
      p.title, sc.heading, sc.text, sc.embedding
    FROM search_chunks sc JOIN pages p ON p.id=sc.page_id
    WHERE p.archived_at IS NULL AND (? IS NULL OR
      NOT EXISTS (SELECT 1 FROM page_permissions permission WHERE permission.page_id=p.id) OR
      EXISTS (SELECT 1 FROM page_permissions mine WHERE mine.page_id=p.id AND mine.subject_id=?))
    ORDER BY p.last_visited_at DESC LIMIT 2000`,
})
