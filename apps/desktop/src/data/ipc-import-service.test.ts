// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createImportIpcService } = require('../../electron/ipc-import-service.cjs') as {
  createImportIpcService(options: Record<string, unknown>): {
    pickAndInspect(): Promise<null | Record<string, unknown>>
    start(event: unknown, importId: string, requestId: string): Promise<Record<string, unknown>>
    cancel(requestId: string): void
    listJobs(): unknown[]
  }
}

const sourcePath = 'C:\\Users\\Alice\\Private\\Workspace.zip'
const archiveInspection = {
  fileName: 'Workspace.zip',
  compressedBytes: 8,
  acceptedBytes: 10,
  rejected: false,
  summary: { page: 1, database: 0, asset: 0, sitemap: 0, unsupported: 0 },
  entries: [{ path: 'Home.md', kind: 'page', size: 10 }],
  issues: [],
}
const importResult = {
  rootPageId: 'import-1-root',
  pageCount: 2,
  databaseCount: 0,
  importedPages: 1,
  importedDatabases: 0,
  importedAssets: 0,
  skippedAssets: 0,
  unsupported: 0,
  unresolvedLinks: 0,
}
const importBundle = {
  importId: 'import-1',
  pages: [{ id: 'import-1-root' }, { id: 'import-1-page' }],
  databases: [],
  attachments: [],
  report: {
    importedPages: 1,
    importedDatabases: 0,
    importedAssets: 0,
    skippedAssets: 0,
    unsupported: 0,
    unresolvedLinks: 0,
  },
}

function createHarness(overrides: Record<string, unknown> = {}) {
  const database = {
    createImportJob: vi.fn(),
    updateImportJob: vi.fn(),
    importWorkspaceBundle: vi.fn(() => importResult),
    loadImportJobs: vi.fn((): unknown[] => []),
  }
  const sender = { isDestroyed: vi.fn(() => false), send: vi.fn() }
  const assetStaging = {
    prepare: vi.fn(async (importId: string) => ({
      directory: `C:\\AppData\\NoteTodo\\attachments\\.import-staging\\${importId}`,
      createdPaths: [],
    })),
    promote: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => undefined),
  }
  const convertArchive = vi.fn(async (_path: string, options: Record<string, unknown>) => {
    const onProgress = options.onProgress as (progress: Record<string, unknown>) => void
    onProgress({ phase: 'convert', completed: 1, total: 1, path: 'Home.md' })
    return importBundle
  })
  const service = createImportIpcService({
    database,
    dialogApi: {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [sourcePath] })),
    },
    inspectArchive: vi.fn(async () => archiveInspection),
    convertArchive,
    createId: () => 'import-1',
    assetStoreDir: 'C:\\AppData\\NoteTodo\\attachments',
    assetStaging,
    now: () => 1_000,
    ...overrides,
  })
  return { service, database, sender, convertArchive, assetStaging }
}

