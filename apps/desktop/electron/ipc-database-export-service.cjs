/** Creates the privileged CSV writer without exposing the selected path. */
function createDatabaseCsvExporter(options) {
  return async function exportDatabaseCsv(suggestedName, csv) {
    const safeName = suggestedName.replace(/[<>:"/\\|?*\p{Cc}]/gu, '_').trim() || 'database'
    const selected = await options.dialogApi.showSaveDialog({
      title: '导出 CSV',
      defaultPath: `${safeName}.csv`,
      buttonLabel: '导出',
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
    })
    if (selected.canceled || !selected.filePath) return false
    try {
      // UTF-8 BOM keeps Chinese text readable when opened directly in Excel.
      await options.fileSystem.writeFile(selected.filePath, `\uFEFF${csv}`, 'utf8')
      return true
    } catch {
      // OS errors often contain the absolute destination path. Return a stable,
      // path-free message because the renderer does not need that privilege.
      throw new Error('无法写入所选 CSV 文件。')
    }
  }
}

module.exports = { createDatabaseCsvExporter }
