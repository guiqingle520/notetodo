const { randomUUID } = require('node:crypto')

module.exports = {
  loadSyncDocument(pageId) {
    const document = this.database.prepare('SELECT snapshot, compacted_through_id FROM sync_documents WHERE page_id = ?').get(pageId)
    const afterId = document?.compacted_through_id ?? 0
    const updates = this.database.prepare('SELECT id, client_id, update_blob FROM sync_updates WHERE page_id = ? AND id > ? ORDER BY id').all(pageId, afterId)
    return {
      snapshot: document?.snapshot ? Buffer.from(document.snapshot).toString('base64') : null,
      updates: updates.map((update) => ({ id: update.id, clientId: update.client_id, data: Buffer.from(update.update_blob).toString('base64') })),
      latestUpdateId: updates.at(-1)?.id ?? afterId,
    }
  },

  appendSyncUpdate(pageId, clientId, base64Update) {
    const update = Buffer.from(base64Update, 'base64')
    const result = this.database.prepare('INSERT INTO sync_updates(page_id, client_id, update_blob, created_at) VALUES (?, ?, ?, ?)').run(pageId, clientId, update, new Date().toISOString())
    return Number(result.lastInsertRowid)
  },

  compactSyncDocument(pageId, base64Snapshot, throughId) {
    const snapshot = Buffer.from(base64Snapshot, 'base64')
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`
        INSERT INTO sync_documents(page_id, snapshot, compacted_through_id, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET snapshot=excluded.snapshot, compacted_through_id=excluded.compacted_through_id, updated_at=excluded.updated_at
      `).run(pageId, snapshot, throughId, now)
      this.database.prepare('DELETE FROM sync_updates WHERE page_id = ? AND id <= ?').run(pageId, throughId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  },

  createAIPatchAudit(id, pageId, operation, preview) {
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO ai_patch_audit(id, page_id, operation, preview, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, pageId, operation, preview, 'proposed', now, now)
    return id
  },

  updateAIPatchAudit(id, status) {
    this.database.prepare('UPDATE ai_patch_audit SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
  },

  loadAIPatchAudit(pageId) {
    return this.database.prepare('SELECT id, operation, preview, status FROM ai_patch_audit WHERE page_id = ? ORDER BY created_at DESC').all(pageId)
  },

  upsertPagePermission(pageId, subjectId, displayName, role) {
    this.database.prepare(`INSERT INTO page_permissions(page_id, subject_id, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(page_id, subject_id) DO UPDATE SET display_name=excluded.display_name, role=excluded.role`)
      .run(pageId, subjectId, displayName, role, new Date().toISOString())
  },

  loadPagePermissions(pageId) {
    return this.database.prepare('SELECT subject_id AS subjectId, display_name AS displayName, role FROM page_permissions WHERE page_id = ? ORDER BY role DESC, display_name').all(pageId)
  },

  removePagePermission(pageId, subjectId) {
    this.database.prepare("DELETE FROM page_permissions WHERE page_id=? AND subject_id=? AND role<>'owner'").run(pageId, subjectId)
  },

  getPageRole(pageId, subjectId) {
    return this.database.prepare('SELECT role FROM page_permissions WHERE page_id = ? AND subject_id = ?').get(pageId, subjectId)?.role ?? null
  },

  createComment(comment) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('INSERT INTO comments(id, page_id, author_id, author_name, body, anchor_json, resolved_at, created_at, mentions_json) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        .run(comment.id, comment.pageId, comment.authorId, comment.authorName, comment.body, comment.anchor ? JSON.stringify(comment.anchor) : null, now, JSON.stringify(comment.mentions ?? []))
      const notify = this.database.prepare('INSERT INTO notifications(id, recipient_id, page_id, comment_id, type, read_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)')
      for (const recipientId of comment.mentions ?? []) {
        if (recipientId !== comment.authorId) notify.run(randomUUID(), recipientId, comment.pageId, comment.id, 'mention', now)
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  },

  loadComments(pageId) {
    return this.database.prepare('SELECT id, author_name AS authorName, body, anchor_json AS anchor, mentions_json AS mentions, resolved_at AS resolvedAt, created_at AS createdAt FROM comments WHERE page_id = ? ORDER BY created_at DESC').all(pageId)
      .map((comment) => ({ ...comment, anchor: comment.anchor ? JSON.parse(comment.anchor) : null, mentions: JSON.parse(comment.mentions) }))
  },

  resolveComment(id) {
    this.database.prepare('UPDATE comments SET resolved_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  },

  loadNotifications(recipientId) {
    return this.database.prepare(`SELECT n.id, n.type, n.read_at AS readAt, n.created_at AS createdAt, p.id AS pageId, p.title AS pageTitle,
      c.author_name AS authorName, c.body FROM notifications n JOIN pages p ON p.id=n.page_id LEFT JOIN comments c ON c.id=n.comment_id
      WHERE n.recipient_id=? ORDER BY n.created_at DESC LIMIT 100`).all(recipientId)
  },

  markNotificationRead(id, recipientId) {
    this.database.prepare('UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?').run(new Date().toISOString(), id, recipientId)
  }
}
