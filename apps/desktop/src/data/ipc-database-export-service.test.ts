// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createDatabaseCsvExporter } = require('../../electron/ipc-database-export-service.cjs') as {
  createDatabaseCsvExporter(
    options: Record<string, unknown>,
  ): (suggestedName: string, csv: string) => Promise<boolean>
}

describe('database CSV export service', () => {
  it('does not write when the native dialog is cancelled', async () => {
    const writeFile = vi.fn()
    const exportCsv = createDatabaseCsvExporter({
      dialogApi: { showSaveDialog: vi.fn(async () => ({ canceled: true })) },
      fileSystem: { writeFile },
    })

    await expect(exportCsv('任务', 'a,b')).resolves.toBe(false)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('sanitizes the default name and writes an Excel-compatible UTF-8 file', async () => {
    const showSaveDialog = vi.fn(async () => ({
      canceled: false,
      filePath: 'D:\\exports\\tasks.csv',
    }))
    const writeFile = vi.fn(async () => undefined)
    const exportCsv = createDatabaseCsvExporter({
      dialogApi: { showSaveDialog },
      fileSystem: { writeFile },
    })

    await expect(exportCsv('任务:/列表', '标题,状态')).resolves.toBe(true)
    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '任务__列表.csv', buttonLabel: '导出' }),
    )
    expect(writeFile).toHaveBeenCalledWith('D:\\exports\\tasks.csv', '\uFEFF标题,状态', 'utf8')
  })

  it('does not expose the selected absolute path when writing fails', async () => {
    const exportCsv = createDatabaseCsvExporter({
      dialogApi: {
        showSaveDialog: vi.fn(async () => ({
          canceled: false,
          filePath: 'C:\\Users\\Alice\\private\\tasks.csv',
        })),
      },
      fileSystem: {
        writeFile: vi.fn(async () => {
          throw new Error('EACCES: C:\\Users\\Alice\\private\\tasks.csv')
        }),
      },
    })

    await expect(exportCsv('任务', 'a,b')).rejects.toThrow('无法写入所选 CSV 文件。')
    await expect(exportCsv('任务', 'a,b')).rejects.not.toThrow(/Alice|private/)
  })
})
