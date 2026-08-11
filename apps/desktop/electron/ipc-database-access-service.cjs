const READ_ROLES = new Set(['viewer', 'commenter', 'editor', 'owner'])
const COMMENT_ROLES = new Set(['commenter', 'editor', 'owner'])
const WRITE_ROLES = new Set(['editor', 'owner'])

/**
 * Adds page authorization to database operations before they reach SQLite.
 * Resource ids are resolved to their owning page in SQL so global ids cannot
 * be used to bypass page permissions in the trusted renderer process.
 */
function createDatabaseAccessService(database) {
  const repository = database.recordRepository

  function currentActor(pageId) {
    const userId = database.getSetting('collaboration_user_id')
    const permissions = database.loadPagePermissions(pageId)
    if (!permissions.length) return { userId, displayName: '本机用户', role: 'owner' }
    const permission = userId
      ? permissions.find((candidate) => candidate.subjectId === userId)
      : undefined
    if (!permission) throw new Error('数据库资源不存在或当前用户无权访问。')
    return { userId, displayName: permission.displayName, role: permission.role }
  }

  function assertPageRole(pageId, allowedRoles) {
    const actor = currentActor(pageId)
    if (!allowedRoles.has(actor.role)) throw new Error('当前角色无权执行此数据库操作。')
    return actor
  }

  function resolvePage(statement, id) {
    const page = statement.get(id)
    if (!page) throw new Error('数据库资源不存在或当前用户无权访问。')
    return page.pageId
  }

  const databasePage = (databaseId) => resolvePage(repository.accessPageByDatabase, databaseId)
  const recordPage = (recordId) => resolvePage(repository.accessPageByRecord, recordId)

  function assertRelationTarget(property) {
    if (!property || property.type !== 'relation') return
    const relation = JSON.parse(property.config_json || '{}').relation
    if (!relation?.databaseId) return
    const roles = relation.reciprocalPropertyId ? WRITE_ROLES : READ_ROLES
    assertPageRole(databasePage(relation.databaseId), roles)
  }

  function assertPropertyConfigurationTargets(databaseId, config) {
    if (config.relation?.databaseId) {
      const roles = config.relation.reciprocalPropertyId ? WRITE_ROLES : READ_ROLES
      assertPageRole(databasePage(config.relation.databaseId), roles)
    }
    if (config.rollup?.relationPropertyId) {
      const relation = repository.reciprocalPropertyConfig.get(
        config.rollup.relationPropertyId,
        databaseId,
      )
      assertRelationTarget(relation)
    }
  }

  return Object.freeze({
    loadDatabaseByPage(pageId) {
      assertPageRole(pageId, READ_ROLES)
      return database.loadDatabaseByPage(pageId)
    },
    createDatabaseForPage(pageId, databaseId, name) {
      assertPageRole(pageId, WRITE_ROLES)
      return database.createDatabaseForPage(pageId, databaseId, name)
    },
    addDatabaseProperty(databaseId, propertyId, name, type) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.addDatabaseProperty(databaseId, propertyId, name, type)
    },
    listDatabaseSources() {
      const userId = database.getSetting('collaboration_user_id') ?? ''
      return repository.authorizedDatabaseSources.all(userId)
    },
    updateDatabasePropertyConfig(databaseId, propertyId, config) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      // Relations read another page and reciprocal relations write it. Check
      // both sides before persisting a configuration that enables that access.
      assertPropertyConfigurationTargets(databaseId, config)
      return database.updateDatabasePropertyConfig(databaseId, propertyId, config)
    },
    renameDatabaseProperty(databaseId, propertyId, name) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.renameDatabaseProperty(databaseId, propertyId, name)
    },
    renameDatabase(databaseId, name) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.renameDatabase(databaseId, name)
    },
    reorderDatabaseProperties(databaseId, propertyIds) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.reorderDatabaseProperties(databaseId, propertyIds)
    },
    deleteDatabaseProperty(databaseId, propertyId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.deleteDatabaseProperty(databaseId, propertyId)
    },
    updateDatabaseCell(recordId, propertyId, value) {
      assertPageRole(recordPage(recordId), WRITE_ROLES)
      assertRelationTarget(repository.cellProperty.get(recordId, propertyId))
      return database.updateDatabaseCell(recordId, propertyId, value)
    },
    createDatabaseRecord(databaseId, recordId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.createDatabaseRecord(databaseId, recordId)
    },
    duplicateDatabaseRecord(databaseId, sourceRecordId, recordId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.duplicateDatabaseRecord(databaseId, sourceRecordId, recordId)
    },
    trashDatabaseRecords(databaseId, recordIds) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.trashDatabaseRecords(databaseId, recordIds)
    },
    listTrashedDatabaseRecords(databaseId) {
      assertPageRole(databasePage(databaseId), READ_ROLES)
      return database.listTrashedDatabaseRecords(databaseId)
    },
    restoreDatabaseRecords(databaseId, recordIds) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.restoreDatabaseRecords(databaseId, recordIds)
    },
    deleteDatabaseRecordsPermanently(databaseId, recordIds) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.deleteDatabaseRecordsPermanently(databaseId, recordIds)
    },
    updateDatabaseRecordContent(recordId, content) {
      assertPageRole(recordPage(recordId), WRITE_ROLES)
      return database.updateDatabaseRecordContent(recordId, content)
    },
    listDatabaseRecordHistory(recordId) {
      assertPageRole(recordPage(recordId), READ_ROLES)
      return database.listDatabaseRecordHistory(recordId)
    },
    restoreDatabaseRecordHistory(historyId) {
      const pageId = resolvePage(repository.accessPageByHistory, historyId)
      assertPageRole(pageId, WRITE_ROLES)
      return database.restoreDatabaseRecordHistory(historyId)
    },
    listDatabaseRecordComments(recordId, unresolvedOnly) {
      assertPageRole(recordPage(recordId), READ_ROLES)
      return database.listDatabaseRecordComments(recordId, unresolvedOnly)
    },
    createDatabaseRecordComment(comment) {
      const actor = assertPageRole(recordPage(comment.recordId), COMMENT_ROLES)
      return database.createDatabaseRecordComment({ ...comment, authorName: actor.displayName })
    },
    resolveDatabaseRecordComment(id, resolved) {
      const pageId = resolvePage(repository.accessPageByComment, id)
      assertPageRole(pageId, WRITE_ROLES)
      return database.resolveDatabaseRecordComment(id, resolved)
    },
    deleteDatabaseRecordComment(id) {
      const pageId = resolvePage(repository.accessPageByComment, id)
      assertPageRole(pageId, WRITE_ROLES)
      return database.deleteDatabaseRecordComment(id)
    },
    listDatabaseRecordReminders(recordId) {
      assertPageRole(recordPage(recordId), READ_ROLES)
      return database.listDatabaseRecordReminders(recordId)
    },
    listDueDatabaseRecordReminders() {
      const userId = database.getSetting('collaboration_user_id') ?? ''
      const now = new Date().toISOString()
      return repository.authorizedDueRecordReminders
        .all(now, userId, 100)
        .map((reminder) => ({ ...reminder, overdue: true }))
    },
    saveDatabaseRecordReminder(reminder) {
      assertPageRole(recordPage(reminder.recordId), WRITE_ROLES)
      return database.saveDatabaseRecordReminder(reminder)
    },
    completeDatabaseRecordReminder(id, completed) {
      const pageId = resolvePage(repository.accessPageByReminder, id)
      assertPageRole(pageId, WRITE_ROLES)
      return database.completeDatabaseRecordReminder(id, completed)
    },
    deleteDatabaseRecordReminder(id) {
      const pageId = resolvePage(repository.accessPageByReminder, id)
      assertPageRole(pageId, WRITE_ROLES)
      return database.deleteDatabaseRecordReminder(id)
    },
    setActiveDatabaseView(databaseId, viewId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.setActiveDatabaseView(databaseId, viewId)
    },
    updateDatabaseViewConfig(databaseId, viewId, config) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.updateDatabaseViewConfig(databaseId, viewId, config)
    },
    createDatabaseView(databaseId, viewId, name, type, config) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.createDatabaseView(databaseId, viewId, name, type, config)
    },
    renameDatabaseView(databaseId, viewId, name) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.renameDatabaseView(databaseId, viewId, name)
    },
    deleteDatabaseView(databaseId, viewId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.deleteDatabaseView(databaseId, viewId)
    },
    setDefaultDatabaseView(databaseId, viewId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.setDefaultDatabaseView(databaseId, viewId)
    },
    bulkUpdateDatabaseRecords(databaseId, recordIds, propertyId, value) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      assertRelationTarget(repository.propertyConfig.get(propertyId, databaseId))
      return database.bulkUpdateDatabaseRecords(databaseId, recordIds, propertyId, value)
    },
    importDatabaseRecords(databaseId, records) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.importDatabaseRecords(databaseId, records)
    },
    saveDatabaseTemplate(databaseId, template) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.saveDatabaseTemplate(databaseId, template)
    },
    deleteDatabaseTemplate(databaseId, templateId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.deleteDatabaseTemplate(databaseId, templateId)
    },
    createDatabaseRecordFromTemplate(databaseId, templateId, recordId) {
      assertPageRole(databasePage(databaseId), WRITE_ROLES)
      return database.createDatabaseRecordFromTemplate(databaseId, templateId, recordId)
    },
  })
}

module.exports = { createDatabaseAccessService }
