// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse?(value: unknown): void
}

const require = createRequire(import.meta.url)
const { databaseViewIpcContracts } = require('../../electron/ipc-database-view-contracts.cjs') as {
  databaseViewIpcContracts: Record<
    | 'setActiveView'
    | 'updateViewConfig'
    | 'createView'
    | 'renameView'
    | 'deleteView'
    | 'setDefaultView'
    | 'bulkUpdate'
    | 'importRecords'
    | 'saveTemplate'
    | 'deleteTemplate'
    | 'createFromTemplate'
    | 'exportCsv',
    IpcContract
  >
}

const template = {
  id: 'template-1',
  databaseId: 'database-1',
  name: '待办模板',
  values: { 'property-1': '标题' },
  content: '<p>正文</p>',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

describe('database view IPC contracts', () => {
  it('accepts exact view requests and rejects transport-only extras', () => {
    expect(() =>
      databaseViewIpcContracts.createView.assertRequest([
        'database-1',
        'view-1',
        ' 看板 ',
        'board',
        { sorts: [{ propertyId: 'property-1', direction: 'asc' }] },
      ]),
    ).not.toThrow()
    expect(() =>
      databaseViewIpcContracts.updateViewConfig.assertRequest([
        'database-1',
        'view-1',
        { freezeFirstColumn: true, propertyWidths: { 'property-1': 240 } },
      ]),
    ).not.toThrow()
    expect(() =>
      databaseViewIpcContracts.setActiveView.assertRequest(['database-1', 'view-1', 'extra']),
    ).toThrow(/argument count/)
    expect(() =>
      databaseViewIpcContracts.createView.assertRequest([
        'database-1',
        'view-1',
        '看板',
        'unknown',
        {},
      ]),
    ).toThrow(/view type/)
  })

  it('validates nested view configuration instead of persisting arbitrary JSON', () => {
    expect(() =>
      databaseViewIpcContracts.updateViewConfig.assertRequest([
        'database-1',
        'view-1',
        { filters: [{ propertyId: 'property-1', operator: 'contains', value: '紧急' }] },
      ]),
    ).not.toThrow()
    expect(() =>
      databaseViewIpcContracts.updateViewConfig.assertRequest([
        'database-1',
        'view-1',
        { filters: [{ propertyId: 'property-1', operator: 'contains', internal: true }] },
      ]),
    ).toThrow(/fields/)
    expect(() =>
      databaseViewIpcContracts.updateViewConfig.assertRequest([
        'database-1',
        'view-1',
        { propertyWidths: { 'property-1': 20 } },
      ]),
    ).toThrow(/width/)
    expect(() =>
      databaseViewIpcContracts.updateViewConfig.assertRequest([
        'database-1',
        'view-1',
        { freezeFirstColumn: 'false' },
      ]),
    ).toThrow(/freeze/)
  })

  it('bounds bulk updates and imported values before opening a transaction', () => {
    expect(() =>
      databaseViewIpcContracts.bulkUpdate.assertRequest([
        'database-1',
        ['record-1', 'record-2'],
        'property-1',
        ['option-1', 'option-2'],
      ]),
    ).not.toThrow()
    expect(() =>
      databaseViewIpcContracts.bulkUpdate.assertRequest([
        'database-1',
        ['record-1', 'record-1'],
        'property-1',
        'value',
      ]),
    ).toThrow(/unique/)
    expect(() =>
      databaseViewIpcContracts.importRecords.assertRequest([
        'database-1',
        [{ id: 'record-1', values: { 'property-1': '内容' } }],
      ]),
    ).not.toThrow()
    expect(() =>
      databaseViewIpcContracts.importRecords.assertRequest([
        'database-1',
        [{ id: 'record-1', values: { 'property-1': { nested: true } } }],
      ]),
    ).toThrow(/multi-value/)
    expect(() =>
      databaseViewIpcContracts.importRecords.assertRequest([
        'database-1',
        [
          { id: 'record-1', values: {} },
          { id: 'record-1', values: {} },
        ],
      ]),
    ).toThrow(/unique/)
    expect(() =>
      databaseViewIpcContracts.importRecords.assertRequest([
        'database-1',
        Array.from({ length: 10_001 }, (_, index) => ({ id: `record-${index}`, values: {} })),
      ]),
    ).toThrow(/10,000/)
  })

  it('requires a complete template owned by the target database', () => {
    expect(() =>
      databaseViewIpcContracts.saveTemplate.assertRequest(['database-1', template]),
    ).not.toThrow()
    expect(() =>
      databaseViewIpcContracts.saveTemplate.assertRequest([
        'database-1',
        { ...template, databaseId: 'database-2' },
      ]),
    ).toThrow(/another schema/)
    expect(() =>
      databaseViewIpcContracts.saveTemplate.assertRequest([
        'database-1',
        { ...template, createdAt: 'not-a-date' },
      ]),
    ).toThrow(/creation time/)
    expect(() =>
      databaseViewIpcContracts.saveTemplate.assertRequest([
        'database-1',
        { ...template, internal: true },
      ]),
    ).toThrow(/fields/)
  })

  it('bounds CSV export and validates its boolean response', () => {
    expect(() =>
      databaseViewIpcContracts.exportCsv.assertRequest(['任务列表', '标题,状态\n任务,完成']),
    ).not.toThrow()
    expect(() => databaseViewIpcContracts.exportCsv.assertRequest(['name'])).toThrow(
      /argument count/,
    )
    expect(() => databaseViewIpcContracts.exportCsv.assertResponse?.(true)).not.toThrow()
    expect(() => databaseViewIpcContracts.exportCsv.assertResponse?.('true')).toThrow(/boolean/)
  })
})
