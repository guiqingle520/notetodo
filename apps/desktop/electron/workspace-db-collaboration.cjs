const { randomUUID } = require('node:crypto')

module.exports = {
  loadSyncDocument(pageId) {
    const document = this.collaborationRepository.syncDocument.get(pageId)
    const afterId = document?.compacted_through_id ?? 0
    const updates = this.collaborationRepository.syncUpdates.all(pageId, afterId)
    return {
      snapshot: document?.snapshot ? Buffer.from(document.snapshot).toString('base64') : null,
      updates: updates.map((update) => ({ id: update.id, clientId: update.client_id, data: Buffer.from(update.update_blob).toString('base64') })),
      latestUpdateId: updates.at(-1)?.id ?? afterId,
    }
  },

  appendSyncUpdate(pageId, clientId, base64Update) {
    const update = Buffer.from(base64Update, 'base64')
    const result = this.collaborationRepository.appendSyncUpdate.run(pageId, clientId, update, new Date().toISOString())
    return Number(result.lastInsertRowid)
  },

  compactSyncDocument(pageId, base64Snapshot, throughId) {
    const snapshot = Buffer.from(base64Snapshot, 'base64')
    const now = new Date().toISOString()
    this.collaborationRepository.transaction(() => {
      this.collaborationRepository.upsertSyncDocument.run(pageId, snapshot, throughId, now)
      this.collaborationRepository.deleteCompactedUpdates.run(pageId, throughId)
    })
  },

  createAIPatchAudit(id, pageId, operation, preview) {
    const now = new Date().toISOString()
    this.collaborationRepository.createPatchAudit
      .run(id, pageId, operation, preview, 'proposed', now, now)
    return id
  },

  updateAIPatchAudit(id, status) {
    const current = this.collaborationRepository.patchAuditById.get(id)
    if (!current) throw new Error('AI Patch 审计记录不存在。')
    if (current.status === status) return
    const allowedNextStatuses = {
      proposed: new Set(['applied', 'rejected']),
      applied: new Set(['undone']),
      undone: new Set(),
      rejected: new Set(),
    }
    if (!allowedNextStatuses[current.status]?.has(status)) {
      throw new Error(`AI Patch 状态不能从 ${current.status} 变更为 ${status}。`)
    }
    this.collaborationRepository.updatePatchAudit.run(status, new Date().toISOString(), id)
  },

  loadAIPatchAudit(pageId) {
    return this.collaborationRepository.patchAuditByPage.all(pageId)
  },

  upsertPagePermission(pageId, subjectId, displayName, role) {
    this.collaborationRepository.upsertPermission
      .run(pageId, subjectId, displayName, role, new Date().toISOString())
  },

  loadPagePermissions(pageId) {
    return this.collaborationRepository.permissionsByPage.all(pageId)
  },

  removePagePermission(pageId, subjectId) {
    this.collaborationRepository.removePermission.run(pageId, subjectId)
  },

  getPageRole(pageId, subjectId) {
    return this.collaborationRepository.pageRole.get(pageId, subjectId)?.role ?? null
  },

  createComment(comment) {
    const now = new Date().toISOString()
    this.collaborationRepository.transaction(() => {
      this.collaborationRepository.createComment
        .run(comment.id, comment.pageId, comment.authorId, comment.authorName, comment.body, comment.anchor ? JSON.stringify(comment.anchor) : null, now, JSON.stringify(comment.mentions ?? []))
      const notify = this.collaborationRepository.createNotification
      for (const recipientId of comment.mentions ?? []) {
        if (recipientId !== comment.authorId) notify.run(randomUUID(), recipientId, comment.pageId, comment.id, 'mention', now)
      }
    })
  },

  loadComments(pageId) {
    return this.collaborationRepository.commentsByPage.all(pageId)
      .map((comment) => ({ ...comment, anchor: comment.anchor ? JSON.parse(comment.anchor) : null, mentions: JSON.parse(comment.mentions) }))
  },

  resolveComment(id) {
    this.collaborationRepository.resolveComment.run(new Date().toISOString(), id)
  },

  loadNotifications(recipientId) {
    return this.collaborationRepository.notificationsByRecipient.all(recipientId)
  },

  markNotificationRead(id, recipientId) {
    this.collaborationRepository.markNotificationRead.run(new Date().toISOString(), id, recipientId)
  }
}
