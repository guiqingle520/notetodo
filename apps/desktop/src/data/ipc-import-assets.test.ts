// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createImportAssetStaging } = require('../../electron/ipc-import-assets.cjs') as {
  createImportAssetStaging(options: { assetStoreDir: string }): {
    prepare(importId: string): Promise<{ directory: string; createdPaths: string[] }>
    promote(
      session: { directory: string; createdPaths: string[] },
      attachments: Array<{ hash: string; relativePath: string }>,
      signal?: AbortSignal,
    ): Promise<void>
    cleanup(
      session: { directory: string; createdPaths: string[] },
      options?: { rollback?: boolean },
    ): Promise<void>
  }
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

async function createHarness() {
  const directory = await mkdtemp(join(tmpdir(), 'notetodo-import-assets-'))
  temporaryDirectories.push(directory)
  const assetStoreDir = join(directory, 'attachments')
  const staging = createImportAssetStaging({ assetStoreDir })
  const session = await staging.prepare('import-1')
  return { assetStoreDir, staging, session }
}

async function writeStagedAsset(directory: string, relativePath: string, value: string) {
  const target = join(directory, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, value)
}

describe('import attachment staging', () => {
  it('promotes a new CAS object and keeps it after a committed cleanup', async () => {
    const { assetStoreDir, staging, session } = await createHarness()
    const hash = 'a'.repeat(64)
    const relativePath = `aa/${hash}`
    await writeStagedAsset(session.directory, relativePath, 'asset-content')

    await staging.promote(session, [{ hash, relativePath }])
    await staging.cleanup(session)

    await expect(readFile(join(assetStoreDir, relativePath), 'utf8')).resolves.toBe('asset-content')
    await expect(readFile(join(session.directory, relativePath), 'utf8')).rejects.toThrow()
  })

  it('removes only newly promoted objects when the database transaction fails', async () => {
    const { assetStoreDir, staging, session } = await createHarness()
    const hash = 'b'.repeat(64)
    const relativePath = `bb/${hash}`
    await writeStagedAsset(session.directory, relativePath, 'new-content')

    await staging.promote(session, [{ hash, relativePath }])
    await staging.cleanup(session, { rollback: true })

    await expect(readFile(join(assetStoreDir, relativePath), 'utf8')).rejects.toThrow()
  })

  it('preserves a pre-existing deduplicated object during rollback', async () => {
    const { assetStoreDir, staging, session } = await createHarness()
    const hash = 'c'.repeat(64)
    const relativePath = `cc/${hash}`
    await mkdir(dirname(join(assetStoreDir, relativePath)), { recursive: true })
    await writeFile(join(assetStoreDir, relativePath), 'existing-content')
    await writeStagedAsset(session.directory, relativePath, 'existing-content')

    await staging.promote(session, [
      { hash, relativePath },
      { hash, relativePath },
    ])
    await staging.cleanup(session, { rollback: true })

    await expect(readFile(join(assetStoreDir, relativePath), 'utf8')).resolves.toBe(
      'existing-content',
    )
  })

  it('rejects traversal before touching the final store', async () => {
    const { staging, session } = await createHarness()
    await expect(
      staging.promote(session, [{ hash: 'd'.repeat(64), relativePath: '../escape' }]),
    ).rejects.toThrow(/location/)
    await staging.cleanup(session, { rollback: true })
  })
})
