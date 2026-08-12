// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceDatabase } from './workspace-db-test-harness'

const require = createRequire(import.meta.url)
const { restoreUtcTimestampBackup } = require('../../electron/migrations/utc-timestamps.cjs') as {
  restoreUtcTimestampBackup(database: {
    prepare(source: string): unknown
    exec(source: string): void
  }): void
}

let workspace: InstanceType<typeof WorkspaceDatabase> | undefined
let temporaryDirectory: string | undefined
afterEach(() => {
  workspace?.close()
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true })
})

describe('UTC timestamp compatibility migration', () => {
  it('backfills safe Unix milliseconds while keeping ISO values authoritative', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'notetodo-utc-migration-'))
    const databasePath = join(temporaryDirectory, 'workspace.db')
    workspace = new WorkspaceDatabase(databasePath)
    workspace.close()
    workspace = undefined

    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (path: string) => { exec(source: string): void; close(): void }
    }
    const legacy = new DatabaseSync(databasePath)
    legacy.exec(`
      DROP TABLE timestamp_compat_backup;
      DROP TABLE timestamp_migration_state;
      UPDATE app_meta SET value='18' WHERE key='schema_version';
    `)
    legacy.close()

    workspace = new WorkspaceDatabase(databasePath)
    const internal = workspace as unknown as {
      database: {
        prepare(source: string): {
          get(...values: unknown[]): Record<string, unknown> | undefined
          run(...values: unknown[]): void
        }
        exec(source: string): void
      }
    }
    const version = internal.database
      .prepare("SELECT value FROM app_meta WHERE key='schema_version'")
      .get()
    const state = internal.database
      .prepare('SELECT mode, backfilled_at_ms AS backfilledAtMs FROM timestamp_migration_state')
      .get()
    const backup = internal.database
      .prepare(
        "SELECT iso_value AS isoValue, unix_ms AS unixMs FROM timestamp_compat_backup WHERE table_name='pages' AND row_key='welcome' AND column_name='updated_at'",
      )
      .get()
    expect(version?.value).toBe('20')
    expect(state?.mode).toBe('iso-primary')
    expect(Number.isSafeInteger(state?.backfilledAtMs)).toBe(true)
    expect(new Date(Number(backup?.unixMs)).toISOString()).toBe(backup?.isoValue)

    internal.database
      .prepare("UPDATE pages SET updated_at='2030-01-01T00:00:00.000Z' WHERE id='welcome'")
      .run()
    restoreUtcTimestampBackup(internal.database)
    expect(
      internal.database
        .prepare("SELECT updated_at AS updatedAt FROM pages WHERE id='welcome'")
        .get()?.updatedAt,
    ).toBe(backup?.isoValue)
  })
})
