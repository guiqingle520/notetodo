// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { registerDatabaseSchemaIpc } =
  require('../../electron/ipc-database-schema-register.cjs') as {
    registerDatabaseSchemaIpc(
      register: (
        channel: string,
        contract: unknown,
        listener: (...args: unknown[]) => unknown,
      ) => void,
      database: Record<string, (...args: unknown[]) => unknown>,
    ): void
  }

describe('database schema IPC registration', () => {
  it('registers all schema channels with contracts and thin normalized adapters', () => {
    const registrations = new Map<
      string,
      { contract: unknown; listener: (...args: unknown[]) => unknown }
    >()
    const result = { schema: { id: 'database-1' } }
    const database = {
      loadDatabaseByPage: vi.fn(() => null),
      createDatabaseForPage: vi.fn(() => result),
      addDatabaseProperty: vi.fn(() => result),
      listDatabaseSources: vi.fn(() => []),
      updateDatabasePropertyConfig: vi.fn(() => result),
      renameDatabase: vi.fn(() => result),
      renameDatabaseProperty: vi.fn(() => result),
      reorderDatabaseProperties: vi.fn(() => result),
      deleteDatabaseProperty: vi.fn(() => result),
    }
    registerDatabaseSchemaIpc((channel, contract, listener) => {
      registrations.set(channel, { contract, listener })
    }, database)

    expect([...registrations.keys()]).toEqual([
      'database:load-by-page',
      'database:create',
      'database:add-property',
      'database:list-sources',
      'database:update-property-config',
      'database:rename',
      'database:rename-property',
      'database:reorder-properties',
      'database:delete-property',
    ])
    for (const { contract } of registrations.values()) {
      expect(contract).toMatchObject({
        assertRequest: expect.any(Function),
        assertResponse: expect.any(Function),
      })
    }

    const event = {}
    const config = { constraints: { required: false } }
    const propertyIds = ['title-1', 'property-1']
    registrations.get('database:load-by-page')?.listener(event, 'page-1')
    registrations.get('database:create')?.listener(event, 'page-1', 'database-1', '  项目资料  ')
    registrations
      .get('database:add-property')
      ?.listener(event, 'database-1', 'property-1', ' 负责人 ', 'text')
    registrations.get('database:list-sources')?.listener(event)
    registrations
      .get('database:update-property-config')
      ?.listener(event, 'database-1', 'property-1', config)
    registrations.get('database:rename')?.listener(event, 'database-1', ' 新资料库 ')
    registrations
      .get('database:rename-property')
      ?.listener(event, 'database-1', 'property-1', ' 新负责人 ')
    registrations.get('database:reorder-properties')?.listener(event, 'database-1', propertyIds)
    registrations.get('database:delete-property')?.listener(event, 'database-1', 'property-1')

    expect(database.loadDatabaseByPage).toHaveBeenCalledWith('page-1')
    expect(database.createDatabaseForPage).toHaveBeenCalledWith('page-1', 'database-1', '项目资料')
    expect(database.addDatabaseProperty).toHaveBeenCalledWith(
      'database-1',
      'property-1',
      '负责人',
      'text',
    )
    expect(database.listDatabaseSources).toHaveBeenCalledOnce()
    expect(database.updateDatabasePropertyConfig).toHaveBeenCalledWith(
      'database-1',
      'property-1',
      config,
    )
    expect(database.renameDatabase).toHaveBeenCalledWith('database-1', '新资料库')
    expect(database.renameDatabaseProperty).toHaveBeenCalledWith(
      'database-1',
      'property-1',
      '新负责人',
    )
    expect(database.reorderDatabaseProperties).toHaveBeenCalledWith('database-1', propertyIds)
    expect(database.deleteDatabaseProperty).toHaveBeenCalledWith('database-1', 'property-1')
  })
})
