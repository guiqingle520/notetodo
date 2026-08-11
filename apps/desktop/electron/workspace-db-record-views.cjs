module.exports = {
  saveDatabaseTemplate(databaseId, template) {
    const existing = this.recordRepository.templateDatabase.get(template.id)
    if (existing && existing.database_id !== databaseId) {
      throw new Error('Template belongs to another database.')
    }
    if (!existing) {
      const count = this.recordRepository.templateCount.get(databaseId).count
      if (count >= 50) throw new Error('A database cannot contain more than 50 templates.')
    }
    const now = new Date().toISOString()
    const result = this.recordRepository.upsertTemplate.run(
      template.id,
      databaseId,
      template.name,
      JSON.stringify(template.values),
      template.content,
      template.createdAt || now,
      now,
      databaseId,
    )
    if (result.changes !== 1) throw new Error('Database does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  deleteDatabaseTemplate(databaseId, templateId) {
    const result = this.recordRepository.deleteTemplate.run(templateId, databaseId)
    if (result.changes !== 1) throw new Error('Database template does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  createDatabaseRecordFromTemplate(databaseId, templateId, recordId) {
    const template = this.recordRepository.templateById.get(templateId, databaseId)
    if (!template) throw new Error('Database template does not exist.')
    const values = JSON.parse(template.values_json)
    const properties = this.recordRepository.databaseProperties.all(databaseId)
    const now = new Date().toISOString()
    this.recordRepository.transaction(() => {
      this.assertDatabaseRecordCapacity(databaseId, 1)
      this.assertDatabaseRecordStorageCapacity(databaseId, 1)
      const position = this.recordRepository.nextRecordPosition.get(databaseId).position
      this.recordRepository.insertRecordWithContent.run(
        recordId,
        databaseId,
        position,
        template.content,
        now,
        now,
      )
      for (const property of properties) {
        if (['formula', 'rollup'].includes(property.type)) continue
        const constraints = JSON.parse(property.config_json || '{}').constraints || {}
        const value = Object.hasOwn(values, property.id)
          ? values[property.id]
          : constraints.defaultValue
        if (
          Object.hasOwn(values, property.id) ||
          Object.hasOwn(constraints, 'defaultValue') ||
          constraints.required
        ) {
          this.writeDatabasePropertyValue(recordId, property, value, now)
        }
      }
      this.enqueueWebhookEvent(
        'database.record.created',
        recordId,
        { record: { id: recordId, databaseId, templateId, createdAt: now } },
        now,
      )
    })
    return this.loadDatabaseById(databaseId)
  },

  setActiveDatabaseView(databaseId, viewId) {
    const result = this.recordRepository.activateView.run(viewId, databaseId, viewId, databaseId)
    if (result.changes !== 1) throw new Error('Database view does not exist.')
  },

  updateDatabaseViewConfig(databaseId, viewId, config) {
    const result = this.recordRepository.updateViewConfig.run(
      JSON.stringify(config),
      viewId,
      databaseId,
    )
    if (result.changes !== 1) throw new Error('Database view does not exist.')
  },

  createDatabaseView(databaseId, viewId, name, type, config) {
    const viewCount = this.recordRepository.viewCount.get(databaseId).count
    if (viewCount >= 50) throw new Error('A database cannot contain more than 50 views.')
    const position = this.recordRepository.nextViewPosition.get(databaseId).position
    const result = this.recordRepository.insertViewIfDatabaseExists.run(
      viewId,
      databaseId,
      name,
      type,
      position,
      JSON.stringify(config),
      databaseId,
    )
    if (result.changes !== 1) throw new Error('Database does not exist.')
    this.setActiveDatabaseView(databaseId, viewId)
    return this.loadDatabaseById(databaseId)
  },

  renameDatabaseView(databaseId, viewId, name) {
    const result = this.recordRepository.renameView.run(name, viewId, databaseId)
    if (result.changes !== 1) throw new Error('Database view does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  deleteDatabaseView(databaseId, viewId) {
    const views = this.recordRepository.orderedViews.all(databaseId)
    const target = views.find((view) => view.id === viewId)
    if (!target) throw new Error('Database view does not exist.')
    if (views.length <= 1) throw new Error('The final database view cannot be deleted.')
    const fallbackId = views.find((view) => view.id !== viewId).id
    this.recordRepository.transaction(() => {
      this.recordRepository.deleteView.run(viewId, databaseId)
      this.recordRepository.replaceActiveView.run(fallbackId, databaseId, viewId)
      // Keep view positions dense so the first row remains the default view.
      this.recordRepository.compactViewPositions.run(databaseId, target.position)
    })
    return this.loadDatabaseById(databaseId)
  },

  setDefaultDatabaseView(databaseId, viewId) {
    const views = this.recordRepository.viewIds.all(databaseId)
    if (!views.some((view) => view.id === viewId)) {
      throw new Error('Database view does not exist.')
    }
    const ordered = [viewId, ...views.map((view) => view.id).filter((id) => id !== viewId)]
    this.recordRepository.transaction(() => {
      const update = this.recordRepository.reorderView
      ordered.forEach((id, position) => update.run(position, id, databaseId))
    })
    return this.loadDatabaseById(databaseId)
  },
}
