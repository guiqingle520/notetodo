// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerDatabaseViewIpc } = require('../../electron/ipc-database-view-register.cjs') as {
  registerDatabaseViewIpc(options: Record<string, unknown>): void
}

const channels = [
  'database:set-active-view',
  'database:update-view-config',
  'database:create-view',
  'database:rename-view',
  'database:delete-view',
  'database:set-default-view',
  'database:bulk-update',
  'database:import-records',
  'database:save-template',
  'database:delete-template',
  'database:create-from-template',
  'database:export-csv',
]

describe('database view IPC registration', () => {
  it('registers every view, template and export channel with an exact contract', () => {
    const handleTrusted = vi.fn()
    registerDatabaseViewIpc({ handleTrusted, database: {}, exportCsv: vi.fn() })

    expect(handleTrusted.mock.calls.map(([channel]) => channel)).toEqual(channels)
    for (const [, contract, listener] of handleTrusted.mock.calls) {
      expect(contract).toMatchObject({
        assertRequest: expect.any(Function),
        assertResponse: expect.any(Function),
      })
      expect(listener).toEqual(expect.any(Function))
    }
  })

  it('routes calls, returns database results and normalizes visible names', async () => {
    const handleTrusted = vi.fn()
    const database = {
      setActiveDatabaseView: vi.fn(),
      updateDatabaseViewConfig: vi.fn(),
      createDatabaseView: vi.fn(() => ({ kind: 'created' })),
      renameDatabaseView: vi.fn(() => ({ kind: 'renamed' })),
      deleteDatabaseView: vi.fn(),
      setDefaultDatabaseView: vi.fn(),
      bulkUpdateDatabaseRecords: vi.fn(),
      importDatabaseRecords: vi.fn(),
      saveDatabaseTemplate: vi.fn(),
      deleteDatabaseTemplate: vi.fn(),
      createDatabaseRecordFromTemplate: vi.fn(),
    }
    const exportCsv = vi.fn(async () => true)
    registerDatabaseViewIpc({ handleTrusted, database, exportCsv })
    const listener = (channel: string) =>
      handleTrusted.mock.calls.find(([registered]) => registered === channel)?.[2]
    const event = {}

    expect(
      listener('database:create-view')(event, 'database-1', 'view-1', ' 看板 ', 'board', {}),
    ).toEqual({ kind: 'created' })
    expect(database.createDatabaseView).toHaveBeenCalledWith(
      'database-1',
      'view-1',
      '看板',
      'board',
      {},
    )
    expect(listener('database:rename-view')(event, 'database-1', 'view-1', ' 新名称 ')).toEqual({
      kind: 'renamed',
    })
    expect(database.renameDatabaseView).toHaveBeenCalledWith('database-1', 'view-1', '新名称')
    const template = { id: 'template-1', name: ' 模板 ', values: {} }
    listener('database:save-template')(event, 'database-1', template)
    expect(database.saveDatabaseTemplate).toHaveBeenCalledWith('database-1', {
      ...template,
      name: '模板',
    })
    await expect(listener('database:export-csv')(event, '任务', 'a,b')).resolves.toBe(true)
    expect(exportCsv).toHaveBeenCalledWith('任务', 'a,b')
  })
})
