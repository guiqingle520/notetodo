/** SQL used only to seed a newly-created or upgraded local workspace. */
module.exports = Object.freeze({
  pageCount: 'SELECT COUNT(*) AS count FROM pages',
  insertPage: `INSERT INTO pages (
    id, title, icon, parent_id, favorite, content, updated_at, last_visited_at, archived_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  insertWorkspaceState: 'INSERT INTO workspace_state(singleton, active_page_id) VALUES (1, ?)',
  databaseCount: 'SELECT COUNT(*) AS count FROM databases',
  insertDatabase: 'INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)',
  insertProperty: `INSERT INTO database_properties
    (id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)`,
  insertRecord: `INSERT INTO database_records
    (id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  insertValue: `INSERT INTO property_values
    (record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  insertView: `INSERT INTO database_views
    (id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)`,
  roadmapDatabase: 'SELECT id FROM databases WHERE id = ?',
  insertAdvancedProperty: `INSERT OR IGNORE INTO database_properties
    (id, database_id, name, type, position, config_json) VALUES (?, 'roadmap-db', ?, ?, ?, ?)`,
  insertRelationValue: `INSERT OR IGNORE INTO property_values
    (record_id, property_id, json_value, updated_at) VALUES (?, 'task-dependencies', ?, ?)`,
  insertStartDateValue: `INSERT OR IGNORE INTO property_values
    (record_id, property_id, text_value, updated_at) VALUES (?, 'task-start', ?, ?)`,
  insertCalendarView: `INSERT OR IGNORE INTO database_views
    (id, database_id, name, type, position, config_json)
    VALUES ('roadmap-calendar', 'roadmap-db', '交付日历', 'calendar', 3, ?)`,
  insertTimelineView: `INSERT OR IGNORE INTO database_views
    (id, database_id, name, type, position, config_json)
    VALUES ('roadmap-timeline', 'roadmap-db', '项目时间轴', 'timeline', 4, ?)`,
  insertGalleryView: `INSERT OR IGNORE INTO database_views
    (id, database_id, name, type, position, config_json)
    VALUES ('roadmap-gallery', 'roadmap-db', '项目画廊', 'gallery', 5, ?)`,
  insertDefaultAutomation: `INSERT OR IGNORE INTO database_automations
    (id, database_id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at)
    VALUES ('completed-task-priority', 'roadmap-db', '完成后归档优先级', 1, 'task-status', ?, ?, ?, ?)`,
})
