/** 数据库记录领域的只读快照查询。写入语句会在后续批次迁入同一目录。 */
module.exports = Object.freeze({
  databaseByPage: 'SELECT id, name, active_view_id FROM databases WHERE page_id = ?',
  propertiesByDatabase:
    'SELECT id, name, type, config_json FROM database_properties WHERE database_id = ? ORDER BY position',
  activeRecordsByDatabase:
    'SELECT id, content, created_at, updated_at FROM database_records WHERE database_id = ? AND archived_at IS NULL ORDER BY position',
  valuesByRecord: `
    SELECT property_id, text_value, number_value, boolean_value, json_value
    FROM property_values WHERE record_id = ?
  `,
  viewsByDatabase:
    'SELECT id, name, type, config_json FROM database_views WHERE database_id = ? ORDER BY position',
  templatesByDatabase:
    'SELECT id, name, values_json, content, created_at, updated_at FROM database_templates WHERE database_id = ? ORDER BY created_at, id',
  pageByDatabase: 'SELECT page_id FROM databases WHERE id = ?',
  activePageExists: 'SELECT 1 FROM pages WHERE id = ? AND archived_at IS NULL',
  insertDatabase: 'INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)',
  insertProperty:
    'INSERT INTO database_properties(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)',
  insertView:
    'INSERT INTO database_views(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)',
  firstRelationProperty:
    "SELECT id, config_json FROM database_properties WHERE database_id = ? AND type = 'relation' ORDER BY position LIMIT 1",
  firstWritableProperty:
    "SELECT id FROM database_properties WHERE database_id = ? AND type NOT IN ('formula', 'rollup') ORDER BY position LIMIT 1",
  nextPropertyPosition:
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_properties WHERE database_id = ?',
  insertPropertyForDatabase:
    'INSERT INTO database_properties(id, database_id, name, type, position, config_json) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM databases WHERE id = ?)',
  databaseSources: `SELECT database.id, database.page_id AS pageId, database.name, page.title AS pageTitle,
      (SELECT COUNT(*) FROM database_records record
        WHERE record.database_id = database.id AND record.archived_at IS NULL) AS recordCount
    FROM databases database JOIN pages page ON page.id = database.page_id
    WHERE page.archived_at IS NULL ORDER BY page.last_visited_at DESC, database.name, database.id`,
  authorizedDatabaseSources: `SELECT database.id, database.page_id AS pageId, database.name, page.title AS pageTitle,
      (SELECT COUNT(*) FROM database_records record
        WHERE record.database_id = database.id AND record.archived_at IS NULL) AS recordCount
    FROM databases database JOIN pages page ON page.id = database.page_id
    WHERE page.archived_at IS NULL AND (
      NOT EXISTS (SELECT 1 FROM page_permissions permission WHERE permission.page_id = page.id) OR
      EXISTS (SELECT 1 FROM page_permissions mine WHERE mine.page_id = page.id AND mine.subject_id = ?)
    ) ORDER BY page.last_visited_at DESC, database.name, database.id`,
  accessPageByDatabase: 'SELECT page_id AS pageId FROM databases WHERE id = ?',
  accessPageByRecord: `SELECT database.page_id AS pageId FROM database_records record
    JOIN databases database ON database.id = record.database_id WHERE record.id = ?`,
  accessPageByHistory: `SELECT database.page_id AS pageId FROM database_record_history history
    JOIN database_records record ON record.id = history.record_id
    JOIN databases database ON database.id = record.database_id WHERE history.id = ?`,
  accessPropertyByHistory: `SELECT property.type, property.config_json FROM database_record_history history
    LEFT JOIN database_properties property ON property.id = history.property_id WHERE history.id = ?`,
  accessPageByComment: `SELECT database.page_id AS pageId FROM database_record_comments comment
    JOIN database_records record ON record.id = comment.record_id
    JOIN databases database ON database.id = record.database_id WHERE comment.id = ?`,
  accessPageByReminder: `SELECT database.page_id AS pageId FROM database_record_reminders reminder
    JOIN database_records record ON record.id = reminder.record_id
    JOIN databases database ON database.id = record.database_id WHERE reminder.id = ?`,
  propertyConfig:
    'SELECT type, config_json FROM database_properties WHERE id = ? AND database_id = ?',
  databaseExists: 'SELECT 1 FROM databases WHERE id = ?',
  reciprocalPropertyConfig:
    "SELECT type, config_json FROM database_properties WHERE id = ? AND database_id = ? AND type = 'relation'",
  rollupTargetProperty:
    "SELECT type FROM database_properties WHERE id = ? AND database_id = ? AND type NOT IN ('formula', 'rollup')",
  updatePropertyConfig:
    'UPDATE database_properties SET config_json = ? WHERE id = ? AND database_id = ?',
  renameProperty: 'UPDATE database_properties SET name = ? WHERE id = ? AND database_id = ?',
  renameDatabase: 'UPDATE databases SET name = ? WHERE id = ?',
  propertyOrder: 'SELECT id FROM database_properties WHERE database_id = ? ORDER BY position',
  reorderProperty: 'UPDATE database_properties SET position = ? WHERE id = ? AND database_id = ?',
  propertyForDelete: 'SELECT name, type FROM database_properties WHERE id = ? AND database_id = ?',
  allProperties:
    'SELECT id, name, type, database_id AS databaseId, config_json AS configJson FROM database_properties',
  updatePropertyConfigById: 'UPDATE database_properties SET config_json = ? WHERE id = ?',
  deleteProperty: 'DELETE FROM database_properties WHERE id = ? AND database_id = ?',
  cellProperty: `SELECT property.type, property.config_json, property.database_id AS databaseId
    FROM database_properties property
    JOIN database_records record ON record.id = ? AND record.database_id = property.database_id
    WHERE property.id = ?`,
  reciprocalRelationProperty:
    "SELECT id, type, config_json, database_id AS databaseId FROM database_properties WHERE id = ? AND database_id = ? AND type = 'relation'",
  touchRecord: 'UPDATE database_records SET updated_at = ? WHERE id = ?',
  recordExists: 'SELECT 1 FROM database_records WHERE id = ? AND database_id = ?',
  duplicatePropertyValue: `SELECT 1 FROM property_values value
    JOIN database_records record ON record.id = value.record_id
    WHERE value.property_id = ? AND value.record_id <> ? AND record.archived_at IS NULL
      AND value.text_value IS ? AND value.number_value IS ? AND value.boolean_value IS ? AND value.json_value IS ? LIMIT 1`,
  upsertPropertyValue: `INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(record_id, property_id) DO UPDATE SET text_value=excluded.text_value, number_value=excluded.number_value,
      boolean_value=excluded.boolean_value, json_value=excluded.json_value, updated_at=excluded.updated_at`,
  propertyValue:
    'SELECT text_value, number_value, boolean_value, json_value FROM property_values WHERE record_id = ? AND property_id = ?',
  insertRecordHistory:
    'INSERT INTO database_record_history(id, record_id, property_id, kind, previous_json, next_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  trimRecordHistory: `DELETE FROM database_record_history WHERE record_id = ? AND id NOT IN (
    SELECT id FROM database_record_history WHERE record_id = ? ORDER BY created_at DESC, id DESC LIMIT 200
  )`,
  recordHistory: `SELECT id, recordId, propertyId, kind, previousJson, nextJson, createdAt, propertyName
    FROM (
      SELECT history.id, history.record_id AS recordId, history.property_id AS propertyId, history.kind,
        history.previous_json AS previousJson, history.next_json AS nextJson, history.created_at AS createdAt,
        COALESCE(property.name, '正文') AS propertyName,
        ROW_NUMBER() OVER (ORDER BY history.created_at DESC, history.id DESC) AS rowNumber,
        SUM(LENGTH(CAST(history.previous_json AS BLOB)) + LENGTH(CAST(history.next_json AS BLOB)))
          OVER (ORDER BY history.created_at DESC, history.id DESC ROWS UNBOUNDED PRECEDING) AS payloadBytes
      FROM database_record_history history
      LEFT JOIN database_properties property ON property.id = history.property_id
      WHERE history.record_id = ?
    ) bounded
    WHERE payloadBytes <= ? OR rowNumber = 1
    ORDER BY createdAt DESC, id DESC LIMIT ?`,
  recordHistoryById:
    'SELECT record_id, property_id, kind, previous_json FROM database_record_history WHERE id = ?',
  recordDatabaseId: 'SELECT database_id FROM database_records WHERE id = ?',
  recordComments: `SELECT comment.id, comment.record_id AS recordId, comment.property_id AS propertyId,
      COALESCE(property.name, '整条记录') AS propertyName, comment.author_name AS authorName,
      comment.body, comment.resolved_at AS resolvedAt, comment.created_at AS createdAt
    FROM database_record_comments comment LEFT JOIN database_properties property ON property.id = comment.property_id
    WHERE comment.record_id = ? AND (? = 0 OR comment.resolved_at IS NULL)
    ORDER BY comment.resolved_at IS NOT NULL, comment.created_at DESC, comment.id DESC LIMIT 500`,
  activeRecordDatabase:
    'SELECT database_id FROM database_records WHERE id = ? AND archived_at IS NULL',
  propertyExists: 'SELECT 1 FROM database_properties WHERE id = ? AND database_id = ?',
  commentCount: 'SELECT COUNT(*) AS count FROM database_record_comments WHERE record_id = ?',
  insertRecordComment:
    'INSERT INTO database_record_comments(id, record_id, property_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  resolveRecordComment: 'UPDATE database_record_comments SET resolved_at = ? WHERE id = ?',
  deleteRecordComment: 'DELETE FROM database_record_comments WHERE id = ?',
  recordReminders: `SELECT reminder.id, reminder.record_id AS recordId, reminder.property_id AS propertyId, property.name AS propertyName,
      reminder.due_at AS dueAt, reminder.note, reminder.completed_at AS completedAt,
      reminder.created_at AS createdAt, reminder.updated_at AS updatedAt
    FROM database_record_reminders reminder JOIN database_properties property ON property.id = reminder.property_id
    WHERE reminder.record_id = ?
    ORDER BY reminder.completed_at IS NOT NULL, reminder.due_at, reminder.id LIMIT 500`,
  dueRecordReminders: `SELECT reminder.id, reminder.record_id AS recordId, reminder.property_id AS propertyId, property.name AS propertyName,
      reminder.due_at AS dueAt, reminder.note, reminder.completed_at AS completedAt,
      reminder.created_at AS createdAt, reminder.updated_at AS updatedAt
    FROM database_record_reminders reminder JOIN database_properties property ON property.id = reminder.property_id
    JOIN database_records record ON record.id = reminder.record_id
    WHERE reminder.completed_at IS NULL AND reminder.due_at <= ? AND record.archived_at IS NULL
    ORDER BY reminder.due_at, reminder.id LIMIT ?`,
  authorizedDueRecordReminders: `SELECT reminder.id, reminder.record_id AS recordId, reminder.property_id AS propertyId,
      property.name AS propertyName, reminder.due_at AS dueAt, reminder.note,
      reminder.completed_at AS completedAt, reminder.created_at AS createdAt,
      reminder.updated_at AS updatedAt
    FROM database_record_reminders reminder
    JOIN database_properties property ON property.id = reminder.property_id
    JOIN database_records record ON record.id = reminder.record_id
    JOIN databases database ON database.id = record.database_id
    WHERE reminder.completed_at IS NULL AND reminder.due_at <= ? AND record.archived_at IS NULL AND (
      NOT EXISTS (SELECT 1 FROM page_permissions permission WHERE permission.page_id = database.page_id) OR
      EXISTS (SELECT 1 FROM page_permissions mine WHERE mine.page_id = database.page_id AND mine.subject_id = ?)
    ) ORDER BY reminder.due_at, reminder.id LIMIT ?`,
  reminderDateProperty: `SELECT property.type FROM database_properties property
    JOIN database_records record ON record.id = ? AND record.database_id = property.database_id
    WHERE property.id = ?`,
  reminderOwner: 'SELECT record_id AS recordId FROM database_record_reminders WHERE id = ?',
  reminderCount: 'SELECT COUNT(*) AS count FROM database_record_reminders WHERE record_id = ?',
  upsertRecordReminder: `INSERT INTO database_record_reminders(id, record_id, property_id, due_at, note, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(id) DO UPDATE SET property_id=excluded.property_id,
    due_at=excluded.due_at, note=excluded.note, completed_at=NULL, updated_at=excluded.updated_at`,
  completeRecordReminder:
    'UPDATE database_record_reminders SET completed_at = ?, updated_at = ? WHERE id = ?',
  deleteRecordReminder: 'DELETE FROM database_record_reminders WHERE id = ?',
  nextRecordPosition:
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_records WHERE database_id = ?',
  activeRecordCount: `SELECT COUNT(record.id) AS count FROM databases database
    LEFT JOIN database_records record ON record.database_id = database.id AND record.archived_at IS NULL
    WHERE database.id = ? GROUP BY database.id`,
  totalRecordCount: `SELECT COUNT(record.id) AS count FROM databases database
    LEFT JOIN database_records record ON record.database_id = database.id
    WHERE database.id = ? GROUP BY database.id`,
  insertRecord:
    'INSERT INTO database_records(id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  writableProperties:
    "SELECT id, type, config_json FROM database_properties WHERE database_id = ? AND type NOT IN ('formula', 'rollup') ORDER BY position",
  activeRecordContent:
    'SELECT content FROM database_records WHERE id = ? AND database_id = ? AND archived_at IS NULL',
  insertRecordWithContent:
    'INSERT INTO database_records(id, database_id, position, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  copyDerivedValues: `INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
    SELECT ?, value.property_id, value.text_value, value.number_value, value.boolean_value, value.json_value, ?
    FROM property_values value JOIN database_properties property ON property.id = value.property_id
    WHERE value.record_id = ? AND property.type IN ('formula', 'rollup')`,
  trashRecord:
    'UPDATE database_records SET archived_at = ?, updated_at = ? WHERE id = ? AND database_id = ? AND archived_at IS NULL',
  trashedRecords: `SELECT records.id, COALESCE(title_value.text_value, '无标题') AS title, records.archived_at AS trashedAt
    FROM database_records records
    LEFT JOIN database_properties title ON title.database_id = records.database_id AND title.type = 'title'
    LEFT JOIN property_values title_value ON title_value.record_id = records.id AND title_value.property_id = title.id
    WHERE records.database_id = ? AND records.archived_at IS NOT NULL
    ORDER BY records.archived_at DESC, records.id DESC LIMIT ?`,
  restoreRecord:
    'UPDATE database_records SET archived_at = NULL, updated_at = ? WHERE id = ? AND database_id = ? AND archived_at IS NOT NULL',
  constrainedRecordValues: `SELECT property.id, property.type, property.config_json, value.text_value, value.number_value, value.boolean_value, value.json_value
    FROM database_properties property LEFT JOIN property_values value ON value.property_id = property.id AND value.record_id = ?
    WHERE property.database_id = ? AND json_extract(property.config_json, '$.constraints') IS NOT NULL`,
  deleteTrashedRecord:
    'DELETE FROM database_records WHERE id = ? AND database_id = ? AND archived_at IS NOT NULL',
  recordContent: 'SELECT content FROM database_records WHERE id = ?',
  updateRecordContent: 'UPDATE database_records SET content = ?, updated_at = ? WHERE id = ?',
  propertyInDatabase:
    'SELECT id, type, config_json FROM database_properties WHERE id = ? AND database_id = ?',
  recordInDatabase: 'SELECT 1 FROM database_records WHERE id = ? AND database_id = ?',
  databaseProperties:
    'SELECT id, type, config_json FROM database_properties WHERE database_id = ? ORDER BY position',
  templateDatabase: 'SELECT database_id FROM database_templates WHERE id = ?',
  templateCount: 'SELECT COUNT(*) AS count FROM database_templates WHERE database_id = ?',
  upsertTemplate: `INSERT INTO database_templates(id, database_id, name, values_json, content, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM databases WHERE id = ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, values_json=excluded.values_json,
      content=excluded.content, updated_at=excluded.updated_at`,
  deleteTemplate: 'DELETE FROM database_templates WHERE id = ? AND database_id = ?',
  templateById:
    'SELECT values_json, content FROM database_templates WHERE id = ? AND database_id = ?',
  activateView: `UPDATE databases SET active_view_id = ?
    WHERE id = ? AND EXISTS (SELECT 1 FROM database_views WHERE id = ? AND database_id = ?)`,
  updateViewConfig: 'UPDATE database_views SET config_json = ? WHERE id = ? AND database_id = ?',
  viewCount: 'SELECT COUNT(*) AS count FROM database_views WHERE database_id = ?',
  nextViewPosition:
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_views WHERE database_id = ?',
  insertViewIfDatabaseExists: `INSERT INTO database_views(id, database_id, name, type, position, config_json)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM databases WHERE id = ?)`,
  renameView: 'UPDATE database_views SET name = ? WHERE id = ? AND database_id = ?',
  orderedViews:
    'SELECT id, position FROM database_views WHERE database_id = ? ORDER BY position, id',
  deleteView: 'DELETE FROM database_views WHERE id = ? AND database_id = ?',
  replaceActiveView: 'UPDATE databases SET active_view_id = ? WHERE id = ? AND active_view_id = ?',
  compactViewPositions:
    'UPDATE database_views SET position = position - 1 WHERE database_id = ? AND position > ?',
  viewIds: 'SELECT id FROM database_views WHERE database_id = ? ORDER BY position, id',
  reorderView: 'UPDATE database_views SET position = ? WHERE id = ? AND database_id = ?',
})
