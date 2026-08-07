const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const seedWorkspace = require('../shared/seed-workspace.json')
const { chunkPage, cosineSimilarity, embedText, fuseRankings } = require('./retrieval-core.cjs')
const { createApiToken, verifyApiToken } = require('@notetodo/auth-core')
const { planAutomationRuns, validateAutomationRule } = require('@notetodo/automation-core')
const { WEBHOOK_EVENTS, createWebhookEnvelope, nextWebhookAttempt, stableJson, validateWebhookUrl } = require('@notetodo/webhook-core')

const LATEST_SCHEMA_VERSION = 12

/**
 * SQLite is owned by the Electron main process. Keeping SQL out of the renderer
 * prevents a compromised document view from reading arbitrary workspace data
 * and gives sync/import code one transactional source of truth.
 */
class WorkspaceDatabase {
  constructor(databasePath) {
    this.database = new DatabaseSync(databasePath)
    this.configure()
    this.migrate()
    this.recoverInterruptedImports()
    this.seedIfEmpty()
    this.seedDatabaseIfEmpty()
    this.ensureAdvancedDatabaseSeed()
    this.backfillRetrievalIndex()
    this.prepareStatements()
  }

  configure() {
    // WAL lets reads continue while the debounced editor writer commits a page.
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `)
  }

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

    if (currentVersion > LATEST_SCHEMA_VERSION) {
      throw new Error(`Workspace schema ${currentVersion} is newer than this app supports.`)
    }
  }

  seedIfEmpty() {
    const count = this.database.prepare('SELECT COUNT(*) AS count FROM pages').get().count
    if (count > 0) return

    const insert = this.database.prepare(`
      INSERT INTO pages (
        id, title, icon, parent_id, favorite, content,
        updated_at, last_visited_at, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // A single transaction avoids exposing a half-created starter workspace.
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const page of seedWorkspace.pages) {
        insert.run(
          page.id,
          page.title,
          page.icon,
          page.parentId,
          page.favorite ? 1 : 0,
          page.content,
          page.updatedAt,
          page.lastVisitedAt,
          page.archivedAt,
        )
      }
      this.database
        .prepare('INSERT INTO workspace_state(singleton, active_page_id) VALUES (1, ?)')
        .run(seedWorkspace.activePageId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  seedDatabaseIfEmpty() {
    const count = this.database.prepare('SELECT COUNT(*) AS count FROM databases').get().count
    if (count > 0) return

    const now = new Date().toISOString()
    const properties = [
      ['task-title', '任务', 'title', 0, '{}'],
      ['task-status', '状态', 'select', 1, JSON.stringify({ options: [
        { id: 'todo', name: '待开始', color: 'slate' },
        { id: 'doing', name: '进行中', color: 'amber' },
        { id: 'done', name: '已完成', color: 'green' },
      ] })],
      ['task-owner', '负责人', 'text', 2, '{}'],
      ['task-due', '截止日期', 'date', 3, '{}'],
      ['task-score', '优先级', 'number', 4, '{}'],
      ['task-dependencies', '依赖任务', 'relation', 5, JSON.stringify({ relation: { databaseId: 'roadmap-db' } })],
      ['task-dependency-score', '依赖总优先级', 'rollup', 6, JSON.stringify({ rollup: { relationPropertyId: 'task-dependencies', targetPropertyId: 'task-score', aggregation: 'sum' } })],
      ['task-risk', '风险标签', 'formula', 7, JSON.stringify({ formula: { expression: 'if([task-dependency-score] >= 3, "需关注", "正常")' } })],
      ['task-start', '开始日期', 'date', 8, '{}'],
    ]
    const records = [
      ['task-1', 0, ['编辑器交互收尾', 'doing', 'Lin', '2026-08-08', 3, ['task-2'], null, null, '2026-08-03']],
      ['task-2', 1, ['SQLite 数据迁移', 'done', 'Ming', '2026-08-06', 2, [], null, null, '2026-07-29']],
      ['task-3', 2, ['数据库 Table View', 'doing', 'Lin', '2026-08-10', 3, ['task-1', 'task-2'], null, null, '2026-08-05']],
      ['task-4', 3, ['模型网关设置页', 'todo', 'Kai', '2026-08-12', 2, ['task-2'], null, null, '2026-08-07']],
      ['task-5', 4, ['桌面安装包签名', 'todo', 'Ming', '2026-08-16', 1, ['task-3', 'task-4'], null, null, '2026-08-10']],
    ]

    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)')
        .run('roadmap-db', 'projects', '产品路线', 'roadmap-table')
      const insertProperty = this.database.prepare('INSERT INTO database_properties(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
      for (const property of properties) insertProperty.run(property[0], 'roadmap-db', property[1], property[2], property[3], property[4])

      const insertRecord = this.database.prepare('INSERT INTO database_records(id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      const insertValue = this.database.prepare('INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const [recordId, position, values] of records) {
        insertRecord.run(recordId, 'roadmap-db', position, now, now)
        properties.forEach((property, index) => {
          const value = values[index]
          insertValue.run(recordId, property[0], typeof value === 'string' ? value : null, typeof value === 'number' ? value : null, null, Array.isArray(value) ? JSON.stringify(value) : null, now)
        })
      }

      const insertView = this.database.prepare('INSERT INTO database_views(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
      insertView.run('roadmap-table', 'roadmap-db', '所有任务', 'table', 0, '{}')
      insertView.run('roadmap-board', 'roadmap-db', '状态看板', 'board', 1, JSON.stringify({ groupByPropertyId: 'task-status' }))
      insertView.run('roadmap-list', 'roadmap-db', '紧凑列表', 'list', 2, '{}')
      insertView.run('roadmap-calendar', 'roadmap-db', '交付日历', 'calendar', 3, JSON.stringify({ datePropertyId: 'task-due' }))
      insertView.run('roadmap-timeline', 'roadmap-db', '项目时间轴', 'timeline', 4, JSON.stringify({ startDatePropertyId: 'task-start', endDatePropertyId: 'task-due' }))
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Data-only backfill for workspaces created before relation/rollup/formula
   * support. INSERT OR IGNORE makes this safe to run on every application boot
   * without overwriting user-edited values or property configuration.
   */
  ensureAdvancedDatabaseSeed() {
    const roadmap = this.database.prepare('SELECT id FROM databases WHERE id = ?').get('roadmap-db')
    if (!roadmap) return

    const properties = [
      ['task-dependencies', '依赖任务', 'relation', 5, JSON.stringify({ relation: { databaseId: 'roadmap-db' } })],
      ['task-dependency-score', '依赖总优先级', 'rollup', 6, JSON.stringify({ rollup: { relationPropertyId: 'task-dependencies', targetPropertyId: 'task-score', aggregation: 'sum' } })],
      ['task-risk', '风险标签', 'formula', 7, JSON.stringify({ formula: { expression: 'if([task-dependency-score] >= 3, "需关注", "正常")' } })],
      ['task-start', '开始日期', 'date', 8, '{}'],
    ]
    const insertProperty = this.database.prepare(`
      INSERT OR IGNORE INTO database_properties(id, database_id, name, type, position, config_json)
      VALUES (?, 'roadmap-db', ?, ?, ?, ?)
    `)
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const property of properties) insertProperty.run(...property)
      const relationProperty = this.database.prepare(`
        INSERT OR IGNORE INTO property_values(record_id, property_id, json_value, updated_at)
        VALUES (?, 'task-dependencies', ?, ?)
      `)
      const now = new Date().toISOString()
      for (const [recordId, relatedIds] of [
        ['task-1', ['task-2']], ['task-2', []], ['task-3', ['task-1', 'task-2']],
        ['task-4', ['task-2']], ['task-5', ['task-3', 'task-4']],
      ]) relationProperty.run(recordId, JSON.stringify(relatedIds), now)
      const startDateProperty = this.database.prepare(`
        INSERT OR IGNORE INTO property_values(record_id, property_id, text_value, updated_at)
        VALUES (?, 'task-start', ?, ?)
      `)
      for (const [recordId, startDate] of [
        ['task-1', '2026-08-03'], ['task-2', '2026-07-29'], ['task-3', '2026-08-05'],
        ['task-4', '2026-08-07'], ['task-5', '2026-08-10'],
      ]) startDateProperty.run(recordId, startDate, now)
      // Data-only view backfill: the existing table already persists arbitrary
      // view types and JSON configuration, so no structural migration is needed.
      this.database.prepare(`
        INSERT OR IGNORE INTO database_views(id, database_id, name, type, position, config_json)
        VALUES ('roadmap-calendar', 'roadmap-db', '交付日历', 'calendar', 3, ?)
      `).run(JSON.stringify({ datePropertyId: 'task-due' }))
      this.database.prepare(`
        INSERT OR IGNORE INTO database_views(id, database_id, name, type, position, config_json)
        VALUES ('roadmap-timeline', 'roadmap-db', '项目时间轴', 'timeline', 4, ?)
      `).run(JSON.stringify({ startDatePropertyId: 'task-start', endDatePropertyId: 'task-due' }))
      this.database.prepare(`
        INSERT OR IGNORE INTO database_automations(id, database_id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at)
        VALUES ('completed-task-priority', 'roadmap-db', '完成后归档优先级', 1, 'task-status', ?, ?, ?, ?)
      `).run(JSON.stringify({ propertyId: 'task-status', operator: 'equals', value: 'done' }), JSON.stringify([{ type: 'setProperty', propertyId: 'task-score', value: 1 }]), now, now)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  prepareStatements() {
    this.statements = {
      listPages: this.database.prepare(`
        SELECT id, title, icon, parent_id, favorite, content,
               updated_at, last_visited_at, archived_at
        FROM pages
        ORDER BY last_visited_at DESC
      `),
      activePage: this.database.prepare(
        'SELECT active_page_id FROM workspace_state WHERE singleton = 1',
      ),
      upsertPage: this.database.prepare(`
        INSERT INTO pages (
          id, title, icon, parent_id, favorite, content,
          updated_at, last_visited_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          icon = excluded.icon,
          parent_id = excluded.parent_id,
          favorite = excluded.favorite,
          content = excluded.content,
          updated_at = excluded.updated_at,
          last_visited_at = excluded.last_visited_at,
          archived_at = excluded.archived_at
      `),
      setActivePage: this.database.prepare(`
        INSERT INTO workspace_state(singleton, active_page_id) VALUES (1, ?)
        ON CONFLICT(singleton) DO UPDATE SET active_page_id = excluded.active_page_id
      `),
      markVisited: this.database.prepare('UPDATE pages SET last_visited_at = ? WHERE id = ?'),
      archivePage: this.database.prepare('UPDATE pages SET archived_at = ?, updated_at = ? WHERE id = ?'),
      restorePage: this.database.prepare('UPDATE pages SET archived_at = NULL, updated_at = ? WHERE id = ?'),
      searchPages: this.database.prepare(`
        SELECT p.id, p.title, p.icon, p.parent_id, p.favorite, p.content,
               p.updated_at, p.last_visited_at, p.archived_at,
               bm25(pages_fts, 8.0, 1.0) AS rank
        FROM pages_fts
        JOIN pages p ON p.rowid = pages_fts.rowid
        WHERE pages_fts MATCH ? AND p.archived_at IS NULL
        ORDER BY rank, p.last_visited_at DESC
        LIMIT ?
      `),
      recentPages: this.database.prepare(`
        SELECT id, title, icon, parent_id, favorite, content,
               updated_at, last_visited_at, archived_at
        FROM pages
        WHERE archived_at IS NULL
        ORDER BY last_visited_at DESC
        LIMIT ?
      `),
    }
  }

  loadWorkspace() {
    const pages = this.statements.listPages.all().map(mapPageRow)
    const storedActiveId = this.statements.activePage.get()?.active_page_id
    const activePageId = pages.some((page) => page.id === storedActiveId && !page.archivedAt)
      ? storedActiveId
      : pages.find((page) => !page.archivedAt)?.id

    return { pages, activePageId: activePageId ?? '' }
  }

  upsertPage(page) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const current = this.database.prepare('SELECT id, title, content FROM pages WHERE id=?').get(page.id)
      const retrievalChanged = !current || current.title !== page.title || current.content !== page.content
      if (current && retrievalChanged) this.captureAutomaticVersion(current)
      this.statements.upsertPage.run(
        page.id,
        page.title,
        page.icon,
        page.parentId,
        page.favorite ? 1 : 0,
        page.content,
        page.updatedAt,
        page.lastVisitedAt,
        page.archivedAt,
      )
      this.reconcilePageAttachments(page.id, page.content)
      if (retrievalChanged) this.indexPageForRetrieval(page.id, page.title, page.content)
      this.enqueueWebhookEvent(current ? 'page.updated' : 'page.created', page.id, { page: { id: page.id, title: page.title, icon: page.icon, parentId: page.parentId, updatedAt: page.updatedAt, archivedAt: page.archivedAt } }, page.updatedAt)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
    return page
  }

  /**
   * Commits an entire converted archive atomically. Pages are ordered by tree
   * depth so parent foreign keys exist first; any malformed row rolls back the
   * root page, databases and values together.
   */
  importWorkspaceBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.pages) || !Array.isArray(bundle.databases) || bundle.pages.length < 1) {
      throw new TypeError('Invalid import bundle.')
    }
    const pages = [...bundle.pages].sort((left, right) => pageDepth(left, bundle.pages) - pageDepth(right, bundle.pages))
    const insertDatabase = this.database.prepare('INSERT INTO databases(id, page_id, name, active_view_id) VALUES (?, ?, ?, ?)')
    const insertProperty = this.database.prepare('INSERT INTO database_properties(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
    const insertRecord = this.database.prepare('INSERT INTO database_records(id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    const insertValue = this.database.prepare('INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const insertView = this.database.prepare('INSERT INTO database_views(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
    const insertAttachment = this.database.prepare('INSERT INTO attachments(hash, size, mime_type, relative_path, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING')
    const insertPageAttachment = this.database.prepare('INSERT OR IGNORE INTO page_attachments(page_id, attachment_hash, source_path, display_name) VALUES (?, ?, ?, ?)')

    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const page of pages) {
        if (!page.id || page.id.length > 128 || typeof page.content !== 'string' || page.content.length > 20_000_000) throw new TypeError('Imported page exceeds safety limits.')
        this.statements.upsertPage.run(page.id, String(page.title).slice(0, 1000), page.icon, page.parentId, page.favorite ? 1 : 0, page.content, page.updatedAt, page.lastVisitedAt, page.archivedAt)
        this.indexPageForRetrieval(page.id, page.title, page.content)
      }
      for (const imported of bundle.databases) {
        const viewId = `${imported.id}-table`
        insertDatabase.run(imported.id, imported.pageId, imported.name, viewId)
        imported.headers.forEach((header, index) => {
          const propertyId = `${imported.id}-p${index}`
          const type = index === 0 ? 'title' : (imported.inferredTypes[header] ?? 'text')
          insertProperty.run(propertyId, imported.id, header, type, index, '{}')
        })
        imported.rows.forEach((row, rowIndex) => {
          const recordId = `${imported.id}-r${rowIndex}`
          const now = new Date().toISOString()
          insertRecord.run(recordId, imported.id, rowIndex, now, now)
          imported.headers.forEach((header, propertyIndex) => {
            const type = propertyIndex === 0 ? 'title' : (imported.inferredTypes[header] ?? 'text')
            const raw = row[header] ?? ''
            const numberValue = type === 'number' && raw !== '' ? Number(raw) : null
            const booleanValue = type === 'checkbox' ? (/^(?:true|yes)$/i.test(raw) ? 1 : 0) : null
            insertValue.run(recordId, `${imported.id}-p${propertyIndex}`, ['number', 'checkbox'].includes(type) ? null : raw, Number.isFinite(numberValue) ? numberValue : null, booleanValue, null, now)
          })
        })
        insertView.run(viewId, imported.id, '全部', 'table', 0, '{}')
      }
      for (const attachment of bundle.attachments ?? []) {
        insertAttachment.run(attachment.hash, attachment.size, attachment.mimeType, attachment.relativePath, new Date().toISOString())
        for (const pageId of attachment.referencedBy) insertPageAttachment.run(pageId, attachment.hash, attachment.sourcePath, attachment.displayName)
      }
      this.statements.setActivePage.run(pages[0].id)
      this.database.prepare("UPDATE import_jobs SET status='completed', report_json=?, error_message=NULL, updated_at=? WHERE id=?")
        .run(JSON.stringify(bundle.report ?? {}), new Date().toISOString(), bundle.importId)
      this.database.exec('COMMIT')
      return { rootPageId: pages[0].id, pageCount: pages.length, databaseCount: bundle.databases.length, ...bundle.report }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  createImportJob(id, sourceName) {
    const now = new Date().toISOString()
    this.database.prepare("INSERT INTO import_jobs(id, source_name, status, created_at, updated_at) VALUES (?, ?, 'converting', ?, ?)").run(id, sourceName, now, now)
  }

  recoverInterruptedImports() {
    const now = new Date().toISOString()
    this.database.prepare("UPDATE import_jobs SET status='failed', error_message='应用在导入完成前退出，未提交的数据库写入已回滚。', updated_at=? WHERE status IN ('converting', 'committing')").run(now)
  }

  updateImportJob(id, status, errorMessage = null) {
    if (!['converting', 'committing', 'completed', 'failed', 'cancelled'].includes(status)) throw new TypeError('Invalid import status.')
    this.database.prepare('UPDATE import_jobs SET status=?, error_message=?, updated_at=? WHERE id=?').run(status, errorMessage?.slice(0, 2000) ?? null, new Date().toISOString(), id)
  }

  loadImportJobs() {
    return this.database.prepare('SELECT id, source_name AS sourceName, status, report_json AS reportJson, error_message AS errorMessage, created_at AS createdAt, updated_at AS updatedAt FROM import_jobs ORDER BY created_at DESC LIMIT 50').all()
      .map((job) => ({ ...job, report: JSON.parse(job.reportJson), reportJson: undefined }))
  }

  getAttachment(hash) {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null
    return this.database.prepare('SELECT hash, size, mime_type AS mimeType, relative_path AS relativePath FROM attachments WHERE hash=?').get(hash) ?? null
  }

  registerPageAttachments(pageId, attachments) {
    const insertAttachment = this.database.prepare('INSERT INTO attachments(hash, size, mime_type, relative_path, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(hash) DO NOTHING')
    const insertReference = this.database.prepare('INSERT OR IGNORE INTO page_attachments(page_id, attachment_hash, source_path, display_name) VALUES (?, ?, ?, ?)')
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const createdAt = new Date().toISOString()
      for (const attachment of attachments) {
        insertAttachment.run(attachment.hash, attachment.size, attachment.mimeType, attachment.relativePath, createdAt)
        // A deterministic manual source prevents repeated insertion of the same
        // content on one page from inflating future reference-counted cleanup.
        insertReference.run(pageId, attachment.hash, `manual/${attachment.hash}`, attachment.displayName)
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Makes the serialized document the source of truth for reference counts.
   * Imported and manually selected assets share the same URL shape, so stale
   * references disappear after the normal debounced page save.
   */
  reconcilePageAttachments(pageId, content) {
    const referenced = extractAttachmentHashes(content)
    const existing = this.database.prepare('SELECT attachment_hash AS hash, display_name AS displayName FROM page_attachments WHERE page_id=?').all(pageId)
    const existingByHash = new Map(existing.map((item) => [item.hash, item]))
    const removeReference = this.database.prepare('DELETE FROM page_attachments WHERE page_id=? AND attachment_hash=?')
    const insertReference = this.database.prepare('INSERT OR IGNORE INTO page_attachments(page_id, attachment_hash, source_path, display_name) SELECT ?, hash, ?, ? FROM attachments WHERE hash=?')
    for (const item of existing) if (!referenced.has(item.hash)) removeReference.run(pageId, item.hash)
    for (const hash of referenced) if (!existingByHash.has(hash)) insertReference.run(pageId, hash, `document/${hash}`, '附件', hash)
  }

  captureAutomaticVersion(page) {
    const latest = this.database.prepare('SELECT created_at AS createdAt FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT 1').get(page.id)
    if (latest && Date.now() - Date.parse(latest.createdAt) < 5 * 60_000) return null
    return this.insertPageVersion(page, 'autosave')
  }

  insertPageVersion(page, reason) {
    const result = this.database.prepare('INSERT INTO page_versions(page_id, title, content, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(page.id, page.title, page.content, reason, new Date().toISOString())
    const versionId = Number(result.lastInsertRowid)
    const insertReference = this.database.prepare('INSERT OR IGNORE INTO page_version_attachments(version_id, attachment_hash) SELECT ?, hash FROM attachments WHERE hash=?')
    for (const hash of extractAttachmentHashes(page.content)) insertReference.run(versionId, hash)
    this.database.prepare(`DELETE FROM page_versions WHERE page_id=? AND id NOT IN (
      SELECT id FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT 200
    )`).run(page.id, page.id)
    return versionId
  }

  listPageVersions(pageId, limit = 100) {
    const boundedLimit = Math.min(200, Math.max(1, Number(limit) || 100))
    return this.database.prepare(`
      SELECT id, page_id AS pageId, title, reason, created_at AS createdAt,
             length(content) AS contentLength, substr(content, 1, 500) AS preview
      FROM page_versions WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(pageId, boundedLimit)
  }

  getPageVersion(pageId, versionId) {
    return this.database.prepare('SELECT id, page_id AS pageId, title, content, reason, created_at AS createdAt FROM page_versions WHERE page_id=? AND id=?').get(pageId, versionId) ?? null
  }

  restorePageVersion(pageId, versionId) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const current = this.database.prepare('SELECT * FROM pages WHERE id=?').get(pageId)
      const version = this.getPageVersion(pageId, versionId)
      if (!current || !version) throw new Error('历史版本不存在。')
      this.insertPageVersion({ id: pageId, title: current.title, content: current.content }, 'restore')
      const now = new Date().toISOString()
      this.database.prepare('UPDATE pages SET title=?, content=?, updated_at=? WHERE id=?').run(version.title, version.content, now, pageId)
      this.reconcilePageAttachments(pageId, version.content)
      this.indexPageForRetrieval(pageId, version.title, version.content)
      this.enqueueWebhookEvent('page.updated', pageId, { page: { id: pageId, title: version.title, updatedAt: now, restoredFromVersionId: versionId } }, now)
      this.database.exec('COMMIT')
      return mapPageRow(this.database.prepare('SELECT * FROM pages WHERE id=?').get(pageId))
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  listUnreferencedAttachments(cutoff) {
    return this.database.prepare(`
      SELECT a.hash, a.relative_path AS relativePath
      FROM attachments a
      LEFT JOIN page_attachments pa ON pa.attachment_hash = a.hash
      LEFT JOIN page_version_attachments pva ON pva.attachment_hash = a.hash
      WHERE pa.attachment_hash IS NULL AND pva.attachment_hash IS NULL AND a.created_at < ?
      ORDER BY a.created_at
    `).all(cutoff)
  }

  deleteAttachmentIfUnreferenced(hash, cutoff) {
    return this.database.prepare(`
      DELETE FROM attachments
      WHERE hash=? AND created_at < ?
        AND NOT EXISTS (SELECT 1 FROM page_attachments WHERE attachment_hash=attachments.hash)
        AND NOT EXISTS (SELECT 1 FROM page_version_attachments WHERE attachment_hash=attachments.hash)
    `).run(hash, cutoff).changes > 0
  }

  backfillRetrievalIndex() {
    const pages = this.database.prepare('SELECT p.id, p.title, p.content FROM pages p WHERE NOT EXISTS (SELECT 1 FROM search_chunks sc WHERE sc.page_id=p.id)').all()
    this.database.exec('BEGIN IMMEDIATE')
    try { for (const page of pages) this.indexPageForRetrieval(page.id, page.title, page.content); this.database.exec('COMMIT') }
    catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  indexPageForRetrieval(pageId, title, content) {
    this.database.prepare('DELETE FROM search_chunks_fts WHERE rowid IN (SELECT id FROM search_chunks WHERE page_id=?)').run(pageId)
    this.database.prepare('DELETE FROM search_chunks WHERE page_id=?').run(pageId)
    const insertChunk = this.database.prepare('INSERT INTO search_chunks(page_id, chunk_index, heading, text, embedding) VALUES (?, ?, ?, ?, ?)')
    const insertFts = this.database.prepare('INSERT INTO search_chunks_fts(rowid, page_id, heading, text) VALUES (?, ?, ?, ?)')
    for (const chunk of chunkPage(title, content)) {
      const result = insertChunk.run(pageId, chunk.index, chunk.heading, chunk.text, embedText(`${title}\n${chunk.text}`))
      insertFts.run(Number(result.lastInsertRowid), pageId, chunk.heading, chunk.text)
    }
  }

  hybridSearch(query, userId = null, limit = 8) {
    const normalized = String(query).trim().slice(0, 500)
    if (!normalized) return []
    const permissionSql = `p.archived_at IS NULL AND (? IS NULL OR
      NOT EXISTS (SELECT 1 FROM page_permissions all_permissions WHERE all_permissions.page_id=p.id) OR
      EXISTS (SELECT 1 FROM page_permissions mine WHERE mine.page_id=p.id AND mine.subject_id=?))`
    const baseSelect = `SELECT sc.id, sc.page_id AS pageId, sc.chunk_index AS chunkIndex, p.title, sc.heading, sc.text, sc.embedding
      FROM search_chunks sc JOIN pages p ON p.id=sc.page_id`
    const lexicalQuery = normalized.split(/\s+/u).filter(Boolean).map((token) => `"${token.replaceAll('"', '""')}"*`).join(' AND ')
    let lexical = []
    try {
      lexical = this.database.prepare(`${baseSelect} JOIN search_chunks_fts fts ON fts.rowid=sc.id
        WHERE search_chunks_fts MATCH ? AND ${permissionSql} ORDER BY bm25(search_chunks_fts, 0.0, 2.0, 1.0) LIMIT 50`)
        .all(lexicalQuery, userId, userId)
    } catch { lexical = [] }
    const queryEmbedding = embedText(normalized)
    const semantic = this.database.prepare(`${baseSelect} WHERE ${permissionSql} ORDER BY p.last_visited_at DESC LIMIT 2000`)
      .all(userId, userId)
      .map((row) => ({ ...row, similarity: cosineSimilarity(queryEmbedding, row.embedding) }))
      .filter((row) => row.similarity > 0)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 50)
    return fuseRankings(lexical, semantic, Math.min(12, Math.max(1, limit))).map((item, index) => ({
      citationId: `S${index + 1}`, pageId: item.pageId, chunkIndex: item.chunkIndex, title: item.title,
      heading: item.heading, excerpt: item.text.slice(0, 900), score: item.score,
    }))
  }

  setActivePage(id) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.statements.setActivePage.run(id)
      this.statements.markVisited.run(now, id)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  archivePage(id) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.statements.archivePage.run(now, now, id)
      this.enqueueWebhookEvent('page.archived', id, { page: { id, archivedAt: now, updatedAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  restorePage(id) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.statements.restorePage.run(now, id)
      this.enqueueWebhookEvent('page.updated', id, { page: { id, archivedAt: null, updatedAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  searchPages(query, limit = 30) {
    const normalized = query.trim()
    if (!normalized) return this.statements.recentPages.all(limit).map(mapPageRow)

    // Quoting each token prevents user input from becoming an FTS operator.
    const safeMatch = normalized
      .split(/\s+/u)
      .filter(Boolean)
      .map((token) => `"${token.replaceAll('"', '""')}"*`)
      .join(' AND ')

    return this.statements.searchPages.all(safeMatch, limit).map(mapPageRow)
  }

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
    const recordRows = this.database.prepare('SELECT id, created_at, updated_at FROM database_records WHERE database_id = ? ORDER BY position').all(database.id)
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
      return { id: record.id, values, createdAt: record.created_at, updatedAt: record.updated_at }
    })
    const views = this.database.prepare('SELECT id, name, type, config_json FROM database_views WHERE database_id = ? ORDER BY position').all(database.id).map((view) => ({
      id: view.id,
      databaseId: database.id,
      name: view.name,
      type: view.type,
      config: JSON.parse(view.config_json),
    }))
    return { schema: { id: database.id, name: database.name, properties }, records, views, activeViewId: database.active_view_id }
  }

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
      this.writeDatabasePropertyValue(recordId, { id: propertyId, ...property }, value, now)
      this.database.prepare('UPDATE database_records SET updated_at = ? WHERE id = ?').run(now, recordId)
      const automationRuns = this.executeDatabaseAutomations(property.databaseId, recordId, propertyId, now)
      this.enqueueWebhookEvent('database.record.updated', recordId, { record: { id: recordId, propertyId, value, updatedAt: now } }, now)
      this.database.exec('COMMIT')
      return { automationRuns }
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  writeDatabasePropertyValue(recordId, property, value, now) {
    if (property.type === 'formula' || property.type === 'rollup') throw new Error('Derived database properties are read-only.')
    let textValue = null; let numberValue = null; let booleanValue = null; let jsonValue = null
    if (value !== null) {
      if (property.type === 'number') { numberValue = Number(value); if (!Number.isFinite(numberValue)) throw new TypeError('Number property requires a finite value.') }
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
    this.database.prepare(`
      INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id, property_id) DO UPDATE SET text_value=excluded.text_value, number_value=excluded.number_value,
        boolean_value=excluded.boolean_value, json_value=excluded.json_value, updated_at=excluded.updated_at
    `).run(recordId, property.id, textValue, numberValue, booleanValue, jsonValue, now)
  }

  createDatabaseRecord(databaseId, recordId) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const nextPosition = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_records WHERE database_id = ?').get(databaseId).position
      this.database.prepare('INSERT INTO database_records(id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(recordId, databaseId, nextPosition, now, now)
      this.enqueueWebhookEvent('database.record.created', recordId, { record: { id: recordId, databaseId, createdAt: now } }, now)
      this.database.exec('COMMIT')
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  setActiveDatabaseView(databaseId, viewId) {
    this.database.prepare('UPDATE databases SET active_view_id = ? WHERE id = ?').run(viewId, databaseId)
  }

  getSetting(key) {
    return this.database.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value ?? null
  }

  setSetting(key, value) {
    this.database.prepare('INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  databaseAutomationSchema(databaseId) {
    return { properties: this.database.prepare('SELECT id, type FROM database_properties WHERE database_id=? ORDER BY position').all(databaseId) }
  }

  listDatabaseAutomations(databaseId) {
    return this.database.prepare(`
      SELECT id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at
      FROM database_automations WHERE database_id=? ORDER BY created_at, id
    `).all(databaseId).map((row) => ({ id: row.id, name: row.name, enabled: Boolean(row.enabled), trigger: { type: 'propertyChanged', propertyId: row.trigger_property_id }, condition: row.condition_json ? JSON.parse(row.condition_json) : undefined, actions: JSON.parse(row.actions_json), createdAt: row.created_at, updatedAt: row.updated_at }))
  }

  saveDatabaseAutomation(databaseId, rule) {
    const normalized = { ...rule, id: rule.id || randomUUID() }
    // 规则 ID 是全局主键。更新前确认归属，避免调用方用已知 ID 覆盖其他数据库的规则。
    const existing = this.database.prepare('SELECT database_id FROM database_automations WHERE id=?').get(normalized.id)
    if (existing && existing.database_id !== databaseId) throw new Error('Automation rule belongs to another database.')
    const issues = validateAutomationRule(this.databaseAutomationSchema(databaseId), normalized)
    if (issues.length) throw new TypeError(issues.join(' '))
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO database_automations(id, database_id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled, trigger_property_id=excluded.trigger_property_id,
        condition_json=excluded.condition_json, actions_json=excluded.actions_json, updated_at=excluded.updated_at
    `).run(normalized.id, databaseId, normalized.name.trim(), normalized.enabled ? 1 : 0, normalized.trigger.propertyId, normalized.condition ? JSON.stringify(normalized.condition) : null, JSON.stringify(normalized.actions), now, now)
    return this.listDatabaseAutomations(databaseId).find((item) => item.id === normalized.id)
  }

  setDatabaseAutomationEnabled(id, enabled) {
    return this.database.prepare('UPDATE database_automations SET enabled=?, updated_at=? WHERE id=?').run(enabled ? 1 : 0, new Date().toISOString(), id).changes > 0
  }

  loadAutomationRecord(recordId) {
    const values = {}
    for (const row of this.database.prepare('SELECT property_id, text_value, number_value, boolean_value, json_value FROM property_values WHERE record_id=?').all(recordId)) {
      values[row.property_id] = row.text_value ?? row.number_value ?? (row.boolean_value === null ? null : Boolean(row.boolean_value))
      if (row.json_value !== null) values[row.property_id] = JSON.parse(row.json_value)
    }
    return { id: recordId, values }
  }

  executeDatabaseAutomations(databaseId, recordId, changedPropertyId, now) {
    const rules = this.listDatabaseAutomations(databaseId).filter((rule) => rule.enabled && rule.trigger.propertyId === changedPropertyId)
    const plan = planAutomationRuns(this.databaseAutomationSchema(databaseId), this.loadAutomationRecord(recordId), changedPropertyId, rules)
    const runIds = []
    for (const run of plan.runs) {
      const rule = rules.find((candidate) => candidate.id === run.automationId)
      const runId = randomUUID(); runIds.push(runId)
      this.database.exec('SAVEPOINT automation_rule')
      try {
        for (const patch of run.patches) {
          const property = this.database.prepare('SELECT id, type, config_json FROM database_properties WHERE id=? AND database_id=?').get(patch.propertyId, databaseId)
          if (!property) throw new Error('Automation action property no longer exists.')
          this.writeDatabasePropertyValue(recordId, property, patch.value, now)
        }
        this.database.prepare('UPDATE database_records SET updated_at=? WHERE id=?').run(now, recordId)
        this.insertAutomationRun({ id: runId, rule, databaseId, recordId, changedPropertyId, input: run.input, output: run.patches, status: 'succeeded', error: null, replayOf: null, now })
        this.database.exec('RELEASE SAVEPOINT automation_rule')
      } catch (error) {
        this.database.exec('ROLLBACK TO SAVEPOINT automation_rule'); this.database.exec('RELEASE SAVEPOINT automation_rule')
        this.insertAutomationRun({ id: runId, rule, databaseId, recordId, changedPropertyId, input: run.input, output: run.patches, status: 'failed', error: error instanceof Error ? error.message : 'Automation failed.', replayOf: null, now })
      }
    }
    return runIds
  }

  insertAutomationRun(entry) {
    this.database.prepare(`
      INSERT INTO automation_runs(id, automation_id, automation_name, database_id, record_id, trigger_property_id, rule_json, input_json, output_json, status, error_message, replay_of, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.rule?.id ?? null, entry.rule?.name ?? '已删除规则', entry.databaseId, entry.recordId, entry.changedPropertyId, JSON.stringify(entry.rule), JSON.stringify(entry.input), JSON.stringify(entry.output), entry.status, entry.error, entry.replayOf, entry.now, entry.now)
  }

  listAutomationRuns(databaseId, limit = 100) {
    return this.database.prepare(`
      SELECT id, automation_id, automation_name, record_id, trigger_property_id, output_json, status, error_message, replay_of, created_at, completed_at
      FROM automation_runs WHERE database_id=? ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(databaseId, Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({ id: row.id, automationId: row.automation_id, automationName: row.automation_name, recordId: row.record_id, triggerPropertyId: row.trigger_property_id, output: JSON.parse(row.output_json), status: row.status, errorMessage: row.error_message, replayOf: row.replay_of, createdAt: row.created_at, completedAt: row.completed_at }))
  }

  replayAutomationRun(runId) {
    const source = this.database.prepare('SELECT * FROM automation_runs WHERE id=? AND status=\'failed\'').get(runId)
    if (!source) throw new Error('Only failed automation runs can be replayed.')
    const currentRule = source.automation_id ? this.listDatabaseAutomations(source.database_id).find((rule) => rule.id === source.automation_id) : null
    const rule = currentRule ?? JSON.parse(source.rule_json)
    const input = JSON.parse(source.input_json)
    const plan = planAutomationRuns(this.databaseAutomationSchema(source.database_id), { id: source.record_id, values: input.values }, input.changedPropertyId, [{ ...rule, enabled: true }])
    if (!plan.runs.length) throw new Error('The corrected rule no longer matches the captured input.')
    const run = plan.runs[0]; const replayId = randomUUID(); const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    this.database.exec('SAVEPOINT automation_replay')
    try {
      for (const patch of run.patches) {
        const property = this.database.prepare('SELECT id, type, config_json FROM database_properties WHERE id=? AND database_id=?').get(patch.propertyId, source.database_id)
        if (!property) throw new Error('Automation action property no longer exists.')
        this.writeDatabasePropertyValue(source.record_id, property, patch.value, now)
      }
      this.database.prepare('UPDATE database_records SET updated_at=? WHERE id=?').run(now, source.record_id)
      this.insertAutomationRun({ id: replayId, rule, databaseId: source.database_id, recordId: source.record_id, changedPropertyId: source.trigger_property_id, input, output: run.patches, status: 'succeeded', error: null, replayOf: runId, now })
      this.database.exec('RELEASE SAVEPOINT automation_replay')
      this.database.exec('COMMIT')
      return replayId
    } catch (error) {
      // 回滚业务写入，但在同一外层事务中保留失败磁带，便于修正规则后继续重放。
      this.database.exec('ROLLBACK TO SAVEPOINT automation_replay')
      this.database.exec('RELEASE SAVEPOINT automation_replay')
      this.insertAutomationRun({ id: replayId, rule, databaseId: source.database_id, recordId: source.record_id, changedPropertyId: source.trigger_property_id, input, output: run.patches, status: 'failed', error: error instanceof Error ? error.message : 'Automation replay failed.', replayOf: runId, now })
      this.database.exec('COMMIT')
      return replayId
    }
  }

  createWebhookEndpoint(name, url, events, encryptedSecret) {
    const safeName = String(name).trim()
    if (!safeName || safeName.length > 100) throw new TypeError('Webhook name must contain 1 to 100 characters.')
    const safeUrl = validateWebhookUrl(url)
    if (!Array.isArray(events) || !events.length || events.some((event) => !WEBHOOK_EVENTS.includes(event))) throw new TypeError('Webhook requires valid subscribed events.')
    if (!Buffer.isBuffer(encryptedSecret) || encryptedSecret.length < 1 || encryptedSecret.length > 16_384) throw new TypeError('Webhook secret must be encrypted before storage.')
    const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO webhook_endpoints(id, name, url, secret_ciphertext, events_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, safeName, safeUrl, encryptedSecret, JSON.stringify([...new Set(events)]), now, now)
    return { id, name: safeName, url: safeUrl, events: [...new Set(events)], active: true, createdAt: now, updatedAt: now }
  }

  listWebhookEndpoints() {
    return this.database.prepare(`
      SELECT endpoint.id, endpoint.name, endpoint.url, endpoint.events_json, endpoint.active,
             endpoint.created_at, endpoint.updated_at,
             SUM(CASE WHEN outbox.status='pending' THEN 1 ELSE 0 END) AS pending_count,
             SUM(CASE WHEN outbox.status='dead' THEN 1 ELSE 0 END) AS dead_count
      FROM webhook_endpoints endpoint LEFT JOIN webhook_outbox outbox ON outbox.endpoint_id=endpoint.id
      GROUP BY endpoint.id ORDER BY endpoint.created_at DESC
    `).all().map((row) => ({ id: row.id, name: row.name, url: row.url, events: JSON.parse(row.events_json), active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at, pendingCount: Number(row.pending_count), deadCount: Number(row.dead_count) }))
  }

  setWebhookEndpointActive(id, active) {
    const result = this.database.prepare('UPDATE webhook_endpoints SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, new Date().toISOString(), id)
    return result.changes > 0
  }

  /** Adds events inside the caller's business transaction and coalesces rapid unsent updates. */
  enqueueWebhookEvent(event, resourceKey, data, occurredAt = new Date().toISOString()) {
    if (!WEBHOOK_EVENTS.includes(event)) throw new TypeError('Unsupported webhook event.')
    const serializedData = stableJson(data)
    if (Buffer.byteLength(serializedData, 'utf8') > 240_000) throw new RangeError('Webhook event data exceeds 240 KiB.')
    const endpoints = this.database.prepare('SELECT id, events_json FROM webhook_endpoints WHERE active=1').all()
    const findPending = this.database.prepare("SELECT id FROM webhook_outbox WHERE endpoint_id=? AND event=? AND resource_key=? AND status='pending' ORDER BY created_at DESC LIMIT 1")
    const updatePending = this.database.prepare('UPDATE webhook_outbox SET payload_json=?, next_attempt_at=?, created_at=? WHERE id=?')
    const insert = this.database.prepare(`
      INSERT INTO webhook_outbox(id, endpoint_id, event, resource_key, payload_json, status, next_attempt_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `)
    for (const endpoint of endpoints) {
      if (!JSON.parse(endpoint.events_json).includes(event)) continue
      const existing = findPending.get(endpoint.id, event, resourceKey)
      const deliveryId = existing?.id ?? randomUUID()
      const payload = stableJson(createWebhookEnvelope(event, deliveryId, occurredAt, JSON.parse(serializedData)))
      if (existing) updatePending.run(payload, occurredAt, occurredAt, deliveryId)
      else insert.run(deliveryId, endpoint.id, event, resourceKey, payload, occurredAt, occurredAt)
    }
  }

  claimWebhookDeliveries(workerId, limit = 10, leaseMs = 30_000, now = new Date().toISOString()) {
    if (typeof workerId !== 'string' || !workerId || workerId.length > 128) throw new TypeError('Invalid webhook worker id.')
    const leaseUntil = new Date(Date.parse(now) + Math.max(5_000, Math.min(300_000, leaseMs))).toISOString()
    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 10))
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare("UPDATE webhook_outbox SET status='pending', lease_owner=NULL, lease_until=NULL WHERE status='leased' AND lease_until<=?").run(now)
      const due = this.database.prepare(`
        SELECT outbox.id FROM webhook_outbox outbox
        JOIN webhook_endpoints endpoint ON endpoint.id=outbox.endpoint_id AND endpoint.active=1
        WHERE outbox.status='pending' AND outbox.next_attempt_at<=?
        ORDER BY outbox.next_attempt_at, outbox.created_at LIMIT ?
      `).all(now, boundedLimit)
      const lease = this.database.prepare("UPDATE webhook_outbox SET status='leased', lease_owner=?, lease_until=? WHERE id=? AND status='pending'")
      for (const item of due) lease.run(workerId, leaseUntil, item.id)
      const rows = due.length ? this.database.prepare(`
        SELECT outbox.id, outbox.endpoint_id, outbox.event, outbox.payload_json, outbox.attempts,
               endpoint.url, endpoint.secret_ciphertext
        FROM webhook_outbox outbox JOIN webhook_endpoints endpoint ON endpoint.id=outbox.endpoint_id
        WHERE outbox.lease_owner=? AND outbox.lease_until=? ORDER BY outbox.created_at
      `).all(workerId, leaseUntil) : []
      this.database.exec('COMMIT')
      return rows.map((row) => ({ id: row.id, endpointId: row.endpoint_id, event: row.event, payload: row.payload_json, attempts: row.attempts, url: row.url, encryptedSecret: Buffer.from(row.secret_ciphertext) }))
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  completeWebhookDelivery(deliveryId, workerId, result) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const delivery = this.database.prepare("SELECT attempts FROM webhook_outbox WHERE id=? AND status='leased' AND lease_owner=?").get(deliveryId, workerId)
      if (!delivery) throw new Error('Webhook delivery lease is no longer owned by this worker.')
      const attempt = delivery.attempts + 1; const now = new Date().toISOString()
      const success = result.statusCode >= 200 && result.statusCode < 300
      const dead = !success && attempt >= 8
      this.database.prepare(`
        INSERT INTO webhook_delivery_attempts(delivery_id, attempt_number, status_code, duration_ms, response_preview, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(deliveryId, attempt, result.statusCode ?? null, Math.max(0, Math.round(result.durationMs)), String(result.responsePreview ?? '').slice(0, 2000) || null, String(result.errorMessage ?? '').slice(0, 2000) || null, now)
      this.database.prepare(`
        UPDATE webhook_outbox SET status=?, attempts=?, next_attempt_at=?, lease_owner=NULL, lease_until=NULL,
          last_error=?, delivered_at=? WHERE id=?
      `).run(success ? 'delivered' : dead ? 'dead' : 'pending', attempt, success || dead ? now : nextWebhookAttempt(attempt, Date.parse(now)), success ? null : String(result.errorMessage ?? `HTTP ${result.statusCode ?? 0}`).slice(0, 2000), success ? now : null, deliveryId)
      this.database.exec('COMMIT')
      return { status: success ? 'delivered' : dead ? 'dead' : 'pending', attempt }
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }

  listWebhookDeliveries(endpointId, limit = 100) {
    return this.database.prepare(`
      SELECT id, endpoint_id, event, status, attempts, next_attempt_at, last_error, created_at, delivered_at
      FROM webhook_outbox WHERE endpoint_id=? ORDER BY created_at DESC LIMIT ?
    `).all(endpointId, Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({ id: row.id, endpointId: row.endpoint_id, event: row.event, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastError: row.last_error, createdAt: row.created_at, deliveredAt: row.delivered_at }))
  }

  issueApiToken(name, scopes, expiresAt = null) {
    const safeName = String(name).trim()
    if (!safeName || safeName.length > 100) throw new TypeError('API token name must contain 1 to 100 characters.')
    if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) throw new TypeError('API token expiry must be a valid ISO date.')
    const created = createApiToken(scopes)
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO api_tokens(id, name, token_prefix, secret_hash, scopes_json, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(created.id, safeName, created.prefix, created.secretHash, JSON.stringify(created.scopes), expiresAt, now)
    return { id: created.id, name: safeName, rawToken: created.rawToken, prefix: created.prefix, scopes: created.scopes, expiresAt, createdAt: now }
  }

  listApiTokens() {
    return this.database.prepare(`
      SELECT id, name, token_prefix, scopes_json, expires_at, revoked_at, last_used_at, created_at
      FROM api_tokens ORDER BY created_at DESC
    `).all().map((row) => ({
      id: row.id, name: row.name, prefix: row.token_prefix, scopes: JSON.parse(row.scopes_json),
      expiresAt: row.expires_at, revokedAt: row.revoked_at, lastUsedAt: row.last_used_at, createdAt: row.created_at,
    }))
  }

  authenticateApiToken(rawToken, requiredScope) {
    const tokenId = /^ntd_v1_([0-9a-f-]{36})_/u.exec(rawToken)?.[1]
    if (!tokenId) return null
    const row = this.database.prepare(`
      SELECT id, name, secret_hash, scopes_json, expires_at, revoked_at FROM api_tokens WHERE id = ?
    `).get(tokenId)
    if (!row) return null
    const stored = { id: row.id, secretHash: row.secret_hash, scopes: JSON.parse(row.scopes_json), expiresAt: row.expires_at, revokedAt: row.revoked_at }
    if (!verifyApiToken(rawToken, stored, requiredScope)) return null
    const lastUsedAt = new Date().toISOString()
    this.database.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(lastUsedAt, row.id)
    return { id: row.id, name: row.name, scopes: stored.scopes, lastUsedAt }
  }

  revokeApiToken(id) {
    const revokedAt = new Date().toISOString()
    const result = this.database.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(revokedAt, id)
    return result.changes > 0
  }

  recordApiAudit(entry) {
    this.database.prepare(`
      INSERT INTO api_audit_log(request_id, token_id, method, path, status, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.requestId.slice(0, 128), entry.tokenId ?? null, entry.method.slice(0, 10), entry.path.slice(0, 2048), entry.status, Math.max(0, Math.round(entry.durationMs)), new Date().toISOString())
  }

  listApiAudit(limit = 100) {
    return this.database.prepare(`
      SELECT request_id, token_id, method, path, status, duration_ms, created_at
      FROM api_audit_log ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({
      requestId: row.request_id, tokenId: row.token_id, method: row.method, path: row.path,
      status: row.status, durationMs: row.duration_ms, createdAt: row.created_at,
    }))
  }

  loadSyncDocument(pageId) {
    const document = this.database.prepare('SELECT snapshot, compacted_through_id FROM sync_documents WHERE page_id = ?').get(pageId)
    const afterId = document?.compacted_through_id ?? 0
    const updates = this.database.prepare('SELECT id, client_id, update_blob FROM sync_updates WHERE page_id = ? AND id > ? ORDER BY id').all(pageId, afterId)
    return {
      snapshot: document?.snapshot ? Buffer.from(document.snapshot).toString('base64') : null,
      updates: updates.map((update) => ({ id: update.id, clientId: update.client_id, data: Buffer.from(update.update_blob).toString('base64') })),
      latestUpdateId: updates.at(-1)?.id ?? afterId,
    }
  }

  appendSyncUpdate(pageId, clientId, base64Update) {
    const update = Buffer.from(base64Update, 'base64')
    const result = this.database.prepare('INSERT INTO sync_updates(page_id, client_id, update_blob, created_at) VALUES (?, ?, ?, ?)').run(pageId, clientId, update, new Date().toISOString())
    return Number(result.lastInsertRowid)
  }

  compactSyncDocument(pageId, base64Snapshot, throughId) {
    const snapshot = Buffer.from(base64Snapshot, 'base64')
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`
        INSERT INTO sync_documents(page_id, snapshot, compacted_through_id, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET snapshot=excluded.snapshot, compacted_through_id=excluded.compacted_through_id, updated_at=excluded.updated_at
      `).run(pageId, snapshot, throughId, now)
      this.database.prepare('DELETE FROM sync_updates WHERE page_id = ? AND id <= ?').run(pageId, throughId)
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  createAIPatchAudit(id, pageId, operation, preview) {
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO ai_patch_audit(id, page_id, operation, preview, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, pageId, operation, preview, 'proposed', now, now)
    return id
  }

  updateAIPatchAudit(id, status) {
    this.database.prepare('UPDATE ai_patch_audit SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id)
  }

  loadAIPatchAudit(pageId) {
    return this.database.prepare('SELECT id, operation, preview, status FROM ai_patch_audit WHERE page_id = ? ORDER BY created_at DESC').all(pageId)
  }

  upsertPagePermission(pageId, subjectId, displayName, role) {
    this.database.prepare(`INSERT INTO page_permissions(page_id, subject_id, display_name, role, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(page_id, subject_id) DO UPDATE SET display_name=excluded.display_name, role=excluded.role`)
      .run(pageId, subjectId, displayName, role, new Date().toISOString())
  }

  loadPagePermissions(pageId) {
    return this.database.prepare('SELECT subject_id AS subjectId, display_name AS displayName, role FROM page_permissions WHERE page_id = ? ORDER BY role DESC, display_name').all(pageId)
  }

  removePagePermission(pageId, subjectId) {
    this.database.prepare("DELETE FROM page_permissions WHERE page_id=? AND subject_id=? AND role<>'owner'").run(pageId, subjectId)
  }

  getPageRole(pageId, subjectId) {
    return this.database.prepare('SELECT role FROM page_permissions WHERE page_id = ? AND subject_id = ?').get(pageId, subjectId)?.role ?? null
  }

  createComment(comment) {
    const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('INSERT INTO comments(id, page_id, author_id, author_name, body, anchor_json, resolved_at, created_at, mentions_json) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        .run(comment.id, comment.pageId, comment.authorId, comment.authorName, comment.body, comment.anchor ? JSON.stringify(comment.anchor) : null, now, JSON.stringify(comment.mentions ?? []))
      const notify = this.database.prepare('INSERT INTO notifications(id, recipient_id, page_id, comment_id, type, read_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)')
      for (const recipientId of comment.mentions ?? []) {
        if (recipientId !== comment.authorId) notify.run(randomUUID(), recipientId, comment.pageId, comment.id, 'mention', now)
      }
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  loadComments(pageId) {
    return this.database.prepare('SELECT id, author_name AS authorName, body, anchor_json AS anchor, mentions_json AS mentions, resolved_at AS resolvedAt, created_at AS createdAt FROM comments WHERE page_id = ? ORDER BY created_at DESC').all(pageId)
      .map((comment) => ({ ...comment, anchor: comment.anchor ? JSON.parse(comment.anchor) : null, mentions: JSON.parse(comment.mentions) }))
  }

  resolveComment(id) {
    this.database.prepare('UPDATE comments SET resolved_at = ? WHERE id = ?').run(new Date().toISOString(), id)
  }

  loadNotifications(recipientId) {
    return this.database.prepare(`SELECT n.id, n.type, n.read_at AS readAt, n.created_at AS createdAt, p.id AS pageId, p.title AS pageTitle,
      c.author_name AS authorName, c.body FROM notifications n JOIN pages p ON p.id=n.page_id LEFT JOIN comments c ON c.id=n.comment_id
      WHERE n.recipient_id=? ORDER BY n.created_at DESC LIMIT 100`).all(recipientId)
  }

  markNotificationRead(id, recipientId) {
    this.database.prepare('UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?').run(new Date().toISOString(), id, recipientId)
  }

  close() {
    this.database.close()
  }
}

function pageDepth(page, pages) {
  const byId = new Map(pages.map((candidate) => [candidate.id, candidate]))
  const visited = new Set([page.id])
  let depth = 0
  let parentId = page.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    depth += 1
    parentId = byId.get(parentId)?.parentId
  }
  return depth
}

function mapPageRow(row) {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    parentId: row.parent_id,
    favorite: Boolean(row.favorite),
    content: row.content,
    updatedAt: row.updated_at,
    lastVisitedAt: row.last_visited_at,
    archivedAt: row.archived_at,
  }
}

function extractAttachmentHashes(content) {
  const hashes = new Set()
  const pattern = /notetodo-asset:\/\/([0-9a-f]{64})(?:[/?#]|$)/giu
  for (const match of content.matchAll(pattern)) hashes.add(match[1].toLowerCase())
  return hashes
}

module.exports = { WorkspaceDatabase, extractAttachmentHashes }
