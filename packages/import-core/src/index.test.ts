import { describe, expect, it } from 'vitest'
import { discoverLocalLinks, normalizeArchivePath, parseCsvTable, planImportArchive } from './index'

describe('Notion archive import planning', () => {
  it('recognizes a mixed workspace export and restores Notion IDs', () => {
    const plan = planImportArchive([
      { path: 'index.html', uncompressedSize: 120 },
      { path: 'Projects/Launch 0123456789abcdef0123456789abcdef.md', uncompressedSize: 800 },
      { path: 'Projects/Tasks.csv', uncompressedSize: 400 },
      { path: 'Projects/Launch/assets/cover.png', uncompressedSize: 2_000 },
      { path: 'Projects/unknown.bin', uncompressedSize: 10 },
    ])

    expect(plan.rejected).toBe(false)
    expect(plan.summary).toEqual({ page: 1, database: 1, asset: 1, sitemap: 1, unsupported: 1 })
    expect(plan.entries[1]).toMatchObject({
      title: 'Launch',
      notionId: '0123456789abcdef0123456789abcdef',
      parentPath: 'Projects',
      format: 'markdown',
    })
  })

  it.each(['../secret.md', '/root.md', 'C:\\secret.md', 'safe/../../secret.md', 'folder//page.md'])('rejects unsafe path %s', (path) => {
    expect(normalizeArchivePath(path)).toBeNull()
  })

  it('rejects traversal, duplicates and decompression limit violations atomically', () => {
    const plan = planImportArchive([
      { path: '../secret.md', uncompressedSize: 1 },
      { path: 'Page.md', uncompressedSize: 6 },
      { path: 'page.md', uncompressedSize: 1 },
      { path: 'Large.md', uncompressedSize: 11 },
    ], { maxEntries: 10, maxEntryBytes: 10, maxArchiveBytes: 10 })

    expect(plan.rejected).toBe(true)
    expect(plan.issues.map((issue) => issue.code)).toEqual(['UNSAFE_PATH', 'DUPLICATE_PATH', 'ENTRY_TOO_LARGE'])
    expect(plan.entries).toHaveLength(1)
  })

  it('caps processing when an archive contains too many entries', () => {
    const plan = planImportArchive([
      { path: 'a.md', uncompressedSize: 1 },
      { path: 'b.md', uncompressedSize: 1 },
    ], { maxEntries: 1, maxEntryBytes: 10, maxArchiveBytes: 10 })

    expect(plan.rejected).toBe(true)
    expect(plan.issues[0]?.code).toBe('TOO_MANY_ENTRIES')
    expect(plan.entries).toHaveLength(1)
  })

  it('parses quoted CSV cells, BOM, embedded lines and duplicate headers', () => {
    const table = parseCsvTable('\uFEFFName,Score,Name,Done\r\n"Alpha, Inc",42,"line 1\nline 2",true')
    expect(table.headers).toEqual(['Name', 'Score', 'Name (2)', 'Done'])
    expect(table.rows[0]).toEqual({ Name: 'Alpha, Inc', Score: '42', 'Name (2)': 'line 1\nline 2', Done: 'true' })
    expect(table.inferredTypes).toEqual({ Name: 'text', Score: 'number', 'Name (2)': 'text', Done: 'checkbox' })
  })

  it('fails closed for malformed quoted CSV', () => {
    expect(() => parseCsvTable('Name\n"unfinished')).toThrow('CSV_QUOTE_NOT_CLOSED')
  })

  it('discovers and resolves local Markdown page and asset links', () => {
    const links = discoverLocalLinks(
      '[Child](Child%200123456789abcdef0123456789abcdef.md) ![Cover](assets/cover.png) [Web](https://example.com)',
      'Projects/Parent.md',
    )
    expect(links).toEqual([
      { rawTarget: 'Child%200123456789abcdef0123456789abcdef.md', resolvedPath: 'Projects/Child 0123456789abcdef0123456789abcdef.md' },
      { rawTarget: 'assets/cover.png', resolvedPath: 'Projects/assets/cover.png' },
      { rawTarget: 'https://example.com', resolvedPath: null },
    ])
  })
})
