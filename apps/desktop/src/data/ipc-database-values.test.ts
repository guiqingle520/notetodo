// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  assertArgumentCount,
  assertDatabaseProperty,
  assertId,
  assertIdArray,
  assertJsonLength,
  assertPropertyConfig,
  assertPropertyValue,
  assertPropertyValues,
  assertRequiredText,
  assertViewConfig,
  assertVoidResponse,
} = require('../../electron/ipc-database-values.cjs') as {
  assertArgumentCount(args: unknown[], minimum: number, maximum?: number): void
  assertDatabaseProperty(value: unknown): void
  assertId(value: unknown, label?: string): void
  assertIdArray(
    value: unknown,
    options?: { minimum?: number; maximum?: number; label?: string },
  ): void
  assertJsonLength(value: unknown, maximumLength: number, label: string): void
  assertPropertyConfig(value: unknown, options?: { maximumJsonLength?: number }): void
  assertPropertyValue(value: unknown, options?: { maximumStringLength?: number }): void
  assertPropertyValues(
    value: unknown,
    options?: { maximumProperties?: number; maximumJsonLength?: number },
  ): void
  assertRequiredText(value: unknown, maximumLength: number, label: string): void
  assertViewConfig(value: unknown, options?: { maximumJsonLength?: number }): void
  assertVoidResponse(value: unknown): void
}

