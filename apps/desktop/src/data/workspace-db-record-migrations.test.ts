// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

interface MigrationDatabase {
  exec(source: string): void
}

const require = createRequire(import.meta.url)
const { migrateDatabaseRecords } = require('../../electron/migrations/database-records.cjs') as {
  migrateDatabaseRecords(database: MigrationDatabase, currentVersion: number): void
}

function migratedVersions(exec: ReturnType<typeof vi.fn>) {
  return exec.mock.calls.map(([source]) =>
    Number(String(source).match(/'schema_version', '(\d+)'/u)?.[1]),
  )
}

describe('database record migrations', () => {
  it('applies schema 14 through 18 in order to a schema 13 workspace', () => {
    const exec = vi.fn()

    migrateDatabaseRecords({ exec }, 13)

    expect(migratedVersions(exec)).toEqual([14, 15, 16, 17, 18])
  })

  it('resumes after the last committed schema without replaying older migrations', () => {
    const exec = vi.fn()

    migrateDatabaseRecords({ exec }, 16)

    expect(migratedVersions(exec)).toEqual([17, 18])
  })

  it('is a no-op when the record schema is current', () => {
    const exec = vi.fn()

    migrateDatabaseRecords({ exec }, 18)

    expect(exec).not.toHaveBeenCalled()
  })

  it('stops immediately when a migration transaction fails', () => {
    const exec = vi.fn((source: string) => {
      if (source.includes("'schema_version', '16'")) throw new Error('migration failed')
    })

    expect(() => migrateDatabaseRecords({ exec }, 13)).toThrow('migration failed')
    expect(migratedVersions(exec)).toEqual([14, 15, 16])
  })
})
