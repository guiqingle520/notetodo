const { randomUUID } = require('node:crypto')

const LOCAL_USER_NAME = '本机用户'
const LOCAL_USER_COLOR = '#c45134'

/**
 * Resolves the device identity and its page role inside the main process.
 * A page without an explicit row belongs to the local-first workspace owner;
 * the first privileged operation materializes that implicit ownership.
 */
function resolveLocalCollaborationIdentity(database, pageId, createId = randomUUID) {
  let userId = database.getSetting('collaboration_user_id')
  if (!userId) {
    userId = createId()
    database.setSetting('collaboration_user_id', userId)
  }

  let role = database.getPageRole(pageId, userId)
  if (!role) {
    role = 'owner'
    database.upsertPagePermission(pageId, userId, LOCAL_USER_NAME, role)
  }
  return { userId, name: LOCAL_USER_NAME, color: LOCAL_USER_COLOR, role }
}

/** Rechecks authorization at the privileged boundary before any permission write. */
function assertCanManagePagePermission(database, pageId, subjectId) {
  const actor = resolveLocalCollaborationIdentity(database, pageId)
  if (actor.role !== 'owner') throw new Error('只有页面所有者可以管理共享成员。')
  if (actor.userId === subjectId) throw new Error('不能通过成员管理接口修改自己的所有者权限。')
  if (database.getPageRole(pageId, subjectId) === 'owner') {
    throw new Error('不能通过成员管理接口修改其他所有者。')
  }
  return actor
}

function upsertPagePermission(database, pageId, subjectId, displayName, role) {
  assertCanManagePagePermission(database, pageId, subjectId)
  database.upsertPagePermission(pageId, subjectId, displayName, role)
}

function removePagePermission(database, pageId, subjectId) {
  assertCanManagePagePermission(database, pageId, subjectId)
  database.removePagePermission(pageId, subjectId)
}

module.exports = {
  assertCanManagePagePermission,
  removePagePermission,
  resolveLocalCollaborationIdentity,
  upsertPagePermission,
}
