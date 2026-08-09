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
})
