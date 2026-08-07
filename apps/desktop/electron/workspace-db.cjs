const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')
const seedWorkspace = require('../shared/seed-workspace.json')

const LATEST_SCHEMA_VERSION = 6

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
    this.seedIfEmpty()
    this.seedDatabaseIfEmpty()
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
    ]
    const records = [
      ['task-1', 0, ['编辑器交互收尾', 'doing', 'Lin', '2026-08-08', 3]],
      ['task-2', 1, ['SQLite 数据迁移', 'done', 'Ming', '2026-08-06', 2]],
      ['task-3', 2, ['数据库 Table View', 'doing', 'Lin', '2026-08-10', 3]],
      ['task-4', 3, ['模型网关设置页', 'todo', 'Kai', '2026-08-12', 2]],
      ['task-5', 4, ['桌面安装包签名', 'todo', 'Ming', '2026-08-16', 1]],
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
          insertValue.run(recordId, property[0], typeof value === 'string' ? value : null, typeof value === 'number' ? value : null, null, null, now)
        })
      }

      const insertView = this.database.prepare('INSERT INTO database_views(id, database_id, name, type, position, config_json) VALUES (?, ?, ?, ?, ?, ?)')
      insertView.run('roadmap-table', 'roadmap-db', '所有任务', 'table', 0, '{}')
      insertView.run('roadmap-board', 'roadmap-db', '状态看板', 'board', 1, JSON.stringify({ groupByPropertyId: 'task-status' }))
      insertView.run('roadmap-list', 'roadmap-db', '紧凑列表', 'list', 2, '{}')
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

    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const page of pages) {
        if (!page.id || page.id.length > 128 || typeof page.content !== 'string' || page.content.length > 20_000_000) throw new TypeError('Imported page exceeds safety limits.')
        this.statements.upsertPage.run(page.id, String(page.title).slice(0, 1000), page.icon, page.parentId, page.favorite ? 1 : 0, page.content, page.updatedAt, page.lastVisitedAt, page.archivedAt)
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
      this.statements.setActivePage.run(pages[0].id)
      this.database.exec('COMMIT')
      return { rootPageId: pages[0].id, pageCount: pages.length, databaseCount: bundle.databases.length, ...bundle.report }
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
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
    this.statements.archivePage.run(now, now, id)
  }

  restorePage(id) {
    this.statements.restorePage.run(new Date().toISOString(), id)
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
    const property = this.database.prepare('SELECT type FROM database_properties WHERE id = ?').get(propertyId)
    if (!property) throw new Error('Database property does not exist.')
    const now = new Date().toISOString()
    let textValue = null
    let numberValue = null
    let booleanValue = null
    let jsonValue = null
    if (value !== null) {
      if (property.type === 'number') numberValue = Number(value)
      else if (property.type === 'checkbox') booleanValue = value ? 1 : 0
      else if (property.type === 'multiSelect') jsonValue = JSON.stringify(value)
      else textValue = String(value)
    }
    this.database.prepare(`
      INSERT INTO property_values(record_id, property_id, text_value, number_value, boolean_value, json_value, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id, property_id) DO UPDATE SET text_value=excluded.text_value, number_value=excluded.number_value,
        boolean_value=excluded.boolean_value, json_value=excluded.json_value, updated_at=excluded.updated_at
    `).run(recordId, propertyId, textValue, numberValue, booleanValue, jsonValue, now)
    this.database.prepare('UPDATE database_records SET updated_at = ? WHERE id = ?').run(now, recordId)
  }

  createDatabaseRecord(databaseId, recordId) {
    const now = new Date().toISOString()
    const nextPosition = this.database.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM database_records WHERE database_id = ?').get(databaseId).position
    this.database.prepare('INSERT INTO database_records(id, database_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(recordId, databaseId, nextPosition, now, now)
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

module.exports = { WorkspaceDatabase }
