/** 数据库记录领域的只读快照查询。写入语句会在后续批次迁入同一目录。 */
module.exports = Object.freeze({
  databaseByPage: 'SELECT id, name, active_view_id FROM databases WHERE page_id = ?',
  propertiesByDatabase: 'SELECT id, name, type, config_json FROM database_properties WHERE database_id = ? ORDER BY position',
  activeRecordsByDatabase: 'SELECT id, content, created_at, updated_at FROM database_records WHERE database_id = ? AND archived_at IS NULL ORDER BY position',
  valuesByRecord: `
    SELECT property_id, text_value, number_value, boolean_value, json_value
    FROM property_values WHERE record_id = ?
  `,
  viewsByDatabase: 'SELECT id, name, type, config_json FROM database_views WHERE database_id = ? ORDER BY position',
  templatesByDatabase: 'SELECT id, name, values_json, content, created_at, updated_at FROM database_templates WHERE database_id = ? ORDER BY created_at, id',
  pageByDatabase: 'SELECT page_id FROM databases WHERE id = ?',
  activePageExists: 'SELECT 1 FROM pages WHERE id = ? AND archived_at IS NULL',
  insertDatabase: 'INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)',
  insertProperty: 'INSERT INTO database_properties(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)',
  insertView: 'INSERT INTO database_views(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)',
  firstRelationProperty: "SELECT id, config_json FROM database_properties WHERE database_id = ? AND type = 'relation' ORDER BY position LIMIT 1",
  firstWritableProperty: "SELECT id FROM database_properties WHERE database_id = ? AND type NOT IN ('formula', 'rollup') ORDER BY position LIMIT 1",
  nextPropertyPosition: 'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_properties WHERE database_id = ?',
  insertPropertyForDatabase: 'INSERT INTO database_properties(id, database_id, name, type, position, config_json) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM databases WHERE id = ?)',
  databaseSources: `SELECT database.id, database.page_id AS pageId, database.name, page.title AS pageTitle,
      (SELECT COUNT(*) FROM database_records record WHERE record.database_id = database.id) AS recordCount
    FROM databases database JOIN pages page ON page.id = database.page_id
    WHERE page.archived_at IS NULL ORDER BY page.last_visited_at DESC, database.name, database.id`,
  propertyConfig: 'SELECT type, config_json FROM database_properties WHERE id = ? AND database_id = ?',
  databaseExists: 'SELECT 1 FROM databases WHERE id = ?',
  reciprocalPropertyConfig: "SELECT config_json FROM database_properties WHERE id = ? AND database_id = ? AND type = 'relation'",
  rollupTargetProperty: "SELECT type FROM database_properties WHERE id = ? AND database_id = ? AND type NOT IN ('formula', 'rollup')",
  updatePropertyConfig: 'UPDATE database_properties SET config_json = ? WHERE id = ? AND database_id = ?',
  renameProperty: 'UPDATE database_properties SET name = ? WHERE id = ? AND database_id = ?',
  renameDatabase: 'UPDATE databases SET name = ? WHERE id = ?',
  propertyOrder: 'SELECT id FROM database_properties WHERE database_id = ? ORDER BY position',
  reorderProperty: 'UPDATE database_properties SET position = ? WHERE id = ? AND database_id = ?',
  propertyForDelete: 'SELECT name, type FROM database_properties WHERE id = ? AND database_id = ?',
  allProperties: 'SELECT id, name, type, database_id AS databaseId, config_json AS configJson FROM database_properties',
  updatePropertyConfigById: 'UPDATE database_properties SET config_json = ? WHERE id = ?',
  deleteProperty: 'DELETE FROM database_properties WHERE id = ? AND database_id = ?',
})
