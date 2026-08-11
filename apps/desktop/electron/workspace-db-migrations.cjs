const LATEST_SCHEMA_VERSION = 18
const { migrateDatabaseRecords } = require('./migrations/database-records.cjs')

module.exports = {
  migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  
    const currentVersion = Number(
      this.database.prepare("SELECT value FROM app_meta WHERE key = 'schema_version'").get()?.value ?? 0,
    )
  
    if (currentVersion < 1) {
      this.database.exec(`
        BEGIN IMMEDIATE;
  
        CREATE TABLE pages (
          id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
          title TEXT NOT NULL DEFAULT '' CHECK(length(title) <= 1000),
          icon TEXT NOT NULL DEFAULT 'note',
          parent_id TEXT REFERENCES pages(id) ON DELETE SET NULL,
          favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
          content TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL,
          last_visited_at TEXT NOT NULL,
          archived_at TEXT
        );
  
        CREATE INDEX pages_parent_index ON pages(parent_id, archived_at);
        CREATE INDEX pages_recent_index ON pages(last_visited_at DESC);
        CREATE INDEX pages_archive_index ON pages(archived_at DESC);
  
        CREATE TABLE workspace_state (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          active_page_id TEXT REFERENCES pages(id) ON DELETE SET NULL
        );
  
        CREATE VIRTUAL TABLE pages_fts USING fts5(
          title,
          content,
          content = 'pages',
          content_rowid = 'rowid',
          tokenize = 'unicode61'
        );
  
        CREATE TRIGGER pages_fts_insert AFTER INSERT ON pages BEGIN
          INSERT INTO pages_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
        END;
  
        CREATE TRIGGER pages_fts_delete AFTER DELETE ON pages BEGIN
          INSERT INTO pages_fts(pages_fts, rowid, title, content)
          VALUES ('delete', old.rowid, old.title, old.content);
        END;
  
        CREATE TRIGGER pages_fts_update AFTER UPDATE OF title, content ON pages BEGIN
          INSERT INTO pages_fts(pages_fts, rowid, title, content)
          VALUES ('delete', old.rowid, old.title, old.content);
          INSERT INTO pages_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
        END;
  
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '1')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  
        COMMIT;
      `)
    }
  
    if (currentVersion < 2) {
      this.database.exec(`
        BEGIN IMMEDIATE;
  
        CREATE TABLE databases (
          id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL UNIQUE REFERENCES pages(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          active_view_id TEXT
        );
  
        CREATE TABLE database_properties (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          position INTEGER NOT NULL,
          config_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX database_properties_order ON database_properties(database_id, position);
  
        CREATE TABLE database_records (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX database_records_order ON database_records(database_id, position);
  
        CREATE TABLE property_values (
          record_id TEXT NOT NULL REFERENCES database_records(id) ON DELETE CASCADE,
          property_id TEXT NOT NULL REFERENCES database_properties(id) ON DELETE CASCADE,
          text_value TEXT,
          number_value REAL,
          boolean_value INTEGER,
          json_value TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY(record_id, property_id)
        );
  
        CREATE TABLE database_views (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          position INTEGER NOT NULL,
          config_json TEXT NOT NULL DEFAULT '{}'
        );
        CREATE INDEX database_views_order ON database_views(database_id, position);
  
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '2')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 3) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE sync_documents (
          page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
          snapshot BLOB,
          compacted_through_id INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE sync_updates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          client_id TEXT NOT NULL,
          update_blob BLOB NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX sync_updates_page_sequence ON sync_updates(page_id, id);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '3')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 4) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE ai_patch_audit (
          id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          operation TEXT NOT NULL,
          preview TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('proposed', 'applied', 'undone', 'rejected')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX ai_patch_audit_page_time ON ai_patch_audit(page_id, created_at DESC);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '4')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 5) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE page_permissions (
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          subject_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('viewer', 'commenter', 'editor', 'owner')),
          created_at TEXT NOT NULL,
          PRIMARY KEY(page_id, subject_id)
        );
        CREATE TABLE comments (
          id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),
          anchor_json TEXT,
          resolved_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX comments_page_time ON comments(page_id, resolved_at, created_at DESC);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '5')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 6) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE comments ADD COLUMN mentions_json TEXT NOT NULL DEFAULT '[]';
        CREATE TABLE notifications (
          id TEXT PRIMARY KEY,
          recipient_id TEXT NOT NULL,
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('mention', 'comment')),
          read_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX notifications_recipient_unread ON notifications(recipient_id, read_at, created_at DESC);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '6')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 7) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE attachments (
          hash TEXT PRIMARY KEY CHECK(length(hash) = 64),
          size INTEGER NOT NULL CHECK(size >= 0),
          mime_type TEXT NOT NULL,
          relative_path TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );
        CREATE TABLE page_attachments (
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          attachment_hash TEXT NOT NULL REFERENCES attachments(hash) ON DELETE CASCADE,
          source_path TEXT NOT NULL,
          display_name TEXT NOT NULL,
          PRIMARY KEY(page_id, attachment_hash, source_path)
        );
        CREATE INDEX page_attachments_hash ON page_attachments(attachment_hash);
        CREATE TABLE import_jobs (
          id TEXT PRIMARY KEY,
          source_name TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('converting', 'committing', 'completed', 'failed', 'cancelled')),
          report_json TEXT NOT NULL DEFAULT '{}',
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX import_jobs_time ON import_jobs(created_at DESC);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '7')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 8) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE page_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          reason TEXT NOT NULL CHECK(reason IN ('autosave', 'restore')),
          created_at TEXT NOT NULL
        );
        CREATE INDEX page_versions_page_time ON page_versions(page_id, created_at DESC, id DESC);
        CREATE TABLE page_version_attachments (
          version_id INTEGER NOT NULL REFERENCES page_versions(id) ON DELETE CASCADE,
          attachment_hash TEXT NOT NULL REFERENCES attachments(hash) ON DELETE CASCADE,
          PRIMARY KEY(version_id, attachment_hash)
        );
        CREATE INDEX page_version_attachments_hash ON page_version_attachments(attachment_hash);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '8')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 9) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE search_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          chunk_index INTEGER NOT NULL,
          heading TEXT NOT NULL,
          text TEXT NOT NULL,
          embedding BLOB NOT NULL,
          UNIQUE(page_id, chunk_index)
        );
        CREATE INDEX search_chunks_page ON search_chunks(page_id, chunk_index);
        CREATE VIRTUAL TABLE search_chunks_fts USING fts5(page_id UNINDEXED, heading, text, tokenize='unicode61');
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '9')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 10) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE api_tokens (
          id TEXT PRIMARY KEY CHECK(length(id) = 36),
          name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
          token_prefix TEXT NOT NULL,
          secret_hash TEXT NOT NULL CHECK(length(secret_hash) = 64),
          scopes_json TEXT NOT NULL,
          expires_at TEXT,
          revoked_at TEXT,
          last_used_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX api_tokens_active ON api_tokens(revoked_at, expires_at);
        CREATE TABLE api_audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          request_id TEXT NOT NULL,
          token_id TEXT REFERENCES api_tokens(id) ON DELETE SET NULL,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          status INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX api_audit_time ON api_audit_log(created_at DESC, id DESC);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '10')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 11) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE webhook_endpoints (
          id TEXT PRIMARY KEY CHECK(length(id) = 36),
          name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
          url TEXT NOT NULL CHECK(length(url) <= 2048),
          secret_ciphertext BLOB NOT NULL,
          events_json TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE webhook_outbox (
          id TEXT PRIMARY KEY CHECK(length(id) = 36),
          endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
          event TEXT NOT NULL,
          resource_key TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK(length(payload_json) <= 262144),
          status TEXT NOT NULL CHECK(status IN ('pending', 'leased', 'delivered', 'dead')),
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT NOT NULL,
          lease_owner TEXT,
          lease_until TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          delivered_at TEXT
        );
        CREATE INDEX webhook_outbox_due ON webhook_outbox(status, next_attempt_at, lease_until);
        CREATE INDEX webhook_outbox_endpoint ON webhook_outbox(endpoint_id, created_at DESC);
        CREATE TABLE webhook_delivery_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          delivery_id TEXT NOT NULL REFERENCES webhook_outbox(id) ON DELETE CASCADE,
          attempt_number INTEGER NOT NULL,
          status_code INTEGER,
          duration_ms INTEGER NOT NULL,
          response_preview TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX webhook_attempts_delivery ON webhook_delivery_attempts(delivery_id, attempt_number DESC);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '11')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 12) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE database_automations (
          id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
          database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
          trigger_property_id TEXT NOT NULL,
          condition_json TEXT,
          actions_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX database_automations_trigger ON database_automations(database_id, enabled, trigger_property_id);
        CREATE TABLE automation_runs (
          id TEXT PRIMARY KEY CHECK(length(id) = 36),
          automation_id TEXT REFERENCES database_automations(id) ON DELETE SET NULL,
          automation_name TEXT NOT NULL,
          database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
          record_id TEXT NOT NULL,
          trigger_property_id TEXT NOT NULL,
          rule_json TEXT NOT NULL,
          input_json TEXT NOT NULL,
          output_json TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
          error_message TEXT,
          replay_of TEXT REFERENCES automation_runs(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          completed_at TEXT NOT NULL
        );
        CREATE INDEX automation_runs_database_time ON automation_runs(database_id, created_at DESC);
        CREATE INDEX automation_runs_status ON automation_runs(status, created_at DESC);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '12')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    if (currentVersion < 13) {
      this.database.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE database_records ADD COLUMN content TEXT NOT NULL DEFAULT '' CHECK(length(content) <= 2000000);
        INSERT INTO app_meta(key, value) VALUES ('schema_version', '13')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        COMMIT;
      `)
    }
  
    migrateDatabaseRecords(this.database, currentVersion)
  
    if (currentVersion > LATEST_SCHEMA_VERSION) {
      throw new Error(`Workspace schema ${currentVersion} is newer than this app supports.`)
    }
  }
}
