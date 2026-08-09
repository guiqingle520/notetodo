/**
 * Rechecks page role in the privileged process. A missing permission row keeps
 * the local-first owner's implicit access; explicit read-only roles cannot restore.
 */
function restorePageVersion(database, pageId, versionId) {
  const userId = database.getSetting('collaboration_user_id')
  const role = userId ? database.getPageRole(pageId, userId) : null
  if (role && !['editor', 'owner'].includes(role)) {
    throw new Error('当前角色无权恢复页面历史。')
  }
  return database.restorePageVersion(pageId, versionId)
}

module.exports = { restorePageVersion }
