import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { convertZipArchive, inspectZipArchive } = require('../node.cjs') as {
  inspectZipArchive: (path: string) => Promise<{
    fileName: string
    compressedBytes: number
    acceptedBytes: number
    rejected: boolean
    summary: Record<string, number>
  }>
  convertZipArchive: (path: string, options?: { importId?: string; assetStoreDir?: string; signal?: AbortSignal; onProgress?: (progress: { completed: number }) => void }) => Promise<{
    pages: Array<{ id: string; title: string; content: string; parentId: string | null }>
    databases: Array<{ headers: string[]; rows: Array<Record<string, string>> }>
    attachments: Array<{ hash: string; relativePath: string; referencedBy: string[] }>
  }>
}
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('streaming ZIP preflight', () => {
  it('reads central-directory metadata without extracting entry bodies', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-import-'))
    temporaryDirectories.push(directory)
    const archivePath = join(directory, 'Notion export.zip')
    await writeFile(archivePath, createStoredZip([
      ['Home 0123456789abcdef0123456789abcdef.md', 'Hello'],
      ['Tasks.csv', 'Name,Done\nShip,true'],
      ['assets/cover.png', 'fake-image'],
    ]))

    const result = await inspectZipArchive(archivePath)
    expect(result.fileName).toBe('Notion export.zip')
    expect(result.rejected).toBe(false)
    expect(result.acceptedBytes).toBe(5 + 19 + 10)
    expect(result.summary).toMatchObject({ page: 1, database: 1, asset: 1 })
  })

  it('converts Markdown, sanitizes HTML and parses CSV sequentially', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-convert-'))
    temporaryDirectories.push(directory)
    const archivePath = join(directory, 'Workspace.zip')
    await writeFile(archivePath, createStoredZip([
      ['Parent.md', '# Parent\n\nSafe'],
      ['Parent/Child.html', '<h2>Child</h2><script>alert(1)</script>'],
      ['Parent/Tasks.csv', 'Name,Score,Done\nShip,3,true'],
    ]))
    const progress: number[] = []
    const bundle = await convertZipArchive(archivePath, { importId: 'test-import', onProgress: (event) => progress.push(event.completed) })

    expect(bundle.pages.find((page) => page.title === 'Parent')?.content).toContain('<h1>Parent</h1>')
    expect(bundle.pages.find((page) => page.title === 'Child')?.content).not.toContain('script')
    expect(bundle.pages.find((page) => page.title === 'Child')?.parentId).toBe(bundle.pages.find((page) => page.title === 'Parent')?.id)
    expect(bundle.databases[0]).toMatchObject({ headers: ['Name', 'Score', 'Done'], rows: [{ Name: 'Ship', Score: '3', Done: 'true' }] })
    expect(progress).toEqual([1, 2, 3])
  })

  it('stops conversion when the caller cancels', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-cancel-'))
    temporaryDirectories.push(directory)
    const archivePath = join(directory, 'Cancel.zip')
    await writeFile(archivePath, createStoredZip([['First.md', 'one'], ['Second.md', 'two']]))
    const controller = new AbortController()

    await expect(convertZipArchive(archivePath, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    })).rejects.toThrow('IMPORT_CANCELLED')
  })

  it('stores assets by content hash and rewrites local page and asset links', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-assets-'))
    temporaryDirectories.push(directory)
    const archivePath = join(directory, 'Assets.zip')
    const assetStoreDir = join(directory, 'store')
    await writeFile(archivePath, createStoredZip([
      ['Home.md', '[Child](Child.md)\n\n![Cover](assets/cover.png)'],
      ['Child.md', 'Child'],
      ['assets/cover.png', 'same-image-bytes'],
    ]))

    const bundle = await convertZipArchive(archivePath, { importId: 'asset-import', assetStoreDir })
    const home = bundle.pages.find((page) => page.title === 'Home')
    const child = bundle.pages.find((page) => page.title === 'Child')
    const asset = bundle.attachments[0]
    expect(home?.content).toContain(`notetodo-page:${child?.id}`)
    expect(home?.content).toContain(`notetodo-asset://${asset?.hash}/cover.png`)
    expect(asset?.referencedBy).toEqual([home?.id])
    expect(await readFile(join(assetStoreDir, asset!.relativePath), 'utf8')).toBe('same-image-bytes')
  })

  it('normalizes Notion callouts, toggles and file links for native rich blocks', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'notetodo-rich-import-'))
    temporaryDirectories.push(directory)
    const archivePath = join(directory, 'Rich.zip')
    await writeFile(archivePath, createStoredZip([
      ['Rich.html', '<aside><p>Callout</p></aside><details open><summary>More</summary><p>Body</p></details><a href="files/brief.pdf">Brief</a><a data-notetodo-bookmark data-title="Docs" href="https://example.com">Docs</a><figure data-notetodo-formula data-expression="x^2"><code>x^2</code></figure><nav data-notetodo-toc>TOC</nav><iframe src="https://www.youtube.com/embed/abc" title="Video"></iframe>'],
      ['files/brief.pdf', 'pdf-bytes'],
    ]))
    const bundle = await convertZipArchive(archivePath, { assetStoreDir: join(directory, 'store') })
    const html = bundle.pages.find((page) => page.content.includes('Callout'))?.content ?? ''
    expect(html).toContain('data-notetodo-callout')
    expect(html).toContain('data-notetodo-toggle')
    expect(html).toContain('data-notetodo-file')
    expect(html).toContain('data-name="brief.pdf"')
    expect(html).toContain('data-notetodo-bookmark')
    expect(html).toContain('data-notetodo-formula')
    expect(html).toContain('data-notetodo-toc')
    expect(html).toContain('<iframe')
  })
})

/** Creates the smallest useful ZIP fixture using the uncompressed STORE method. */
function createStoredZip(entries: Array<[string, string]>) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const [name, value] of entries) {
    const nameBuffer = Buffer.from(name)
    const data = Buffer.from(value)
    const checksum = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    localParts.push(local, nameBuffer, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(checksum, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBuffer)
    offset += local.length + nameBuffer.length + data.length
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, ...centralParts, end])
}

function crc32(value: Buffer) {
  let crc = 0xffffffff
  for (const byte of value) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
