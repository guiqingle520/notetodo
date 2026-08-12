// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspaceDatabase } from './workspace-db-test-harness'

const require = createRequire(import.meta.url)
let database: InstanceType<typeof WorkspaceDatabase> | undefined
let temporaryDirectory: string | undefined
afterEach(() => {
  database?.close()
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true })
})

describe('workspace page metadata', () => {
  it('persists bounded page presentation metadata independently from content', () => {
    database = new WorkspaceDatabase(':memory:')
    const page = database.loadWorkspace().pages.find((candidate) => candidate.id === 'welcome')!
    expect(page.description).toBe('')
    expect(page.cover).toBe('')

    const hash = 'a'.repeat(64)
    database.registerPageAttachments(page.id, [
      {
        hash,
        size: 42,
        mimeType: 'image/png',
        relativePath: `aa/${hash}`,
        displayName: 'cover.png',
      },
    ])
    const cover = `notetodo-asset://${hash}/cover.png`
    database.upsertPage({ ...page, description: '团队工作区入口', cover })
    const restored = database.loadWorkspace().pages.find((candidate) => candidate.id === page.id)
    expect(restored).toMatchObject({ description: '团队工作区入口', cover, content: page.content })
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).not.toContainEqual(
      expect.objectContaining({ hash }),
    )

    database.upsertPage({ ...restored!, cover: '' })
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).toContainEqual(
      expect.objectContaining({ hash }),
    )
  })

  it('upgrades a v19 workspace without changing existing page content', () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'notetodo-page-metadata-'))
    const databasePath = join(temporaryDirectory, 'workspace.db')
    database = new WorkspaceDatabase(databasePath)
    const original = database.loadWorkspace().pages.find((page) => page.id === 'welcome')!
    database.close()
    database = undefined

    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (path: string) => { exec(source: string): void; close(): void }
    }
    const legacy = new DatabaseSync(databasePath)
    legacy.exec(
      "ALTER TABLE pages DROP COLUMN cover; ALTER TABLE pages DROP COLUMN description; UPDATE app_meta SET value='19' WHERE key='schema_version';",
    )
    legacy.close()

    database = new WorkspaceDatabase(databasePath)
    expect(database.loadWorkspace().pages.find((page) => page.id === original.id)).toMatchObject({
      title: original.title,
      content: original.content,
      description: '',
      cover: '',
    })
  })
})
