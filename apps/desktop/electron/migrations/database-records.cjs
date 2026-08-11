/** Applies the database authoring migrations introduced in schema 14–18. */
function migrateDatabaseRecords(database, currentVersion) {
  if (currentVersion < 14) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE database_templates (
        id TEXT PRIMARY KEY,
        database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
        values_json TEXT NOT NULL DEFAULT '{}',
        content TEXT NOT NULL DEFAULT '' CHECK(length(content) <= 2000000),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX database_templates_order ON database_templates(database_id, created_at, id);
      INSERT INTO app_meta(key, value) VALUES ('schema_version', '14')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      COMMIT;
    `)
  }

  if (currentVersion < 15) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE database_records ADD COLUMN archived_at TEXT;
      CREATE INDEX database_records_archive ON database_records(database_id, archived_at DESC);
      INSERT INTO app_meta(key, value) VALUES ('schema_version', '15')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      COMMIT;
    `)
  }

  if (currentVersion < 16) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE database_record_history (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL REFERENCES database_records(id) ON DELETE CASCADE,
        property_id TEXT REFERENCES database_properties(id) ON DELETE SET NULL,
        kind TEXT NOT NULL CHECK(kind IN ('property', 'content')),
        previous_json TEXT NOT NULL,
        next_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX database_record_history_record_time ON database_record_history(record_id, created_at DESC, id DESC);
      INSERT INTO app_meta(key, value) VALUES ('schema_version', '16')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      COMMIT;
    `)
  }

  if (currentVersion < 17) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE database_record_comments (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL REFERENCES database_records(id) ON DELETE CASCADE,
        property_id TEXT REFERENCES database_properties(id) ON DELETE SET NULL,
        author_name TEXT NOT NULL CHECK(length(author_name) BETWEEN 1 AND 100),
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX database_record_comments_thread ON database_record_comments(record_id, resolved_at, created_at DESC);
      INSERT INTO app_meta(key, value) VALUES ('schema_version', '17')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      COMMIT;
    `)
  }

  if (currentVersion < 18) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE database_record_reminders (
        id TEXT PRIMARY KEY,
        record_id TEXT NOT NULL REFERENCES database_records(id) ON DELETE CASCADE,
        property_id TEXT NOT NULL REFERENCES database_properties(id) ON DELETE CASCADE,
        due_at TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 500),
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX database_record_reminders_due ON database_record_reminders(completed_at, due_at);
      CREATE INDEX database_record_reminders_record ON database_record_reminders(record_id, completed_at, due_at);
      INSERT INTO app_meta(key, value) VALUES ('schema_version', '18')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
      COMMIT;
    `)
  }
}

module.exports = { migrateDatabaseRecords }
