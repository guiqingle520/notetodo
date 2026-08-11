const { isoToUnixMs } = require('@notetodo/main-core')

const timestampTargets = Object.freeze([
  { table: 'pages', key: 'id', columns: ['updated_at', 'last_visited_at', 'archived_at'] },
  { table: 'database_records', key: 'id', columns: ['created_at', 'updated_at', 'archived_at'] },
  { table: 'database_templates', key: 'id', columns: ['created_at', 'updated_at'] },
  { table: 'database_record_history', key: 'id', columns: ['created_at'] },
  { table: 'database_record_comments', key: 'id', columns: ['resolved_at', 'created_at'] },
  { table: 'database_record_reminders', key: 'id', columns: ['due_at', 'completed_at', 'created_at', 'updated_at'] },
  { table: 'sync_updates', key: 'id', columns: ['created_at'] },
  { table: 'ai_patch_audit', key: 'id', columns: ['created_at', 'updated_at'] },
  { table: 'comments', key: 'id', columns: ['resolved_at', 'created_at'] },
  { table: 'notifications', key: 'id', columns: ['read_at', 'created_at'] },
  { table: 'attachments', key: 'hash', columns: ['created_at'] },
  { table: 'import_jobs', key: 'id', columns: ['created_at', 'updated_at'] },
  { table: 'page_versions', key: 'id', columns: ['created_at'] },
  { table: 'api_tokens', key: 'id', columns: ['expires_at', 'revoked_at', 'last_used_at', 'created_at'] },
  { table: 'webhook_endpoints', key: 'id', columns: ['created_at', 'updated_at'] },
  { table: 'webhook_outbox', key: 'id', columns: ['next_attempt_at', 'lease_until', 'created_at', 'delivered_at'] },
  { table: 'webhook_delivery_attempts', key: 'id', columns: ['created_at'] },
  { table: 'database_automations', key: 'id', columns: ['created_at', 'updated_at'] },
  { table: 'automation_runs', key: 'id', columns: ['created_at', 'completed_at'] },
])

/**
 * Creates a lossless compatibility shadow before storage switches from ISO text
 * to Unix milliseconds. The original columns remain authoritative in v19, so
 * old binaries can still open the workspace and rollback is deterministic.
 */
function migrateUtcTimestampCompatibility(database, currentVersion) {
  if (currentVersion >= 19) return
  const nowMs = Date.now()
  database.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE timestamp_migration_state (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
      mode TEXT NOT NULL CHECK(mode IN ('iso-primary', 'dual-write', 'unix-primary')),
      backfilled_at_ms INTEGER NOT NULL,
      verified_at_ms INTEGER
    );
    CREATE TABLE timestamp_compat_backup (
      table_name TEXT NOT NULL,
      row_key TEXT NOT NULL,
      column_name TEXT NOT NULL,
      iso_value TEXT NOT NULL,
      unix_ms INTEGER NOT NULL,
      PRIMARY KEY(table_name, row_key, column_name)
    );
  `)
  try {
    const insert = database.prepare(`INSERT INTO timestamp_compat_backup
      (table_name, row_key, column_name, iso_value, unix_ms) VALUES (?, ?, ?, ?, ?)`)
    for (const target of timestampTargets) {
      const selectedColumns = [target.key, ...target.columns].join(', ')
      for (const row of database.prepare(`SELECT ${selectedColumns} FROM ${target.table}`).all()) {
        for (const column of target.columns) {
          const value = row[column]
          if (value === null || value === undefined || value === '') continue
          insert.run(target.table, String(row[target.key]), column, String(value), isoToUnixMs(String(value)))
        }
      }
    }
    database.prepare('INSERT INTO timestamp_migration_state(singleton, mode, backfilled_at_ms) VALUES (1, ?, ?)').run('iso-primary', nowMs)
    database.prepare("INSERT INTO app_meta(key, value) VALUES ('schema_version', '19') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run()
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

/** Restores every captured ISO value; used by downgrade and recovery tooling. */
function restoreUtcTimestampBackup(database) {
  const updateStatements = new Map()
  const transaction = database.prepare('BEGIN IMMEDIATE')
  transaction.run()
  try {
    for (const row of database.prepare('SELECT table_name, row_key, column_name, iso_value FROM timestamp_compat_backup').all()) {
      const target = timestampTargets.find((candidate) => candidate.table === row.table_name)
      if (!target || !target.columns.includes(row.column_name)) throw new Error('Timestamp backup contains an unknown target.')
      const statementKey = `${target.table}.${row.column_name}`
      let update = updateStatements.get(statementKey)
      if (!update) {
        update = database.prepare(`UPDATE ${target.table} SET ${row.column_name}=? WHERE ${target.key}=?`)
        updateStatements.set(statementKey, update)
      }
      update.run(row.iso_value, row.row_key)
    }
    database.exec('COMMIT;')
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

module.exports = { migrateUtcTimestampCompatibility, restoreUtcTimestampBackup, timestampTargets }
