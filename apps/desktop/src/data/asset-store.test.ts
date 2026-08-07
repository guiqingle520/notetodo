// @vitest-environment node
import { createRequire } from 'node:module'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { collectUnusedAssets, detectMimeType, isRenderableImage, safeDisplayName, storeLocalAsset } = require('../../electron/asset-store.cjs') as {
  collectUnusedAssets: (database: { listUnreferencedAttachments: (cutoff: string) => Array<{ hash: string; relativePath: string }>; deleteAttachmentIfUnreferenced: (hash: string, cutoff: string) => boolean }, root: string, graceMs?: number) => Promise<number>
  detectMimeType: (name: string, bytes: Buffer) => string
  isRenderableImage: (asset: { mimeType: string }) => boolean
  safeDisplayName: (value: string) => string
  storeLocalAsset: (source: string, root: string, options?: { maxBytes?: number; onProgress?: (completed: number, total: number) => void }) => Promise<{ hash: string; size: number; mimeType: string; relativePath: string; displayName: string }>
}

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe('local content-addressed asset store', () => {
  it('streams, hashes and deduplicates identical files with progress', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-local-assets-')); directories.push(directory)
    const firstPath = join(directory, 'first.txt')
    const secondPath = join(directory, 'second.txt')
    await writeFile(firstPath, 'same attachment bytes')
    await writeFile(secondPath, 'same attachment bytes')
    const progress: number[] = []

    const first = await storeLocalAsset(firstPath, join(directory, 'store'), { onProgress: (completed) => progress.push(completed) })
    const second = await storeLocalAsset(secondPath, join(directory, 'store'))

    expect(second.hash).toBe(first.hash)
    expect(second.relativePath).toBe(first.relativePath)
    expect(progress.at(-1)).toBe(first.size)
    expect(await readFile(join(directory, 'store', first.relativePath), 'utf8')).toBe('same attachment bytes')
  })

  it('uses image signatures instead of trusting the selected extension', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(detectMimeType('renamed.txt', png)).toBe('image/png')
    expect(isRenderableImage({ mimeType: 'image/png' })).toBe(true)
    expect(isRenderableImage({ mimeType: 'image/svg+xml' })).toBe(false)
  })

  it('reduces untrusted collaborative names to one safe path segment', () => {
    expect(safeDisplayName('../../outside/brief.pdf')).toBe('brief.pdf')
    expect(safeDisplayName('..\\..\\payload.exe')).toBe('payload.exe')
    expect(safeDisplayName('..')).toBe('附件')
  })

  it('rejects a file before copying when it exceeds the configured limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-local-assets-limit-')); directories.push(directory)
    const source = join(directory, 'large.bin')
    await writeFile(source, '12345')
    await expect(storeLocalAsset(source, join(directory, 'store'), { maxBytes: 4 })).rejects.toThrow('不能超过')
  })

  it('removes quarantined originals and thumbnails after the final reference check', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-assets-gc-')); directories.push(directory)
    const hash = 'd'.repeat(64)
    const relativePath = join('dd', hash)
    const original = join(directory, relativePath)
    const thumbnail = join(directory, 'thumbnails', 'dd', `${hash}.png`)
    await mkdir(join(directory, 'dd'), { recursive: true })
    await mkdir(join(directory, 'thumbnails', 'dd'), { recursive: true })
    await writeFile(original, 'orphan')
    await writeFile(thumbnail, 'preview')
    let deleted = false
    const database = {
      listUnreferencedAttachments: () => [{ hash, relativePath }],
      deleteAttachmentIfUnreferenced: () => { deleted = true; return true },
    }

    expect(await collectUnusedAssets(database, directory, 0)).toBe(1)
    expect(deleted).toBe(true)
    await expect(access(original)).rejects.toThrow()
    await expect(access(thumbnail)).rejects.toThrow()
  })
})
