module.exports = Object.freeze({
  begin: 'BEGIN IMMEDIATE', commit: 'COMMIT', rollback: 'ROLLBACK',
  syncDocument: 'SELECT snapshot, compacted_through_id FROM sync_documents WHERE page_id = ?',
  syncUpdates: 'SELECT id, client_id, update_blob FROM sync_updates WHERE page_id = ? AND id > ? ORDER BY id',
  appendSyncUpdate: 'INSERT INTO sync_updates(page_id, client_id, update_blob, created_at) VALUES (?, ?, ?, ?)',
  upsertSyncDocument: `INSERT INTO sync_documents(page_id, snapshot, compacted_through_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(page_id) DO UPDATE SET snapshot=excluded.snapshot, compacted_through_id=excluded.compacted_through_id, updated_at=excluded.updated_at`,
  deleteCompactedUpdates: 'DELETE FROM sync_updates WHERE page_id = ? AND id <= ?',
  createPatchAudit: 'INSERT INTO ai_patch_audit(id, page_id, operation, preview, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  updatePatchAudit: 'UPDATE ai_patch_audit SET status = ?, updated_at = ? WHERE id = ?',
  patchAuditByPage: 'SELECT id, operation, preview, status FROM ai_patch_audit WHERE page_id = ? ORDER BY created_at DESC',
  upsertPermission: `INSERT INTO page_permissions(page_id, subject_id, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(page_id, subject_id) DO UPDATE SET display_name=excluded.display_name, role=excluded.role`,
  permissionsByPage: 'SELECT subject_id AS subjectId, display_name AS displayName, role FROM page_permissions WHERE page_id = ? ORDER BY role DESC, display_name',
  removePermission: "DELETE FROM page_permissions WHERE page_id=? AND subject_id=? AND role<>'owner'",
  pageRole: 'SELECT role FROM page_permissions WHERE page_id = ? AND subject_id = ?',
  createComment: 'INSERT INTO comments(id, page_id, author_id, author_name, body, anchor_json, resolved_at, created_at, mentions_json) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
  createNotification: 'INSERT INTO notifications(id, recipient_id, page_id, comment_id, type, read_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
  commentsByPage: 'SELECT id, author_name AS authorName, body, anchor_json AS anchor, mentions_json AS mentions, resolved_at AS resolvedAt, created_at AS createdAt FROM comments WHERE page_id = ? ORDER BY created_at DESC',
  resolveComment: 'UPDATE comments SET resolved_at = ? WHERE id = ?',
  notificationsByRecipient: `SELECT n.id, n.type, n.read_at AS readAt, n.created_at AS createdAt, p.id AS pageId, p.title AS pageTitle,
    c.author_name AS authorName, c.body FROM notifications n JOIN pages p ON p.id=n.page_id LEFT JOIN comments c ON c.id=n.comment_id
    WHERE n.recipient_id=? ORDER BY n.created_at DESC LIMIT 100`,
  markNotificationRead: 'UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?',
})
