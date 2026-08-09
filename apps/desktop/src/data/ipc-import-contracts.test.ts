// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse?(value: unknown): void
}

const require = createRequire(import.meta.url)
const { assertImportProgress, importIpcContracts } =
  require('../../electron/ipc-import-contracts.cjs') as {
    assertImportProgress(value: unknown): void
    importIpcContracts: Record<'pickAndInspect' | 'start' | 'listJobs' | 'cancel', IpcContract>
  }
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    createImportJob(id: string, sourceName: string): void
    loadImportJobs(): unknown[]
    close(): void
  }
}

const inspection = {
  importId: 'import-1',
  fileName: 'Workspace.zip',
  compressedBytes: 8,
  acceptedBytes: 10,
  rejected: false,
  summary: { page: 1, database: 0, asset: 0, sitemap: 0, unsupported: 0 },
  entries: [{ path: 'Home.md', kind: 'page', size: 10 }],
  issues: [],
}

const result = {
  rootPageId: 'import-1-root',
  pageCount: 2,
  databaseCount: 1,
  importedPages: 1,
  importedDatabases: 1,
  importedAssets: 0,
  skippedAssets: 0,
  unsupported: 0,
  unresolvedLinks: 0,
}

describe('import IPC contracts', () => {
  it('accepts the preload request shapes and rejects extra arguments', () => {
    expect(() => importIpcContracts.pickAndInspect.assertRequest([])).not.toThrow()
    expect(() => importIpcContracts.start.assertRequest(['import-1', 'request-1'])).not.toThrow()
    expect(() => importIpcContracts.cancel.assertRequest(['request-1'])).not.toThrow()
    expect(() => importIpcContracts.start.assertRequest(['import-1'])).toThrow(/requires/)
    expect(() => importIpcContracts.cancel.assertRequest(['request-1', 'extra'])).toThrow(/one/)
    expect(() => importIpcContracts.start.assertRequest(['../archive', 'request-1'])).toThrow(
      /Invalid import id/,
    )
  })

  it('accepts a consistent inspection and rejects path disclosure or unsafe entries', () => {
    expect(() => importIpcContracts.pickAndInspect.assertResponse?.(inspection)).not.toThrow()
    expect(() => importIpcContracts.pickAndInspect.assertResponse?.(null)).not.toThrow()
    expect(() =>
      importIpcContracts.pickAndInspect.assertResponse?.({
        ...inspection,
        filePath: 'C:\\Users\\Alice\\Workspace.zip',
      }),
    ).toThrow(/fields/)
    expect(() =>
      importIpcContracts.pickAndInspect.assertResponse?.({
        ...inspection,
        entries: [{ ...inspection.entries[0], path: '../Home.md' }],
      }),
    ).toThrow(/Unsafe/)
    expect(() =>
      importIpcContracts.pickAndInspect.assertResponse?.({ ...inspection, acceptedBytes: 11 }),
    ).toThrow(/accepted bytes/)
    expect(() =>
      importIpcContracts.pickAndInspect.assertResponse?.({
        ...inspection,
        acceptedBytes: 20,
        summary: { ...inspection.summary, page: 2 },
        entries: [inspection.entries[0], { path: 'home.md', kind: 'page', size: 10 }],
      }),
    ).toThrow(/unique/)
    expect(() =>
      importIpcContracts.pickAndInspect.assertResponse?.({ ...inspection, rejected: true }),
    ).toThrow(/rejection state/)
  })

  it('requires result totals to agree with the committed report', () => {
    expect(() => importIpcContracts.start.assertResponse?.(result)).not.toThrow()
    expect(() =>
      importIpcContracts.start.assertResponse?.({ ...result, pageCount: result.pageCount + 1 }),
    ).toThrow(/page totals/)
    expect(() =>
      importIpcContracts.start.assertResponse?.({ ...result, internalBundle: {} }),
    ).toThrow(/fields/)
    expect(() =>
      importIpcContracts.start.assertResponse?.({
        ...result,
        pageCount: 50_001,
        importedPages: 50_000,
        databaseCount: 0,
        importedDatabases: 0,
      }),
    ).not.toThrow()
    expect(() =>
      importIpcContracts.start.assertResponse?.({ ...result, unresolvedLinks: 50_001 }),
    ).not.toThrow()
  })

  it('bounds dynamic progress events and keeps paths in the conversion phase only', () => {
    expect(() =>
      assertImportProgress({ phase: 'convert', completed: 1, total: 2, path: 'Home.md' }),
    ).not.toThrow()
    expect(() => assertImportProgress({ phase: 'commit', completed: 0, total: 1 })).not.toThrow()
    expect(() => assertImportProgress({ phase: 'convert', completed: 1, total: 2 })).toThrow(
      /requires/,
    )
    expect(() => assertImportProgress({ phase: 'done', completed: 2, total: 1 })).toThrow(/range/)
    expect(() =>
      assertImportProgress({ phase: 'convert', completed: 1, total: 1, path: 'C:\\secret.md' }),
    ).toThrow(/Unsafe/)
    class ForgedProgress {
      phase = 'commit'
      completed = 0
      total = 1
    }
    expect(() => assertImportProgress(new ForgedProgress())).toThrow(/prototype/)
  })

  it('matches the real persisted job projection without leaking reportJson', () => {
    const database = new WorkspaceDatabase(':memory:')
    try {
      database.createImportJob('import-job', 'Workspace.zip')
      const jobs = database.loadImportJobs()
      expect(Object.hasOwn(jobs[0] as object, 'reportJson')).toBe(false)
      expect(() => importIpcContracts.listJobs.assertResponse?.(jobs)).not.toThrow()
      expect(() =>
        importIpcContracts.listJobs.assertResponse?.([
          { ...(jobs[0] as object), report: { unresolvedLinks: 50_001 } },
        ]),
      ).not.toThrow()
      expect(() =>
        importIpcContracts.listJobs.assertResponse?.([
          { ...(jobs[0] as object), status: 'completed', report: { importedPages: 1 } },
        ]),
      ).toThrow(/complete report/)
      expect(() =>
        importIpcContracts.listJobs.assertResponse?.([
          { ...(jobs[0] as object), reportJson: '{}' },
        ]),
      ).toThrow(/fields/)
    } finally {
      database.close()
    }
  })
})
