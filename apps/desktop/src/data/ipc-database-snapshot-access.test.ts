// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { sanitizeDatabaseSnapshot } = require('../../electron/ipc-database-snapshot-access.cjs') as {
  sanitizeDatabaseSnapshot(
    snapshot: Record<string, unknown>,
    canReadDatabase: (databaseId: string) => boolean,
  ): Record<string, unknown>
}

const snapshot = {
  schema: {
    id: 'source-db',
    name: '来源',
    properties: [
      { id: 'title', name: '标题', type: 'title' },
      {
        id: 'relation',
        name: '关联',
        type: 'relation',
        relation: { databaseId: 'secret-db' },
      },
      {
        id: 'rollup',
        name: '汇总',
        type: 'rollup',
        rollup: {
          relationPropertyId: 'relation',
          targetPropertyId: 'secret-title',
          aggregation: 'showOriginal',
        },
      },
      { id: 'formula', name: '公式', type: 'formula', formula: { expression: '[rollup]' } },
    ],
  },
  records: [
    {
      id: 'record-1',
      values: { title: '公开', relation: ['secret-record'], rollup: ['秘密'], formula: '秘密' },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    },
  ],
  views: [],
  activeViewId: '',
  templates: [
    {
      id: 'template-1',
      values: { title: '模板', relation: ['secret-record'], rollup: ['秘密'] },
    },
  ],
}

describe('database snapshot ACL projection', () => {
  it('keeps the original snapshot when every relation target is readable', () => {
    const canRead = vi.fn(() => true)
    expect(sanitizeDatabaseSnapshot(snapshot, canRead)).toBe(snapshot)
    expect(canRead).toHaveBeenCalledWith('secret-db')
  })

  it('redacts relation metadata, ids, rollups, formulas, and template values', () => {
    const safe = sanitizeDatabaseSnapshot(snapshot, () => false) as typeof snapshot
    const relation = safe.schema.properties.find((property) => property.id === 'relation')
    const rollup = safe.schema.properties.find((property) => property.id === 'rollup')

    expect(relation).not.toHaveProperty('relation')
    expect(rollup).not.toHaveProperty('rollup')
    expect(safe.records[0]?.values).toEqual({
      title: '公开',
      relation: null,
      rollup: null,
      formula: null,
    })
    expect(safe.templates[0]?.values).toEqual({
      title: '模板',
      relation: null,
      rollup: null,
    })
  })
})
