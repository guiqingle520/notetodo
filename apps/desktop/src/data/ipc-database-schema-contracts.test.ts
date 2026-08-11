// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

type ContractName =
  | 'loadByPage'
  | 'create'
  | 'addProperty'
  | 'listSources'
  | 'updatePropertyConfig'
  | 'rename'
  | 'renameProperty'
  | 'reorderProperties'
  | 'deleteProperty'

const require = createRequire(import.meta.url)
const { databaseSchemaIpcContracts } =
  require('../../electron/ipc-database-schema-contracts.cjs') as {
    databaseSchemaIpcContracts: Record<ContractName, IpcContract>
  }
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    loadDatabaseByPage(pageId: string): unknown
    listDatabaseSources(): unknown
    close(): void
  }
}

const snapshot = {
  schema: {
    id: 'database-1',
    name: '项目资料',
    properties: [{ id: 'title-1', name: '名称', type: 'title' }],
  },
  records: [],
  views: [
    {
      id: 'view-1',
      databaseId: 'database-1',
      name: '默认表格',
      type: 'table',
      config: {},
    },
  ],
  activeViewId: 'view-1',
  templates: [],
}

describe('database schema IPC contracts', () => {
  it('accepts the real SQLite snapshot and source projections', () => {
    const database = new WorkspaceDatabase(':memory:')
    try {
      expect(() =>
        databaseSchemaIpcContracts.loadByPage.assertResponse(
          database.loadDatabaseByPage('projects'),
        ),
      ).not.toThrow()
      expect(() =>
        databaseSchemaIpcContracts.listSources.assertResponse(database.listDatabaseSources()),
      ).not.toThrow()
    } finally {
      database.close()
    }
  })

  it('accepts every preload request shape and rejects argument count drift', () => {
    const validRequests: Array<[ContractName, unknown[]]> = [
      ['loadByPage', ['page-1']],
      ['create', ['page-1', 'database-1', ' 项目资料 ']],
      ['addProperty', ['database-1', 'property-1', ' 负责人 ', 'text']],
      ['listSources', []],
      ['updatePropertyConfig', ['database-1', 'property-1', { constraints: {} }]],
      ['rename', ['database-1', ' 新名称 ']],
      ['renameProperty', ['database-1', 'property-1', ' 新属性 ']],
      ['reorderProperties', ['database-1', ['title-1', 'property-1']]],
      ['deleteProperty', ['database-1', 'property-1']],
    ]

    for (const [name, args] of validRequests) {
      expect(() => databaseSchemaIpcContracts[name].assertRequest(args)).not.toThrow()
      expect(() => databaseSchemaIpcContracts[name].assertRequest([...args, 'extra'])).toThrow(
        /argument count/,
      )
    }
  })

  it('enforces safe ids, canonical name bounds, and writable property types', () => {
    expect(() => databaseSchemaIpcContracts.loadByPage.assertRequest(['../page'])).toThrow(
      /page id/,
    )
    expect(() =>
      databaseSchemaIpcContracts.create.assertRequest(['page-1', 'database-1', '   ']),
    ).toThrow(/schema name/)
    expect(() =>
      databaseSchemaIpcContracts.create.assertRequest(['page-1', 'database-1', 'x'.repeat(201)]),
    ).toThrow(/schema name/)
    expect(() =>
      databaseSchemaIpcContracts.renameProperty.assertRequest([
        'database-1',
        'property-1',
        'x'.repeat(101),
      ]),
    ).toThrow(/property name/)
    expect(() =>
      databaseSchemaIpcContracts.addProperty.assertRequest([
        'database-1',
        'property-1',
        '第二标题',
        'title',
      ]),
    ).toThrow(/writable property type/)
  })

  it('strictly validates property configurations and reorder permutations', () => {
    expect(() =>
      databaseSchemaIpcContracts.updatePropertyConfig.assertRequest([
        'database-1',
        'property-1',
        {
          options: [{ id: 'option-1', name: '进行中', color: 'green' }],
          constraints: { required: true, defaultValue: 'option-1' },
        },
      ]),
    ).not.toThrow()
    expect(() =>
      databaseSchemaIpcContracts.updatePropertyConfig.assertRequest([
        'database-1',
        'property-1',
        { internalSql: 'SELECT 1' },
      ]),
    ).toThrow(/fields/)
    expect(() =>
      databaseSchemaIpcContracts.updatePropertyConfig.assertRequest([
        'database-1',
        'property-1',
        { formula: { expression: 'x'.repeat(1_001) } },
      ]),
    ).toThrow(/formula expression/)
    expect(() =>
      databaseSchemaIpcContracts.reorderProperties.assertRequest(['database-1', []]),
    ).toThrow(/property order/)
    expect(() =>
      databaseSchemaIpcContracts.reorderProperties.assertRequest([
        'database-1',
        ['title-1', 'title-1'],
      ]),
    ).toThrow(/unique/)
    expect(() =>
      databaseSchemaIpcContracts.reorderProperties.assertRequest([
        'database-1',
        Array.from({ length: 51 }, (_, index) => `property-${index}`),
      ]),
    ).toThrow(/property order/)
  })

  it('uses snapshot, nullable snapshot, and source response validators', () => {
    expect(() => databaseSchemaIpcContracts.loadByPage.assertResponse(null)).not.toThrow()
    expect(() => databaseSchemaIpcContracts.loadByPage.assertResponse(snapshot)).not.toThrow()
    expect(() => databaseSchemaIpcContracts.create.assertResponse(snapshot)).not.toThrow()
    expect(() => databaseSchemaIpcContracts.create.assertResponse(null)).toThrow()
    expect(() =>
      databaseSchemaIpcContracts.create.assertResponse({ ...snapshot, internalRows: [] }),
    ).toThrow(/fields/)

    const sources = [
      {
        id: 'database-1',
        pageId: 'page-1',
        name: '项目资料',
        pageTitle: '项目主页',
        recordCount: 12,
      },
    ]
    expect(() => databaseSchemaIpcContracts.listSources.assertResponse(sources)).not.toThrow()
    expect(() =>
      databaseSchemaIpcContracts.listSources.assertResponse([{ ...sources[0], recordCount: -1 }]),
    ).toThrow(/record count/)
    expect(() =>
      databaseSchemaIpcContracts.listSources.assertResponse([
        { ...sources[0], databasePath: 'C:\\private.db' },
      ]),
    ).toThrow(/fields/)
  })
})