describe('import IPC service', () => {
  it('returns null when selection is cancelled without inspecting a path', async () => {
    const inspectArchive = vi.fn()
    const { service } = createHarness({
      dialogApi: {
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      },
      inspectArchive,
    })
    await expect(service.pickAndInspect()).resolves.toBeNull()
    expect(inspectArchive).not.toHaveBeenCalled()
  })

  it('keeps the selected local path behind an opaque id and emits validated progress', async () => {
    const { service, database, sender, convertArchive, assetStaging } = createHarness()
    const inspected = await service.pickAndInspect()
    expect(inspected).toEqual({ ...archiveInspection, importId: 'import-1' })
    expect(JSON.stringify(inspected)).not.toContain(sourcePath)

    await expect(service.start({ sender }, 'import-1', 'request-1')).resolves.toEqual(importResult)
    expect(database.createImportJob).toHaveBeenCalledWith('import-1', 'Workspace.zip')
    expect(convertArchive).toHaveBeenCalledWith(
      sourcePath,
      expect.objectContaining({
        importId: 'import-1',
        assetStoreDir: 'C:\\AppData\\NoteTodo\\attachments\\.import-staging\\import-1',
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    )
    expect(sender.send.mock.calls).toEqual([
      ['import:progress:request-1', { phase: 'convert', completed: 1, total: 1, path: 'Home.md' }],
      ['import:progress:request-1', { phase: 'commit', completed: 0, total: 1 }],
      ['import:progress:request-1', { phase: 'done', completed: 1, total: 1 }],
    ])
    expect(database.updateImportJob).toHaveBeenCalledWith('import-1', 'committing')
    expect(database.importWorkspaceBundle).toHaveBeenCalledWith(importBundle)
    expect(assetStaging.promote).toHaveBeenCalledWith(
      expect.objectContaining({ directory: expect.stringContaining('.import-staging') }),
      [],
      expect.any(AbortSignal),
    )
    expect(assetStaging.cleanup).toHaveBeenCalledWith(expect.any(Object), { rollback: false })
  })

  it('projects import-core metadata instead of forwarding privileged or future fields', async () => {
    const { service } = createHarness({
      inspectArchive: vi.fn(async () => ({
        ...archiveInspection,
        filePath: sourcePath,
        internalReader: { path: sourcePath },
        entries: [{ ...archiveInspection.entries[0], internalOffset: 42 }],
      })),
    })
    const inspected = await service.pickAndInspect()
    expect(inspected).toEqual({ ...archiveInspection, importId: 'import-1' })
    expect(JSON.stringify(inspected)).not.toContain('internal')
    expect(JSON.stringify(inspected)).not.toContain(sourcePath)
  })

  it('sanitizes unsafe issue labels while preserving a rejected preflight report', async () => {
    const rejectedInspection = {
      ...archiveInspection,
      acceptedBytes: 0,
      rejected: true,
      summary: { page: 0, database: 0, asset: 0, sitemap: 0, unsupported: 0 },
      entries: [],
      issues: [{ code: 'UNSAFE_PATH', path: 'bad\nname.md', message: '路径不安全。' }],
    }
    const { service } = createHarness({
      inspectArchive: vi.fn(async () => rejectedInspection),
    })
    await expect(service.pickAndInspect()).resolves.toMatchObject({
      rejected: true,
      issues: [{ code: 'UNSAFE_PATH', path: 'bad�name.md', message: '路径不安全。' }],
    })
  })

  it('redacts a selected path when archive inspection itself fails', async () => {
    const { service } = createHarness({
      inspectArchive: vi.fn(async () => {
        throw new Error(`ENOENT: cannot inspect ${sourcePath}`)
      }),
    })
    let failure: unknown
    try {
      await service.pickAndInspect()
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('Workspace.zip')
    expect((failure as Error).message).not.toContain(sourcePath)
  })

  it('redacts the privileged source path from failures sent to the renderer and database', async () => {
    const convertArchive = vi.fn(async () => {
      throw new Error(`ENOENT: cannot open ${sourcePath}`)
    })
    const { service, database, sender, assetStaging } = createHarness({ convertArchive })
    await service.pickAndInspect()

    let failure: unknown
    try {
      await service.start({ sender }, 'import-1', 'request-1')
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).not.toContain(sourcePath)
    const storedMessage = database.updateImportJob.mock.calls[0]?.[2] as string
    expect(storedMessage).toContain('Workspace.zip')
    expect(storedMessage).not.toContain(sourcePath)
    expect(database.updateImportJob).toHaveBeenCalledWith('import-1', 'failed', storedMessage)
    expect(assetStaging.cleanup).toHaveBeenCalledWith(expect.any(Object), { rollback: true })
  })

  it('treats replacement tokens literally and redacts the attachment store path', async () => {
    const tokenPath = 'C:\\Users\\Alice\\Private\\$&.zip'
    const assetStoreDir = 'C:\\Users\\Alice\\AppData\\NoteTodo\\attachments'
    const convertArchive = vi.fn(async () => {
      throw new Error(`cannot read ${tokenPath}; cannot write ${assetStoreDir}`)
    })
    const { service, sender } = createHarness({
      dialogApi: {
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: [tokenPath] })),
      },
      assetStoreDir,
      convertArchive,
    })
    await service.pickAndInspect()
    let failure: unknown
    try {
      await service.start({ sender }, 'import-1', 'request-1')
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('$&.zip')
    expect((failure as Error).message).not.toContain('C:\\Users')
  })

  it('preserves the original redacted conversion error when status persistence also fails', async () => {
    const convertArchive = vi.fn(async () => {
      throw new Error(`cannot read ${sourcePath}`)
    })
    const { service, database, sender } = createHarness({ convertArchive })
    database.updateImportJob.mockImplementation(() => {
      throw new Error(`database write failed at ${sourcePath}`)
    })
    await service.pickAndInspect()
    await expect(service.start({ sender }, 'import-1', 'request-1')).rejects.toThrow(
      'cannot read Workspace.zip',
    )
  })

  it('keeps a committed import successful when progress delivery races renderer shutdown', async () => {
    const { service, database, sender } = createHarness()
    sender.send.mockImplementation(() => {
      throw new Error('Render frame was disposed')
    })
    await service.pickAndInspect()
    await expect(service.start({ sender }, 'import-1', 'request-1')).resolves.toEqual(importResult)
    expect(database.importWorkspaceBundle).toHaveBeenCalledOnce()
    expect(database.updateImportJob).toHaveBeenCalledTimes(1)
    expect(database.updateImportJob).toHaveBeenCalledWith('import-1', 'committing')
  })

  it('does not overwrite a pre-existing job when job creation fails', async () => {
    const { service, database, sender } = createHarness()
    database.createImportJob.mockImplementationOnce(() => {
      throw new Error('UNIQUE constraint failed')
    })
    await service.pickAndInspect()
    await expect(service.start({ sender }, 'import-1', 'request-1')).rejects.toThrow(/UNIQUE/)
    expect(database.updateImportJob).not.toHaveBeenCalled()
  })

  it('rejects an incomplete bundle response before promoting assets or committing SQLite', async () => {
    const convertArchive = vi.fn(async () => ({
      ...importBundle,
      report: { importedPages: 1 },
    }))
    const { service, database, sender, assetStaging } = createHarness({ convertArchive })
    await service.pickAndInspect()
    await expect(service.start({ sender }, 'import-1', 'request-1')).rejects.toThrow(
      /Invalid import result/,
    )
    expect(assetStaging.promote).not.toHaveBeenCalled()
    expect(database.importWorkspaceBundle).not.toHaveBeenCalled()
    expect(assetStaging.cleanup).toHaveBeenCalledWith(expect.any(Object), { rollback: true })
  })

  it('prevents concurrent consumption of one source and records explicit cancellation', async () => {
    const convertArchive = vi.fn(
      (_path: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('IMPORT_CANCELLED')), {
            once: true,
          })
        }),
    )
    const { service, database, sender } = createHarness({ convertArchive })
    await service.pickAndInspect()
    const first = service.start({ sender }, 'import-1', 'request-1')
    await expect(service.start({ sender }, 'import-1', 'request-2')).rejects.toThrow(/正在导入/)
    service.cancel('request-1')
    await expect(first).rejects.toThrow('IMPORT_CANCELLED')
    expect(database.createImportJob).toHaveBeenCalledOnce()
    expect(database.updateImportJob).toHaveBeenCalledWith(
      'import-1',
      'cancelled',
      'IMPORT_CANCELLED',
    )
  })

  it('expires inspected paths before any database mutation', async () => {
    let currentTime = 1_000
    const { service, database, sender } = createHarness({ now: () => currentTime })
    await service.pickAndInspect()
    currentTime += 30 * 60_000 + 1
    await expect(service.start({ sender }, 'import-1', 'request-1')).rejects.toThrow(/已过期/)
    expect(database.createImportJob).not.toHaveBeenCalled()
  })

  it('redacts absolute paths from historical job diagnostics', () => {
    const { service, database } = createHarness()
    database.loadImportJobs.mockReturnValue([
      {
        id: 'import-old',
        sourceName: 'C:\\Users\\Alice\\Private\\Old.zip',
        status: 'failed',
        report: {},
        reportJson: '{}',
        errorMessage: "ENOENT: open 'C:\\Users\\Alice\\Private\\Old.zip'",
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T00:00:01.000Z',
      },
    ])
    const jobs = service.listJobs() as Array<Record<string, unknown>>
    expect(jobs[0]?.sourceName).toBe('Old.zip')
    expect(jobs[0]?.errorMessage).not.toContain('C:\\Users')
    expect(jobs[0]).not.toHaveProperty('reportJson')
  })
})