describe('database IPC shared value validators', () => {
  it('enforces exact argument ranges and canonical identifiers', () => {
    expect(() => assertArgumentCount(['database-1'], 1)).not.toThrow()
    expect(() => assertArgumentCount(['database-1'], 1, 2)).not.toThrow()
    expect(() => assertArgumentCount([], 1)).toThrow(/argument count/)
    expect(() => assertArgumentCount(['one', 'two', 'three'], 1, 2)).toThrow(/argument count/)

    for (const id of ['database-1', 'Property_2', 'A0']) {
      expect(() => assertId(id)).not.toThrow()
    }
    for (const id of [
      '',
      ' database-1',
      '../database',
      'database.1',
      'line\nbreak',
      'x'.repeat(129),
    ]) {
      expect(() => assertId(id)).toThrow(/identifier/)
    }
  })

  it('rejects duplicate, unsafe, and oversized identifier collections', () => {
    expect(() =>
      assertIdArray(['record-1', 'record-2'], {
        minimum: 1,
        maximum: 2,
        label: 'record ids',
      }),
    ).not.toThrow()
    expect(() => assertIdArray([], { minimum: 1, label: 'record ids' })).toThrow(/record ids/)
    expect(() => assertIdArray(['record-1', 'record-1'], { label: 'record ids' })).toThrow(/unique/)
    expect(() => assertIdArray(['record-1', '../record'], { label: 'record ids' })).toThrow(
      /record ids/,
    )
    expect(() =>
      assertIdArray(['record-1', 'record-2', 'record-3'], {
        maximum: 2,
        label: 'record ids',
      }),
    ).toThrow(/record ids/)
  })

  it('bounds user-facing text and every property value variant', () => {
    expect(() => assertRequiredText('  项目资料  ', 20, 'name')).not.toThrow()
    expect(() => assertRequiredText('   ', 20, 'name')).toThrow(/name/)
    expect(() => assertRequiredText('unsafe\u0000text', 20, 'name')).toThrow(/name/)

    for (const value of [null, false, 0, 12.5, '文本', ['one', 'two']]) {
      expect(() => assertPropertyValue(value)).not.toThrow()
    }
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, {}, ['same', 'same']]) {
      expect(() => assertPropertyValue(value)).toThrow()
    }
    expect(() => assertPropertyValue('12345', { maximumStringLength: 4 })).toThrow(/too large/)
    expect(() =>
      assertPropertyValue(Array.from({ length: 101 }, (_, index) => `${index}`)),
    ).toThrow(/multi-value/)
    expect(() => assertPropertyValue(['x'.repeat(1_001)])).toThrow(/multi-value/)
  })

  it('bounds property maps by safe keys, entry count, and serialized size', () => {
    expect(() => assertPropertyValues({ title: '发布', score: 3, tags: ['urgent'] })).not.toThrow()
    expect(() => assertPropertyValues({ '../title': '发布' })).toThrow(/property id/)
    expect(() =>
      assertPropertyValues(
        { title: '发布', score: 3 },
        { maximumProperties: 1, maximumJsonLength: 100 },
      ),
    ).toThrow(/collection is too large/)
    expect(() =>
      assertPropertyValues({ title: 'x'.repeat(20) }, { maximumJsonLength: 10 }),
    ).toThrow(/property values is too large/)
  })

  it('validates select options and typed property configuration without over-posting', () => {
    const options = [
      { id: 'todo', name: '待开始', color: 'slate' },
      { id: 'done', name: '已完成', color: 'green' },
    ]
    const config = {
      options,
      constraints: { required: true, defaultValue: 'todo' },
    }
    expect(() => assertPropertyConfig(config)).not.toThrow()
    expect(() => assertPropertyConfig({ options: [{ ...options[0], sql: 'hidden' }] })).toThrow(
      /fields/,
    )
    expect(() =>
      assertPropertyConfig({ options: [options[0], { ...options[1], id: 'todo' }] }),
    ).toThrow(/unique/)
    expect(() =>
      assertPropertyConfig({ options: [options[0], { ...options[1], name: '待开始' }] }),
    ).toThrow(/unique/)
    expect(() =>
      assertPropertyConfig({ options: [{ ...options[0], color: 'transparent' }] }),
    ).toThrow(/color/)
    expect(() => assertPropertyConfig({ ...config, internalSql: 'SELECT 1' })).toThrow(/fields/)
    expect(() => assertPropertyConfig({ formula: { expression: '   ' } })).toThrow(/expression/)
    expect(() => assertPropertyConfig({ constraints: { required: 'yes' } })).toThrow(
      /constraint flag/,
    )

    expect(() =>
      assertDatabaseProperty({ id: 'status', name: '状态', type: 'select', options }),
    ).not.toThrow()
    expect(() =>
      assertDatabaseProperty({ id: 'owner', name: '负责人', type: 'text', options }),
    ).toThrow(/do not match/)
    expect(() =>
      assertDatabaseProperty({
        id: 'relation',
        name: '关联',
        type: 'relation',
        relation: { databaseId: 'target-db', reciprocalPropertyId: '../property' },
      }),
    ).toThrow(/reciprocal property id/)
  })

  it('validates complete view rules and rejects expensive or malformed layouts', () => {
    const config = {
      filters: [{ propertyId: 'status', operator: 'equals', value: 'doing' }],
      quickFilters: [{ propertyId: 'owner', operator: 'contains', value: 'Lin' }],
      filterMode: 'and',
      sorts: [{ propertyId: 'score', direction: 'desc' }],
      groupByPropertyId: 'status',
      collapsedGroupKeys: ['done'],
      recordOrder: ['record-2', 'record-1'],
      visiblePropertyIds: ['title', 'status'],
      propertyWidths: { title: 260 },
      rowHeight: 'compact',
      propertyOrder: ['title', 'status'],
      freezeFirstColumn: true,
      calculations: { score: 'average' },
      cardSize: 'medium',
    }
    expect(() => assertViewConfig(config)).not.toThrow()
    expect(() => assertViewConfig({ ...config, internalState: true })).toThrow(/fields/)
    expect(() =>
      assertViewConfig({ filters: [{ propertyId: 'status', operator: 'execute' }] }),
    ).toThrow(/operator/)
    expect(() =>
      assertViewConfig({ sorts: [{ propertyId: 'score', direction: 'random' }] }),
    ).toThrow(/direction/)
    expect(() => assertViewConfig({ propertyWidths: { title: 39 } })).toThrow(/width/)
    expect(() => assertViewConfig({ calculations: { score: 'eval' } })).toThrow(/calculation/)
    expect(() => assertViewConfig({ recordOrder: ['record-1', 'record-1'] })).toThrow(/unique/)
    expect(() =>
      assertViewConfig({ filters: Array.from({ length: 21 }, () => config.filters[0]) }),
    ).toThrow(/filters/)
  })

  it('rejects non-JSON payloads and unexpected mutation responses', () => {
    expect(() => assertJsonLength({ title: 'ok' }, 20, 'payload')).not.toThrow()
    expect(() => assertJsonLength({ title: 'x'.repeat(20) }, 10, 'payload')).toThrow(/too large/)
    expect(() => assertJsonLength({ value: 1n }, 100, 'payload')).toThrow(TypeError)
    expect(() => assertVoidResponse(undefined)).not.toThrow()
    expect(() => assertVoidResponse(null)).toThrow(/must not return/)
  })
})
