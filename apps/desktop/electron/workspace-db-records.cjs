const { randomUUID } = require('node:crypto')

module.exports = {
  loadDatabaseByPage(pageId) {
    const database = this.database.prepare('SELECT id, name, active_view_id FROM databases WHERE page_id = ?').get(pageId)
    if (!database) return null
    const propertyRows = this.database.prepare('SELECT id, name, type, config_json FROM database_properties WHERE database_id = ? ORDER BY position').all(database.id)
    const properties = propertyRows.map((property) => ({
      id: property.id,
      name: property.name,
      type: property.type,
      ...JSON.parse(property.config_json),
    }))
    const recordRows = this.database.prepare('SELECT id, content, created_at, updated_at FROM database_records WHERE database_id = ? AND archived_at IS NULL ORDER BY position').all(database.id)
    const valueStatement = this.database.prepare(`
      SELECT property_id, text_value, number_value, boolean_value, json_value
      FROM property_values WHERE record_id = ?
    `)
    const records = recordRows.map((record) => {
      const values = {}
      for (const row of valueStatement.all(record.id)) {
        values[row.property_id] = row.number_value ?? (row.boolean_value === null ? null : Boolean(row.boolean_value)) ?? row.text_value
        if (row.text_value !== null) values[row.property_id] = row.text_value
        if (row.json_value !== null) values[row.property_id] = JSON.parse(row.json_value)
      }
      return { id: record.id, values, content: record.content, createdAt: record.created_at, updatedAt: record.updated_at }
    })
    const views = this.database.prepare('SELECT id, name, type, config_json FROM database_views WHERE database_id = ? ORDER BY position').all(database.id).map((view) => ({
      id: view.id,
      databaseId: database.id,
      name: view.name,
      type: view.type,
      config: JSON.parse(view.config_json),
    }))
    const templates = this.database.prepare('SELECT id, name, values_json, content, created_at, updated_at FROM database_templates WHERE database_id = ? ORDER BY created_at, id').all(database.id).map((template) => ({
      id: template.id, databaseId: database.id, name: template.name, values: JSON.parse(template.values_json), content: template.content,
      createdAt: template.created_at, updatedAt: template.updated_at,
    }))
    return { schema: { id: database.id, name: database.name, properties }, records, views, activeViewId: database.active_view_id, templates }
  },

  createDatabaseForPage(pageId, databaseId, name) {
    const title = `${databaseId}-title`; const status = `${databaseId}-status`; const date = `${databaseId}-date`
    const tableView = `${databaseId}-table`
    const statusConfig = JSON.stringify({ options: [
      { id: 'todo', name: '待开始', color: 'slate' },
      { id: 'doing', name: '进行中', color: 'amber' },
      { id: 'done', name: '已完成', color: 'green' },
    ] })
    this.database.exec('BEGIN IMMEDIATE')
    try {
      if (!this.database.prepare('SELECT 1 FROM pages WHERE id = ? AND archived_at IS NULL').get(pageId)) throw new Error('Database page does not exist.')
      this.database.prepare('INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)').run(databaseId, pageId, name, tableView)
      const insertProperty = this.database.prepare('INSERT INTO database_properties(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
      insertProperty.run(title, databaseId, '名称', 'title', 0, '{}')
      insertProperty.run(status, databaseId, '状态', 'select', 1, statusConfig)
      insertProperty.run(date, databaseId, '日期', 'date', 2, '{}')
      this.database.prepare('INSERT INTO database_views(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
        .run(tableView, databaseId, '默认表格', 'table', 0, '{}')
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseByPage(pageId)
  },

  addDatabaseProperty(databaseId, propertyId, name, type) {
    let config = type === 'select' || type === 'multiSelect' ? JSON.stringify({ options: [
      { id: 'option-1', name: '选项 1', color: 'slate' },
      { id: 'option-2', name: '选项 2', color: 'amber' },
    ] }) : type === 'relation' ? JSON.stringify({ relation: { databaseId } }) : type === 'formula' ? JSON.stringify({ formula: { expression: '""' } }) : '{}'
    if (type === 'rollup') {
      const relation = this.database.prepare("SELECT id, config_json FROM database_properties WHERE database_id = ? AND type = 'relation' ORDER BY position LIMIT 1").get(databaseId)
      if (!relation) throw new Error('Rollup requires an existing relation property.')
      const targetDatabaseId = JSON.parse(relation.config_json || '{}').relation?.databaseId || databaseId
      const target = this.database.prepare("SELECT id FROM database_properties WHERE database_id = ? AND type NOT IN ('formula', 'rollup') ORDER BY position LIMIT 1").get(targetDatabaseId)
      if (!target) throw new Error('The relation target has no properties.')
      config = JSON.stringify({ rollup: { relationPropertyId: relation.id, targetPropertyId: target.id, aggregation: 'count' } })
    }
    const position = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_properties WHERE database_id = ?').get(databaseId).position
    const result = this.database.prepare('INSERT INTO database_properties(id, database_id, name, type, position, config_json) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM databases WHERE id = ?)')
      .run(propertyId, databaseId, name, type, position, config, databaseId)
    if (result.changes !== 1) throw new Error('Database does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  listDatabaseSources() {
    return this.database.prepare(`
      SELECT database.id, database.page_id AS pageId, database.name, page.title AS pageTitle,
        (SELECT COUNT(*) FROM database_records record WHERE record.database_id = database.id) AS recordCount
      FROM databases database JOIN pages page ON page.id = database.page_id
      WHERE page.archived_at IS NULL ORDER BY page.last_visited_at DESC, database.name, database.id
    `).all()
  },

  updateDatabasePropertyConfig(databaseId, propertyId, config) {
    const property = this.database.prepare('SELECT type, config_json FROM database_properties WHERE id = ? AND database_id = ?').get(propertyId, databaseId)
    if (!property) throw new Error('Database property does not exist.')
    let normalized = {}
    if (property.type === 'select' || property.type === 'multiSelect') {
      const colors = new Set(['slate', 'gray', 'brown', 'red', 'orange', 'amber', 'green', 'blue', 'purple', 'pink'])
      if (!Array.isArray(config.options) || config.options.length > 100) throw new TypeError('Select configuration must contain at most 100 options.')
      const ids = new Set(); const names = new Set()
      const options = config.options.map((option) => {
        if (!option || typeof option.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(option.id) || ids.has(option.id)) throw new TypeError('Select option IDs must be unique and safe.')
        const name = typeof option.name === 'string' ? option.name.trim() : ''
        const nameKey = name.toLocaleLowerCase()
        if (!name || name.length > 100 || names.has(nameKey) || !colors.has(option.color)) throw new TypeError('Select options require unique names and valid colors.')
        ids.add(option.id); names.add(nameKey); return { id: option.id, name, color: option.color }
      })
      normalized = { options }
    } else if (property.type === 'relation') {
      const targetId = config?.relation?.databaseId
      if (typeof targetId !== 'string' || !this.database.prepare('SELECT 1 FROM databases WHERE id = ?').get(targetId)) throw new TypeError('Relation target database does not exist.')
      const reciprocalPropertyId = config?.relation?.reciprocalPropertyId
      if (reciprocalPropertyId !== undefined) {
        const reciprocal = this.database.prepare("SELECT config_json FROM database_properties WHERE id = ? AND database_id = ? AND type = 'relation'").get(reciprocalPropertyId, targetId)
        if (!reciprocal || JSON.parse(reciprocal.config_json || '{}').relation?.databaseId !== databaseId) throw new TypeError('反向关联属性必须位于目标数据库并指回当前数据库。')
      }
      normalized = { relation: { databaseId: targetId, ...(reciprocalPropertyId ? { reciprocalPropertyId } : {}) } }
    } else if (property.type === 'formula') {
      const expression = typeof config?.formula?.expression === 'string' ? config.formula.expression.trim() : ''
      if (!expression || expression.length > 1000) throw new TypeError('Formula expression must contain 1 to 1,000 characters.')
      normalized = { formula: { expression } }
    } else if (property.type === 'rollup') {
      const rollup = config?.rollup
      const relation = this.database.prepare("SELECT config_json FROM database_properties WHERE id = ? AND database_id = ? AND type = 'relation'").get(rollup?.relationPropertyId, databaseId)
      if (!relation) throw new TypeError('Rollup relation property does not exist.')
      const targetDatabaseId = JSON.parse(relation.config_json || '{}').relation?.databaseId || databaseId
      const target = this.database.prepare("SELECT type FROM database_properties WHERE id = ? AND database_id = ? AND type NOT IN ('formula', 'rollup')").get(rollup?.targetPropertyId, targetDatabaseId)
      const aggregations = new Set(['count', 'sum', 'average', 'min', 'max', 'showOriginal'])
      const numericAggregations = new Set(['sum', 'average', 'min', 'max'])
      if (!target || !aggregations.has(rollup?.aggregation) || (numericAggregations.has(rollup?.aggregation) && target.type !== 'number')) throw new TypeError('Rollup target property or aggregation is invalid.')
      normalized = { rollup: { relationPropertyId: rollup.relationPropertyId, targetPropertyId: rollup.targetPropertyId, aggregation: rollup.aggregation } }
    }
    const constraints = config?.constraints ?? {}
    if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) throw new TypeError('Property constraints must be an object.')
    if (['formula', 'rollup'].includes(property.type) && Object.keys(constraints).length) throw new TypeError('Derived properties cannot have write constraints.')
    if (constraints.unique && ['checkbox', 'multiSelect', 'relation'].includes(property.type)) throw new TypeError('This property type cannot require unique values.')
    const normalizedConstraints = {}
    if (constraints.required === true) normalizedConstraints.required = true
    if (constraints.unique === true) normalizedConstraints.unique = true
    if (Object.hasOwn(constraints, 'defaultValue')) normalizedConstraints.defaultValue = this.normalizeDatabasePropertyValue({ type: property.type, config_json: JSON.stringify(normalized) }, constraints.defaultValue)
    if (normalizedConstraints.required && !Object.hasOwn(normalizedConstraints, 'defaultValue')) throw new TypeError('A required property must define a default value for new records.')
    if (normalizedConstraints.unique && Object.hasOwn(normalizedConstraints, 'defaultValue')) throw new TypeError('A unique property cannot define a shared default value.')
    if (Object.keys(normalizedConstraints).length) normalized.constraints = normalizedConstraints
  
    // Refuse a stricter rule when existing active records already violate it.
    const snapshot = this.loadDatabaseById(databaseId)
    if (normalizedConstraints.required && snapshot.records.some((record) => this.isEmptyDatabasePropertyValue(record.values[propertyId]))) throw new Error('请先补全现有记录，再启用必填。')
    if (normalizedConstraints.unique) {
      const seen = new Set()
      for (const record of snapshot.records) {
        const value = record.values[propertyId]
        if (this.isEmptyDatabasePropertyValue(value)) continue
        const key = JSON.stringify(Array.isArray(value) ? [...value].sort() : value)
        if (seen.has(key)) throw new Error('请先处理现有重复值，再启用唯一值。')
        seen.add(key)
      }
    }
    const result = this.database.prepare('UPDATE database_properties SET config_json = ? WHERE id = ? AND database_id = ?').run(JSON.stringify(normalized), propertyId, databaseId)
    if (result.changes !== 1) throw new Error('Database property does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  renameDatabaseProperty(databaseId, propertyId, name) {
    const result = this.database.prepare('UPDATE database_properties SET name = ? WHERE id = ? AND database_id = ?').run(name, propertyId, databaseId)
    if (result.changes !== 1) throw new Error('Database property does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  renameDatabase(databaseId, name) {
    const result = this.database.prepare('UPDATE databases SET name = ? WHERE id = ?').run(name, databaseId)
    if (result.changes !== 1) throw new Error('Database does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  reorderDatabaseProperties(databaseId, propertyIds) {
    const existing = this.database.prepare('SELECT id FROM database_properties WHERE database_id = ? ORDER BY position').all(databaseId).map((row) => row.id)
    if (propertyIds.length !== existing.length || new Set(propertyIds).size !== existing.length || propertyIds.some((id) => !existing.includes(id))) throw new TypeError('Property order must contain every property exactly once.')
    const update = this.database.prepare('UPDATE database_properties SET position = ? WHERE id = ? AND database_id = ?')
    this.database.exec('BEGIN IMMEDIATE')
    try { propertyIds.forEach((id, position) => update.run(position, id, databaseId)); this.database.exec('COMMIT') }
    catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  deleteDatabaseProperty(databaseId, propertyId) {
    const property = this.database.prepare('SELECT type FROM database_properties WHERE id = ? AND database_id = ?').get(propertyId, databaseId)
    if (!property) throw new Error('Database property does not exist.')
    if (property.type === 'title') throw new Error('The title property cannot be deleted.')
    this.database.prepare('DELETE FROM database_properties WHERE id = ? AND database_id = ?').run(propertyId, databaseId)
    return this.loadDatabaseById(databaseId)
  },

  loadDatabaseById(databaseId) {
    const page = this.database.prepare('SELECT page_id FROM databases WHERE id = ?').get(databaseId)
    if (!page) throw new Error('Database does not exist.')
    return this.loadDatabaseByPage(page.page_id)
  },

  updateDatabaseCell(recordId, propertyId, value) {
    const property = this.database.prepare(`
      SELECT property.type, property.config_json, property.database_id AS databaseId
      FROM database_properties property
      JOIN database_records record ON record.id = ? AND record.database_id = property.database_id
      WHERE property.id = ?
    `).get(recordId, propertyId)
    if (!property) throw new Error('Database property does not exist.')
    if (property.type === 'formula' || property.type === 'rollup') throw new Error('Derived database properties are read-only.')
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const previous = this.readDatabasePropertyValue(recordId, propertyId)
      this.writeDatabasePropertyValue(recordId, { id: propertyId, ...property }, value, now)
      if (property.type === 'relation') this.syncReciprocalRelation(recordId, property, previous, value, now)
      this.appendDatabaseRecordHistory(recordId, propertyId, 'property', previous, this.normalizeDatabasePropertyValue(property, value), now)
      this.database.prepare('UPDATE database_records SET updated_at = ? WHERE id = ?').run(now, recordId)
      const automationRuns = this.executeDatabaseAutomations(property.databaseId, recordId, propertyId, now)
      this.enqueueWebhookEvent('database.record.updated', recordId, { record: { id: recordId, propertyId, value, updatedAt: now } }, now)
      this.database.exec('COMMIT')
      return { automationRuns }
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  },

  syncReciprocalRelation(recordId, property, previous, next, now) {
    const relation = JSON.parse(property.config_json || '{}').relation
    if (!relation?.reciprocalPropertyId) return
    const reciprocal = this.database.prepare("SELECT id, type, config_json, database_id AS databaseId FROM database_properties WHERE id = ? AND database_id = ? AND type = 'relation'").get(relation.reciprocalPropertyId, relation.databaseId)
    if (!reciprocal || JSON.parse(reciprocal.config_json || '{}').relation?.databaseId !== property.databaseId) throw new Error('反向关联配置已失效，请重新配置关联属性。')
    const before = new Set(Array.isArray(previous) ? previous : [])
    const after = new Set(this.normalizeDatabasePropertyValue(property, next) || [])
    for (const targetRecordId of new Set([...before, ...after])) {
      const current = this.readDatabasePropertyValue(targetRecordId, reciprocal.id)
      const values = new Set(Array.isArray(current) ? current : [])
      if (after.has(targetRecordId)) values.add(recordId); else values.delete(recordId)
      const updated = [...values]
      this.writeDatabasePropertyValue(targetRecordId, reciprocal, updated, now)
      this.appendDatabaseRecordHistory(targetRecordId, reciprocal.id, 'property', current, updated, now)
      this.database.prepare('UPDATE database_records SET updated_at = ? WHERE id = ?').run(now, targetRecordId)
    }
  },

  writeDatabasePropertyValue(recordId, property, value, now) {
    if (property.type === 'formula' || property.type === 'rollup') throw new Error('Derived database properties are read-only.')
    value = this.normalizeDatabasePropertyValue(property, value)
    const constraints = JSON.parse(property.config_json || '{}').constraints || {}
    if (constraints.required && this.isEmptyDatabasePropertyValue(value)) throw new TypeError('必填属性不能为空。')
    let textValue = null; let numberValue = null; let booleanValue = null; let jsonValue = null
    if (value !== null) {
      if (property.type === 'number') numberValue = value
      else if (property.type === 'checkbox') booleanValue = value ? 1 : 0
      else if (property.type === 'multiSelect') jsonValue = JSON.stringify(value)
      else if (property.type === 'relation') {
        if (!Array.isArray(value) || value.length > 100 || value.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 128)) throw new TypeError('Relation value must be an array of at most 100 record IDs.')
        const uniqueIds = [...new Set(value)]
        const relationDatabaseId = JSON.parse(property.config_json).relation?.databaseId
        if (typeof relationDatabaseId !== 'string') throw new Error('Relation property has no target database.')
        const recordExists = this.database.prepare('SELECT 1 FROM database_records WHERE id = ? AND database_id = ?')
        if (uniqueIds.some((id) => !recordExists.get(id, relationDatabaseId))) throw new Error('Relation target does not exist in the configured database.')
        jsonValue = JSON.stringify(uniqueIds)
      } else textValue = String(value)
    }
    if (constraints.unique && !this.isEmptyDatabasePropertyValue(value)) {
      const duplicate = this.database.prepare(`
        SELECT 1 FROM property_values value
        JOIN database_records record ON record.id = value.record_id
        WHERE value.property_id = ? AND value.record_id <> ? AND record.archived_at IS NULL
          AND value.text_value IS ? AND value.number_value IS ? AND value.boolean_value IS ? AND value.json_value IS ? LIMIT 1
      `).get(property.id, recordId, textValue, numberValue, booleanValue, jsonValue)
      if (duplicate) throw new TypeError('属性值必须唯一。')
    }
    this.database.prepare(`
      INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id, property_id) DO UPDATE SET text_value=excluded.text_value, number_value=excluded.number_value,
        boolean_value=excluded.boolean_value, json_value=excluded.json_value, updated_at=excluded.updated_at
    `).run(recordId, property.id, textValue, numberValue, booleanValue, jsonValue, now)
  },

  normalizeDatabasePropertyValue(property, value) {
    if (value === null || value === undefined || value === '') return null
    if (property.type === 'number') { const number = Number(value); if (!Number.isFinite(number)) throw new TypeError('Number property requires a finite value.'); return number }
    if (property.type === 'checkbox') return Boolean(value)
    if (property.type === 'multiSelect' || property.type === 'relation') {
      if (!Array.isArray(value)) throw new TypeError('Multi-value properties require an array.')
      return [...new Set(value)]
    }
    return String(value)
  },

  isEmptyDatabasePropertyValue(value) {
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  },

  readDatabasePropertyValue(recordId, propertyId) {
    const row = this.database.prepare('SELECT text_value, number_value, boolean_value, json_value FROM property_values WHERE record_id = ? AND property_id = ?').get(recordId, propertyId)
    if (!row) return null
    if (row.json_value !== null) return JSON.parse(row.json_value)
    if (row.text_value !== null) return row.text_value
    if (row.number_value !== null) return row.number_value
    return row.boolean_value === null ? null : Boolean(row.boolean_value)
  },

  appendDatabaseRecordHistory(recordId, propertyId, kind, previous, next, now) {
    if (JSON.stringify(previous) === JSON.stringify(next)) return
    this.database.prepare('INSERT INTO database_record_history(id, record_id, property_id, kind, previous_json, next_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), recordId, propertyId, kind, JSON.stringify(previous), JSON.stringify(next), now)
    this.database.prepare(`DELETE FROM database_record_history WHERE record_id = ? AND id NOT IN (
      SELECT id FROM database_record_history WHERE record_id = ? ORDER BY created_at DESC, id DESC LIMIT 200
    )`).run(recordId, recordId)
  },

  listDatabaseRecordHistory(recordId, limit = 100) {
    return this.database.prepare(`
      SELECT history.id, history.record_id AS recordId, history.property_id AS propertyId, history.kind,
        history.previous_json AS previousJson, history.next_json AS nextJson, history.created_at AS createdAt,
        COALESCE(property.name, '正文') AS propertyName
      FROM database_record_history history LEFT JOIN database_properties property ON property.id = history.property_id
      WHERE history.record_id = ? ORDER BY history.created_at DESC, history.id DESC LIMIT ?
    `).all(recordId, Math.max(1, Math.min(200, Math.trunc(limit)))).map((row) => ({ ...row, previous: JSON.parse(row.previousJson), next: JSON.parse(row.nextJson) }))
      .map(({ previousJson, nextJson, ...row }) => row)
  },

  restoreDatabaseRecordHistory(historyId) {
    const history = this.database.prepare('SELECT record_id, property_id, kind, previous_json FROM database_record_history WHERE id = ?').get(historyId)
    if (!history) throw new Error('Database record history does not exist.')
    const previous = JSON.parse(history.previous_json)
    if (history.kind === 'content') this.updateDatabaseRecordContent(history.record_id, previous)
    else this.updateDatabaseCell(history.record_id, history.property_id, previous)
    const databaseId = this.database.prepare('SELECT database_id FROM database_records WHERE id = ?').get(history.record_id)?.database_id
    return this.loadDatabaseById(databaseId)
  },

  listDatabaseRecordComments(recordId, unresolvedOnly = false) {
    return this.database.prepare(`
      SELECT comment.id, comment.record_id AS recordId, comment.property_id AS propertyId,
        COALESCE(property.name, '整条记录') AS propertyName, comment.author_name AS authorName,
        comment.body, comment.resolved_at AS resolvedAt, comment.created_at AS createdAt
      FROM database_record_comments comment LEFT JOIN database_properties property ON property.id = comment.property_id
      WHERE comment.record_id = ? AND (? = 0 OR comment.resolved_at IS NULL)
      ORDER BY comment.resolved_at IS NOT NULL, comment.created_at DESC, comment.id DESC LIMIT 500
    `).all(recordId, unresolvedOnly ? 1 : 0)
  },

  createDatabaseRecordComment(comment) {
    const body = String(comment.body ?? '').trim(); const authorName = String(comment.authorName ?? '').trim()
    if (!body || body.length > 10_000 || !authorName || authorName.length > 100) throw new TypeError('Record comment is invalid.')
    const record = this.database.prepare('SELECT database_id FROM database_records WHERE id = ? AND archived_at IS NULL').get(comment.recordId)
    if (!record) throw new Error('Database record does not exist.')
    if (comment.propertyId && !this.database.prepare('SELECT 1 FROM database_properties WHERE id = ? AND database_id = ?').get(comment.propertyId, record.database_id)) throw new Error('Comment property does not exist.')
    this.database.prepare('INSERT INTO database_record_comments(id, record_id, property_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(comment.id, comment.recordId, comment.propertyId || null, authorName, body, new Date().toISOString())
    return this.listDatabaseRecordComments(comment.recordId)
  },

  resolveDatabaseRecordComment(id, resolved) {
    const result = this.database.prepare('UPDATE database_record_comments SET resolved_at = ? WHERE id = ?').run(resolved ? new Date().toISOString() : null, id)
    if (result.changes !== 1) throw new Error('Database record comment does not exist.')
  },

  deleteDatabaseRecordComment(id) {
    if (this.database.prepare('DELETE FROM database_record_comments WHERE id = ?').run(id).changes !== 1) throw new Error('Database record comment does not exist.')
  },

  listDatabaseRecordReminders(recordId) {
    const now = new Date().toISOString()
    return this.database.prepare(`
      SELECT reminder.id, reminder.record_id AS recordId, reminder.property_id AS propertyId, property.name AS propertyName,
        reminder.due_at AS dueAt, reminder.note, reminder.completed_at AS completedAt,
        reminder.created_at AS createdAt, reminder.updated_at AS updatedAt
      FROM database_record_reminders reminder JOIN database_properties property ON property.id = reminder.property_id
      WHERE reminder.record_id = ? ORDER BY reminder.completed_at IS NOT NULL, reminder.due_at, reminder.id
    `).all(recordId).map((reminder) => ({ ...reminder, overdue: !reminder.completedAt && reminder.dueAt <= now }))
  },

  listDueDatabaseRecordReminders(limit = 100) {
    const now = new Date().toISOString()
    return this.database.prepare(`
      SELECT reminder.id, reminder.record_id AS recordId, reminder.property_id AS propertyId, property.name AS propertyName,
        reminder.due_at AS dueAt, reminder.note, reminder.completed_at AS completedAt,
        reminder.created_at AS createdAt, reminder.updated_at AS updatedAt
      FROM database_record_reminders reminder JOIN database_properties property ON property.id = reminder.property_id
      JOIN database_records record ON record.id = reminder.record_id
      WHERE reminder.completed_at IS NULL AND reminder.due_at <= ? AND record.archived_at IS NULL
      ORDER BY reminder.due_at, reminder.id LIMIT ?
    `).all(now, Math.max(1, Math.min(500, Math.trunc(limit)))).map((reminder) => ({ ...reminder, overdue: true }))
  },

  saveDatabaseRecordReminder(reminder) {
    const dueAt = new Date(reminder.dueAt)
    if (Number.isNaN(dueAt.getTime()) || String(reminder.note ?? '').length > 500) throw new TypeError('Record reminder is invalid.')
    const property = this.database.prepare(`SELECT property.type FROM database_properties property
      JOIN database_records record ON record.id = ? AND record.database_id = property.database_id
      WHERE property.id = ?`).get(reminder.recordId, reminder.propertyId)
    if (!property || property.type !== 'date') throw new Error('Reminder property must be a date property on this record.')
    const now = new Date().toISOString()
    this.database.prepare(`INSERT INTO database_record_reminders(id, record_id, property_id, due_at, note, completed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,
      due_at=excluded.due_at, note=excluded.note, completed_at=NULL, updated_at=excluded.updated_at`)
      .run(reminder.id, reminder.recordId, reminder.propertyId, dueAt.toISOString(), String(reminder.note ?? '').trim(), now, now)
    return this.listDatabaseRecordReminders(reminder.recordId)
  },

  completeDatabaseRecordReminder(id, completed) {
    const result = this.database.prepare('UPDATE database_record_reminders SET completed_at = ?, updated_at = ? WHERE id = ?')
      .run(completed ? new Date().toISOString() : null, new Date().toISOString(), id)
    if (result.changes !== 1) throw new Error('Database record reminder does not exist.')
  },

  deleteDatabaseRecordReminder(id) {
    if (this.database.prepare('DELETE FROM database_record_reminders WHERE id = ?').run(id).changes !== 1) throw new Error('Database record reminder does not exist.')
  },

  createDatabaseRecord(databaseId, recordId) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const nextPosition = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_records WHERE database_id = ?').get(databaseId).position
      this.database.prepare('INSERT INTO database_records(id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(recordId, databaseId, nextPosition, now, now)
      const properties = this.database.prepare("SELECT id, type, config_json FROM database_properties WHERE database_id = ? AND type NOT IN ('formula', 'rollup') ORDER BY position").all(databaseId)
      for (const property of properties) {
        const constraints = JSON.parse(property.config_json || '{}').constraints || {}
        if (Object.hasOwn(constraints, 'defaultValue')) this.writeDatabasePropertyValue(recordId, property, constraints.defaultValue, now)
      }
      this.enqueueWebhookEvent('database.record.created', recordId, { record: { id: recordId, databaseId, createdAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  },

  duplicateDatabaseRecord(databaseId, sourceRecordId, recordId) {
    const source = this.database.prepare('SELECT content FROM database_records WHERE id = ? AND database_id = ? AND archived_at IS NULL').get(sourceRecordId, databaseId)
    if (!source) throw new Error('Database record does not exist.')
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const nextPosition = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_records WHERE database_id = ?').get(databaseId).position
      this.database.prepare('INSERT INTO database_records(id, database_id, position, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(recordId, databaseId, nextPosition, source.content, now, now)
      const properties = this.database.prepare("SELECT id, type, config_json FROM database_properties WHERE database_id = ? AND type NOT IN ('formula', 'rollup') ORDER BY position").all(databaseId)
      const sourceValues = this.loadDatabaseById(databaseId).records.find((record) => record.id === sourceRecordId)?.values || {}
      for (const property of properties) {
        const constraints = JSON.parse(property.config_json || '{}').constraints || {}
        const value = constraints.unique ? null : sourceValues[property.id]
        if (value !== undefined) this.writeDatabasePropertyValue(recordId, property, value, now)
      }
      // Preserve persisted null placeholders for derived columns so legacy
      // snapshots keep the same shape; actual values are still recomputed.
      this.database.prepare(`INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
        SELECT ?, value.property_id, value.text_value, value.number_value, value.boolean_value, value.json_value, ?
        FROM property_values value JOIN database_properties property ON property.id = value.property_id
        WHERE value.record_id = ? AND property.type IN ('formula', 'rollup')`).run(recordId, now, sourceRecordId)
      this.enqueueWebhookEvent('database.record.created', recordId, { record: { id: recordId, databaseId, duplicatedFrom: sourceRecordId, createdAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  trashDatabaseRecords(databaseId, recordIds) {
    const now = new Date().toISOString()
    const update = this.database.prepare('UPDATE database_records SET archived_at = ?, updated_at = ? WHERE id = ? AND database_id = ? AND archived_at IS NULL')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const recordId of recordIds) if (update.run(now, now, recordId, databaseId).changes !== 1) throw new Error('A selected database record does not exist.')
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  listTrashedDatabaseRecords(databaseId, limit = 200) {
    return this.database.prepare(`
      SELECT records.id, COALESCE(title_value.text_value, '无标题') AS title, records.archived_at AS trashedAt
      FROM database_records records
      LEFT JOIN database_properties title ON title.database_id = records.database_id AND title.type = 'title'
      LEFT JOIN property_values title_value ON title_value.record_id = records.id AND title_value.property_id = title.id
      WHERE records.database_id = ? AND records.archived_at IS NOT NULL
      ORDER BY records.archived_at DESC, records.id DESC LIMIT ?
    `).all(databaseId, Math.max(1, Math.min(500, Math.trunc(limit))))
  },

  restoreDatabaseRecords(databaseId, recordIds) {
    const now = new Date().toISOString()
    const update = this.database.prepare('UPDATE database_records SET archived_at = NULL, updated_at = ? WHERE id = ? AND database_id = ? AND archived_at IS NOT NULL')
    const constrainedValues = this.database.prepare(`
      SELECT property.id, property.type, property.config_json, value.text_value, value.number_value, value.boolean_value, value.json_value
      FROM database_properties property LEFT JOIN property_values value ON value.property_id = property.id AND value.record_id = ?
      WHERE property.database_id = ? AND json_extract(property.config_json, '$.constraints') IS NOT NULL
    `)
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const recordId of recordIds) {
        for (const row of constrainedValues.all(recordId, databaseId)) {
          let value = row.text_value ?? row.number_value ?? (row.boolean_value === null ? null : Boolean(row.boolean_value))
          if (row.json_value !== null) value = JSON.parse(row.json_value)
          this.writeDatabasePropertyValue(recordId, row, value, now)
        }
        if (update.run(now, recordId, databaseId).changes !== 1) throw new Error('A trashed database record does not exist.')
      }
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  deleteDatabaseRecordsPermanently(databaseId, recordIds) {
    const remove = this.database.prepare('DELETE FROM database_records WHERE id = ? AND database_id = ? AND archived_at IS NOT NULL')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const recordId of recordIds) if (remove.run(recordId, databaseId).changes !== 1) throw new Error('A trashed database record does not exist.')
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  },

  updateDatabaseRecordContent(recordId, content) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const record = this.database.prepare('SELECT content FROM database_records WHERE id = ?').get(recordId)
      if (!record) throw new Error('Database record does not exist.')
      this.database.prepare('UPDATE database_records SET content = ?, updated_at = ? WHERE id = ?').run(content, now, recordId)
      this.appendDatabaseRecordHistory(recordId, null, 'content', record.content, content, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  },

  bulkUpdateDatabaseRecords(databaseId, recordIds, propertyId, value) {
    const property = this.database.prepare('SELECT id, type, config_json FROM database_properties WHERE id = ? AND database_id = ?').get(propertyId, databaseId)
    if (!property) throw new Error('Database property does not exist.')
    if (property.type === 'formula' || property.type === 'rollup') throw new Error('Derived database properties are read-only.')
    const now = new Date().toISOString()
    const exists = this.database.prepare('SELECT 1 FROM database_records WHERE id = ? AND database_id = ?')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const recordId of recordIds) {
        if (!exists.get(recordId, databaseId)) throw new Error('A selected database record does not exist.')
        const previous = this.readDatabasePropertyValue(recordId, propertyId)
        this.writeDatabasePropertyValue(recordId, property, value, now)
        this.appendDatabaseRecordHistory(recordId, propertyId, 'property', previous, this.normalizeDatabasePropertyValue(property, value), now)
        this.database.prepare('UPDATE database_records SET updated_at = ? WHERE id = ?').run(now, recordId)
        this.executeDatabaseAutomations(databaseId, recordId, propertyId, now)
      }
      this.enqueueWebhookEvent('database.record.updated', `${databaseId}:bulk`, { databaseId, recordIds, propertyId, value, updatedAt: now }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  importDatabaseRecords(databaseId, records) {
    if (!Array.isArray(records) || records.length < 1 || records.length > 10_000) throw new TypeError('A CSV import must contain between 1 and 10,000 records.')
    const properties = this.database.prepare('SELECT id, type, config_json FROM database_properties WHERE database_id = ? ORDER BY position').all(databaseId)
    if (!properties.length) throw new Error('Database does not exist.')
    const writable = new Map(properties.filter((property) => !['formula', 'rollup', 'relation'].includes(property.type)).map((property) => [property.id, property]))
    const now = new Date().toISOString()
    let position = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_records WHERE database_id = ?').get(databaseId).position
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const insert = this.database.prepare('INSERT INTO database_records(id, database_id, position, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      for (const record of records) {
        if (!record || typeof record.id !== 'string' || !record.id || typeof record.values !== 'object' || Array.isArray(record.values)) throw new TypeError('CSV import contains an invalid record.')
        insert.run(record.id, databaseId, position++, '', now, now)
        for (const property of writable.values()) {
          const constraints = JSON.parse(property.config_json || '{}').constraints || {}
          const value = Object.hasOwn(record.values, property.id) ? record.values[property.id] : constraints.defaultValue
          if (Object.hasOwn(record.values, property.id) || Object.hasOwn(constraints, 'defaultValue') || constraints.required) this.writeDatabasePropertyValue(record.id, property, value, now)
        }
      }
      this.enqueueWebhookEvent('database.record.created', `${databaseId}:csv`, { databaseId, recordIds: records.map((record) => record.id), source: 'csv', createdAt: now }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  saveDatabaseTemplate(databaseId, template) {
    const existing = this.database.prepare('SELECT database_id FROM database_templates WHERE id = ?').get(template.id)
    if (existing && existing.database_id !== databaseId) throw new Error('Template belongs to another database.')
    if (!existing) {
      const count = this.database.prepare('SELECT COUNT(*) AS count FROM database_templates WHERE database_id = ?').get(databaseId).count
      if (count >= 50) throw new Error('A database cannot contain more than 50 templates.')
    }
    const now = new Date().toISOString()
    const result = this.database.prepare(`
      INSERT INTO database_templates(id, database_id, name, values_json, content, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM databases WHERE id = ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, values_json=excluded.values_json, content=excluded.content, updated_at=excluded.updated_at
    `).run(template.id, databaseId, template.name, JSON.stringify(template.values), template.content, template.createdAt || now, now, databaseId)
    if (result.changes !== 1) throw new Error('Database does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  deleteDatabaseTemplate(databaseId, templateId) {
    const result = this.database.prepare('DELETE FROM database_templates WHERE id = ? AND database_id = ?').run(templateId, databaseId)
    if (result.changes !== 1) throw new Error('Database template does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  createDatabaseRecordFromTemplate(databaseId, templateId, recordId) {
    const template = this.database.prepare('SELECT values_json, content FROM database_templates WHERE id = ? AND database_id = ?').get(templateId, databaseId)
    if (!template) throw new Error('Database template does not exist.')
    const values = JSON.parse(template.values_json)
    const properties = this.database.prepare('SELECT id, type, config_json FROM database_properties WHERE database_id = ? ORDER BY position').all(databaseId)
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const position = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_records WHERE database_id = ?').get(databaseId).position
      this.database.prepare('INSERT INTO database_records(id, database_id, position, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(recordId, databaseId, position, template.content, now, now)
      for (const property of properties) if (!['formula', 'rollup'].includes(property.type)) {
        const constraints = JSON.parse(property.config_json || '{}').constraints || {}
        const value = Object.hasOwn(values, property.id) ? values[property.id] : constraints.defaultValue
        if (Object.hasOwn(values, property.id) || Object.hasOwn(constraints, 'defaultValue') || constraints.required) this.writeDatabasePropertyValue(recordId, property, value, now)
      }
      this.enqueueWebhookEvent('database.record.created', recordId, { record: { id: recordId, databaseId, templateId, createdAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  setActiveDatabaseView(databaseId, viewId) {
    const result = this.database.prepare(`
      UPDATE databases SET active_view_id = ?
      WHERE id = ? AND EXISTS (SELECT 1 FROM database_views WHERE id = ? AND database_id = ?)
    `).run(viewId, databaseId, viewId, databaseId)
    if (result.changes !== 1) throw new Error('Database view does not exist.')
  },

  updateDatabaseViewConfig(databaseId, viewId, config) {
    const result = this.database.prepare('UPDATE database_views SET config_json = ? WHERE id = ? AND database_id = ?')
      .run(JSON.stringify(config), viewId, databaseId)
    if (result.changes !== 1) throw new Error('Database view does not exist.')
  },

  createDatabaseView(databaseId, viewId, name, type, config) {
    const viewCount = this.database.prepare('SELECT COUNT(*) AS count FROM database_views WHERE database_id = ?').get(databaseId).count
    if (viewCount >= 50) throw new Error('A database cannot contain more than 50 views.')
    const position = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_views WHERE database_id = ?').get(databaseId).position
    const result = this.database.prepare(`
      INSERT INTO database_views(id, database_id, name, type, position, config_json)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM databases WHERE id = ?)
    `).run(viewId, databaseId, name, type, position, JSON.stringify(config), databaseId)
    if (result.changes !== 1) throw new Error('Database does not exist.')
    this.setActiveDatabaseView(databaseId, viewId)
    return this.loadDatabaseById(databaseId)
  },

  renameDatabaseView(databaseId, viewId, name) {
    const result = this.database.prepare('UPDATE database_views SET name = ? WHERE id = ? AND database_id = ?').run(name, viewId, databaseId)
    if (result.changes !== 1) throw new Error('Database view does not exist.')
    return this.loadDatabaseById(databaseId)
  },

  deleteDatabaseView(databaseId, viewId) {
    const views = this.database.prepare('SELECT id, position FROM database_views WHERE database_id = ? ORDER BY position, id').all(databaseId)
    const target = views.find((view) => view.id === viewId)
    if (!target) throw new Error('Database view does not exist.')
    if (views.length <= 1) throw new Error('The final database view cannot be deleted.')
    const fallbackId = views.find((view) => view.id !== viewId).id
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('DELETE FROM database_views WHERE id = ? AND database_id = ?').run(viewId, databaseId)
      this.database.prepare('UPDATE databases SET active_view_id = ? WHERE id = ? AND active_view_id = ?').run(fallbackId, databaseId, viewId)
      // Compact positions after deletion so the first row remains the default
      // view and later reordering never accumulates sparse position values.
      this.database.prepare('UPDATE database_views SET position = position - 1 WHERE database_id = ? AND position > ?').run(databaseId, target.position)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  },

  setDefaultDatabaseView(databaseId, viewId) {
    const views = this.database.prepare('SELECT id FROM database_views WHERE database_id = ? ORDER BY position, id').all(databaseId)
    if (!views.some((view) => view.id === viewId)) throw new Error('Database view does not exist.')
    const ordered = [viewId, ...views.map((view) => view.id).filter((id) => id !== viewId)]
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const update = this.database.prepare('UPDATE database_views SET position = ? WHERE id = ? AND database_id = ?')
      ordered.forEach((id, position) => update.run(position, id, databaseId))
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
    return this.loadDatabaseById(databaseId)
  }
}
