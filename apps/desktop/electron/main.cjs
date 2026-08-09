const { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, safeStorage, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const { WorkspaceDatabase } = require('./workspace-db.cjs')
const { WebhookWorker } = require('./webhook-worker.cjs')
const { ModelService } = require('./model-service.cjs')
const { collectUnusedAssets, isRenderableImage, safeDisplayName, storeLocalAsset } = require('./asset-store.cjs')
const { API_SCOPES, signRoomTicket } = require('@notetodo/auth-core')
const { convertZipArchive, inspectZipArchive } = require('@notetodo/import-core/node')
const { randomBytes, randomUUID } = require('node:crypto')

const isDev = !app.isPackaged
let workspaceDatabase
const modelService = new ModelService()
const activeModelRuns = new Map()
// Renderer receives opaque IDs only; local archive paths never cross preload.
const importSources = new Map()
const activeImports = new Map()
let assetGcTimer
let webhookWorker

protocol.registerSchemesAsPrivileged([{
  scheme: 'notetodo-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}])

// Keep OS folders and taskbar identity stable even though npm uses a scoped
// workspace package name internally.
app.setName('NoteTodo')
if (process.platform === 'win32') app.setAppUserModelId('dev.notetodo.desktop')
if (process.env.NOTETODO_SMOKE_TEST === '1' && process.env.NOTETODO_SMOKE_DATA_DIR) {
  if (!path.isAbsolute(process.env.NOTETODO_SMOKE_DATA_DIR)) throw new Error('Smoke data directory must be absolute.')
  app.setPath('userData', process.env.NOTETODO_SMOKE_DATA_DIR)
}

function assertPage(value) {
  if (!value || typeof value !== 'object') throw new TypeError('A page object is required.')
  if (typeof value.id !== 'string' || value.id.length < 1 || value.id.length > 128) {
    throw new TypeError('Invalid page id.')
  }
  if (typeof value.title !== 'string' || value.title.length > 1000) throw new TypeError('Invalid title.')
  if (typeof value.content !== 'string' || value.content.length > 20_000_000) {
    throw new TypeError('Page content exceeds the local safety limit.')
  }
}

function assertId(id) {
  if (typeof id !== 'string' || id.length < 1 || id.length > 128) throw new TypeError('Invalid page id.')
}

function registerWorkspaceIpc(database) {
  function resolveAttachment(hash) {
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/u.test(hash)) throw new TypeError('Invalid attachment hash.')
    const attachment = database.getAttachment(hash)
    if (!attachment) throw new Error('附件不存在或已被清理。')
    const assetRoot = path.resolve(app.getPath('userData'), 'attachments')
    const sourcePath = path.resolve(assetRoot, attachment.relativePath)
    if (!sourcePath.startsWith(`${assetRoot}${path.sep}`)) throw new Error('附件路径无效。')
    return { attachment, sourcePath }
  }

  async function storeAttachmentPaths(event, pageId, filePaths, requestId, requireImages = false, displayNames = []) {
    assertId(pageId); assertId(requestId)
    if (!Array.isArray(filePaths) || filePaths.length > 20 || filePaths.some((filePath) => typeof filePath !== 'string' || !path.isAbsolute(filePath))) {
      throw new TypeError('Invalid local attachment selection.')
    }
    if (!filePaths.length) return []
    const assetRoot = path.join(app.getPath('userData'), 'attachments')
    const attachments = []
    const sizes = await Promise.all(filePaths.map((filePath) => fs.promises.stat(filePath).then((stat) => stat.size)))
    const total = sizes.reduce((sum, size) => sum + size, 0)
    if (total > 1024 * 1024 * 1024) throw new RangeError('单次附件总大小不能超过 1 GB。')
    let completedBeforeFile = 0
    const channel = `attachments:progress:${requestId}`
    // Sequential disk reads avoid saturating slower SSDs; each individual file
    // still uses a backpressured stream and reports actual persisted bytes.
    for (const [index, filePath] of filePaths.entries()) {
      const attachment = await storeLocalAsset(filePath, assetRoot, {
        displayName: displayNames[index],
        onProgress: (completed) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, { completed: completedBeforeFile + completed, total, currentName: path.basename(filePath) })
        },
      })
      if (requireImages && !isRenderableImage(attachment)) throw new TypeError(`${attachment.displayName} 不是受支持的图片。`)
      if (isRenderableImage(attachment)) attachment.hasThumbnail = await createAssetThumbnail(assetRoot, attachment)
      attachments.push(attachment)
      completedBeforeFile += attachment.size
    }
    database.registerPageAttachments(pageId, attachments)
    return attachments.map((attachment) => ({
      hash: attachment.hash,
      size: attachment.size,
      mimeType: attachment.mimeType,
      displayName: attachment.displayName,
      url: `notetodo-asset://${attachment.hash}/${encodeURIComponent(attachment.displayName)}`,
      previewUrl: attachment.hasThumbnail ? `notetodo-asset://${attachment.hash}/${encodeURIComponent(attachment.displayName)}?variant=thumbnail` : null,
    }))
  }

  ipcMain.handle('workspace:load', () => database.loadWorkspace())
  ipcMain.handle('workspace:upsert-page', (_event, page) => {
    assertPage(page)
    return database.upsertPage(page)
  })
  ipcMain.handle('workspace:set-active-page', (_event, id) => {
    assertId(id)
    database.setActivePage(id)
  })
  ipcMain.handle('workspace:archive-page', (_event, id) => {
    assertId(id)
    database.archivePage(id)
  })
  ipcMain.handle('workspace:restore-page', (_event, id) => {
    assertId(id)
    database.restorePage(id)
  })
  ipcMain.handle('workspace:search', (_event, query) => {
    if (typeof query !== 'string' || query.length > 500) throw new TypeError('Invalid search query.')
    return database.searchPages(query)
  })
  ipcMain.handle('platform:list-tokens', () => database.listApiTokens())
  ipcMain.handle('platform:issue-token', (_event, name, scopes) => {
    if (!Array.isArray(scopes) || scopes.some((scope) => !API_SCOPES.includes(scope))) throw new TypeError('Invalid API token scopes.')
    return database.issueApiToken(name, scopes)
  })
  ipcMain.handle('platform:revoke-token', (_event, id) => { assertId(id); return database.revokeApiToken(id) })
  ipcMain.handle('webhooks:list', () => database.listWebhookEndpoints())
  ipcMain.handle('webhooks:create', (_event, name, url, events) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统密钥库不可用，无法安全保存 Webhook 签名密钥。')
    const secret = randomBytes(32).toString('base64url')
    const endpoint = database.createWebhookEndpoint(name, url, events, safeStorage.encryptString(secret))
    return { ...endpoint, secret }
  })
  ipcMain.handle('webhooks:set-active', (_event, id, active) => { assertId(id); if (typeof active !== 'boolean') throw new TypeError('Invalid webhook state.'); return database.setWebhookEndpointActive(id, active) })
  ipcMain.handle('webhooks:list-deliveries', (_event, endpointId) => { assertId(endpointId); return database.listWebhookDeliveries(endpointId) })
  ipcMain.handle('automations:list', (_event, databaseId) => { assertId(databaseId); return database.listDatabaseAutomations(databaseId) })
  ipcMain.handle('automations:save', (_event, databaseId, rule) => { assertId(databaseId); if (!rule || typeof rule !== 'object') throw new TypeError('Invalid automation rule.'); return database.saveDatabaseAutomation(databaseId, rule) })
  ipcMain.handle('automations:set-enabled', (_event, id, enabled) => { assertId(id); if (typeof enabled !== 'boolean') throw new TypeError('Invalid automation state.'); return database.setDatabaseAutomationEnabled(id, enabled) })
  ipcMain.handle('automations:list-runs', (_event, databaseId) => { assertId(databaseId); return database.listAutomationRuns(databaseId) })
  ipcMain.handle('automations:replay', (_event, runId) => { assertId(runId); return database.replayAutomationRun(runId) })
  ipcMain.handle('history:list', (_event, pageId) => { assertId(pageId); return database.listPageVersions(pageId) })
  ipcMain.handle('history:get', (_event, pageId, versionId) => {
    assertId(pageId)
    if (!Number.isSafeInteger(versionId) || versionId < 1) throw new TypeError('Invalid page version.')
    return database.getPageVersion(pageId, versionId)
  })
  ipcMain.handle('history:restore', (_event, pageId, versionId) => {
    assertId(pageId)
    if (!Number.isSafeInteger(versionId) || versionId < 1) throw new TypeError('Invalid page version.')
    const userId = database.getSetting('collaboration_user_id')
    const role = userId ? database.getPageRole(pageId, userId) : null
    if (role && !['editor', 'owner'].includes(role)) throw new Error('当前角色无权恢复页面历史。')
    return database.restorePageVersion(pageId, versionId)
  })
  ipcMain.handle('retrieval:search', (_event, query, limit = 8) => {
    if (typeof query !== 'string' || query.length > 500 || !Number.isSafeInteger(limit)) throw new TypeError('Invalid retrieval query.')
    const userId = database.getSetting('collaboration_user_id')
    return database.hybridSearch(query, userId, limit)
  })
  ipcMain.handle('import:pick-and-inspect', async () => {
    const selected = await dialog.showOpenDialog({
      title: '导入 Notion 工作区',
      buttonLabel: '检查档案',
      properties: ['openFile'],
      filters: [{ name: 'Notion 导出档案', extensions: ['zip'] }],
    })
    if (selected.canceled || !selected.filePaths[0]) return null
    const inspection = await inspectZipArchive(selected.filePaths[0])
    const importId = randomUUID()
    importSources.set(importId, { filePath: selected.filePaths[0], expiresAt: Date.now() + 30 * 60_000 })
    return { ...inspection, importId }
  })
  ipcMain.handle('import:start', async (event, importId, requestId) => {
    assertId(importId); assertId(requestId)
    const source = importSources.get(importId)
    if (!source || source.expiresAt < Date.now()) throw new Error('导入预检已过期，请重新选择档案。')
    if (activeImports.has(requestId)) throw new Error('导入任务已存在。')
    const controller = new AbortController()
    activeImports.set(requestId, controller)
    const channel = `import:progress:${requestId}`
    database.createImportJob(importId, path.basename(source.filePath))
    try {
      const bundle = await convertZipArchive(source.filePath, {
        importId,
        assetStoreDir: path.join(app.getPath('userData'), 'attachments'),
        signal: controller.signal,
        onProgress: (progress) => { if (!event.sender.isDestroyed()) event.sender.send(channel, progress) },
      })
      if (controller.signal.aborted) throw new Error('IMPORT_CANCELLED')
      if (!event.sender.isDestroyed()) event.sender.send(channel, { phase: 'commit', completed: 0, total: 1 })
      database.updateImportJob(importId, 'committing')
      const result = database.importWorkspaceBundle(bundle)
      if (!event.sender.isDestroyed()) event.sender.send(channel, { phase: 'done', completed: 1, total: 1 })
      importSources.delete(importId)
      return result
    } catch (error) {
      database.updateImportJob(importId, controller.signal.aborted || error?.message === 'IMPORT_CANCELLED' ? 'cancelled' : 'failed', error?.message ?? String(error))
      throw error
    } finally {
      activeImports.delete(requestId)
    }
  })
  ipcMain.handle('import:list-jobs', () => database.loadImportJobs())
  ipcMain.on('import:cancel', (_event, requestId) => {
    if (typeof requestId === 'string') activeImports.get(requestId)?.abort()
  })
  ipcMain.handle('attachments:pick-and-store', async (event, pageId, kind, requestId) => {
    assertId(pageId); assertId(requestId)
    if (!['image', 'file'].includes(kind)) throw new TypeError('Invalid attachment kind.')
    const selected = await dialog.showOpenDialog({
      title: kind === 'image' ? '插入本地图片' : '插入本地文件',
      buttonLabel: kind === 'image' ? '插入图片' : '插入文件',
      properties: ['openFile', 'multiSelections'],
      filters: kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
        : [{ name: '所有文件', extensions: ['*'] }],
    })
    if (selected.canceled || !selected.filePaths.length) return []
    return storeAttachmentPaths(event, pageId, selected.filePaths, requestId, kind === 'image')
  })
  ipcMain.handle('attachments:store-dropped', (event, pageId, filePaths, requestId) => storeAttachmentPaths(event, pageId, filePaths, requestId))
  ipcMain.handle('attachments:store-memory', async (event, pageId, items, requestId) => {
    assertId(pageId); assertId(requestId)
    if (!Array.isArray(items) || items.length > 20) throw new TypeError('Invalid clipboard attachment selection.')
    const normalized = items.map((item) => {
      if (!item || typeof item.name !== 'string') throw new TypeError('Invalid clipboard attachment.')
      const data = Buffer.from(item.data)
      if (data.length > 25 * 1024 * 1024) throw new RangeError('单个剪贴板附件不能超过 25 MB。')
      return { name: item.name.slice(0, 240), data }
    })
    if (normalized.reduce((sum, item) => sum + item.data.length, 0) > 100 * 1024 * 1024) throw new RangeError('剪贴板附件总大小不能超过 100 MB。')
    const assetRoot = path.join(app.getPath('userData'), 'attachments')
    await fs.promises.mkdir(assetRoot, { recursive: true })
    const temporaryDir = await fs.promises.mkdtemp(path.join(assetRoot, '.clipboard-'))
    try {
      const paths = []
      for (const item of normalized) {
        const temporaryPath = path.join(temporaryDir, randomUUID())
        await fs.promises.writeFile(temporaryPath, item.data, { flag: 'wx' })
        paths.push(temporaryPath)
      }
      return await storeAttachmentPaths(event, pageId, paths, requestId, true, normalized.map((item) => item.name))
    } finally {
      await fs.promises.rm(temporaryDir, { recursive: true, force: true })
    }
  })
  ipcMain.handle('attachments:open', async (_event, hash, requestedName) => {
    const { sourcePath } = resolveAttachment(hash)
    if (typeof requestedName !== 'string') throw new TypeError('Invalid attachment name.')
    const displayName = safeDisplayName(requestedName)
    const extension = path.extname(displayName).toLowerCase()
    if (['.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.js', '.lnk'].includes(extension)) {
      throw new Error('出于安全考虑，可执行或脚本附件需要先导出后再手动打开。')
    }
    const openDirectory = path.join(app.getPath('temp'), 'NoteTodo-open', hash)
    const openPath = path.join(openDirectory, displayName)
    await fs.promises.mkdir(openDirectory, { recursive: true })
    await fs.promises.copyFile(sourcePath, openPath)
    const errorMessage = await shell.openPath(openPath)
    if (errorMessage) throw new Error(errorMessage)
  })
  ipcMain.handle('attachments:export', async (_event, hash, requestedName) => {
    const { sourcePath } = resolveAttachment(hash)
    if (typeof requestedName !== 'string') throw new TypeError('Invalid attachment name.')
    const displayName = safeDisplayName(requestedName)
    const selected = await dialog.showSaveDialog({ title: '导出附件', defaultPath: displayName, buttonLabel: '导出' })
    if (selected.canceled || !selected.filePath) return false
    await fs.promises.copyFile(sourcePath, selected.filePath)
    return true
  })
  ipcMain.handle('database:load-by-page', (_event, pageId) => {
    assertId(pageId)
    return database.loadDatabaseByPage(pageId)
  })
  ipcMain.handle('database:create', (_event, pageId, databaseId, name) => {
    assertId(pageId); assertId(databaseId)
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 200) throw new TypeError('Invalid database name.')
    return database.createDatabaseForPage(pageId, databaseId, name.trim())
  })
  ipcMain.handle('database:add-property', (_event, databaseId, propertyId, name, type) => {
    assertId(databaseId); assertId(propertyId)
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 100) throw new TypeError('Invalid property name.')
    if (!['text', 'number', 'checkbox', 'select', 'multiSelect', 'date', 'url', 'relation', 'rollup', 'formula'].includes(type)) throw new TypeError('Invalid property type.')
    return database.addDatabaseProperty(databaseId, propertyId, name.trim(), type)
  })
  ipcMain.handle('database:list-sources', () => database.listDatabaseSources())
  ipcMain.handle('database:update-property-config', (_event, databaseId, propertyId, config) => {
    assertId(databaseId); assertId(propertyId)
    if (!config || typeof config !== 'object' || Array.isArray(config) || JSON.stringify(config).length > 50_000) throw new TypeError('Invalid property configuration.')
    return database.updateDatabasePropertyConfig(databaseId, propertyId, config)
  })
  ipcMain.handle('database:rename-property', (_event, databaseId, propertyId, name) => {
    assertId(databaseId); assertId(propertyId)
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 100) throw new TypeError('Invalid property name.')
    return database.renameDatabaseProperty(databaseId, propertyId, name.trim())
  })
  ipcMain.handle('database:rename', (_event, databaseId, name) => {
    assertId(databaseId)
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 200) throw new TypeError('Invalid database name.')
    return database.renameDatabase(databaseId, name.trim())
  })
  ipcMain.handle('database:reorder-properties', (_event, databaseId, propertyIds) => {
    assertId(databaseId)
    if (!Array.isArray(propertyIds) || propertyIds.length > 50) throw new TypeError('Invalid property order.')
    propertyIds.forEach(assertId)
    return database.reorderDatabaseProperties(databaseId, propertyIds)
  })
  ipcMain.handle('database:delete-property', (_event, databaseId, propertyId) => {
    assertId(databaseId); assertId(propertyId)
    return database.deleteDatabaseProperty(databaseId, propertyId)
  })
  ipcMain.handle('database:update-cell', (_event, recordId, propertyId, value) => {
    assertId(recordId)
    assertId(propertyId)
    const serialized = JSON.stringify(value)
    if (serialized === undefined || serialized.length > 100_000) throw new TypeError('Database cell value is invalid or too large.')
    database.updateDatabaseCell(recordId, propertyId, value)
  })
  ipcMain.handle('database:create-record', (_event, databaseId, recordId) => {
    assertId(databaseId)
    assertId(recordId)
    database.createDatabaseRecord(databaseId, recordId)
  })
  ipcMain.handle('database:duplicate-record', (_event, databaseId, sourceRecordId, recordId) => {
    assertId(databaseId); assertId(sourceRecordId); assertId(recordId)
    return database.duplicateDatabaseRecord(databaseId, sourceRecordId, recordId)
  })
  ipcMain.handle('database:trash-records', (_event, databaseId, recordIds) => {
    assertId(databaseId)
    if (!Array.isArray(recordIds) || recordIds.length < 1 || recordIds.length > 1000) throw new TypeError('Select between 1 and 1000 database records.')
    const uniqueIds = [...new Set(recordIds)]; uniqueIds.forEach(assertId)
    return database.trashDatabaseRecords(databaseId, uniqueIds)
  })
  ipcMain.handle('database:list-trashed-records', (_event, databaseId) => {
    assertId(databaseId)
    return database.listTrashedDatabaseRecords(databaseId)
  })
  ipcMain.handle('database:restore-records', (_event, databaseId, recordIds) => {
    assertId(databaseId)
    if (!Array.isArray(recordIds) || recordIds.length < 1 || recordIds.length > 1000) throw new TypeError('Select between 1 and 1000 database records.')
    const uniqueIds = [...new Set(recordIds)]; uniqueIds.forEach(assertId)
    return database.restoreDatabaseRecords(databaseId, uniqueIds)
  })
  ipcMain.handle('database:delete-records-permanently', (_event, databaseId, recordIds) => {
    assertId(databaseId)
    if (!Array.isArray(recordIds) || recordIds.length < 1 || recordIds.length > 1000) throw new TypeError('Select between 1 and 1000 database records.')
    const uniqueIds = [...new Set(recordIds)]; uniqueIds.forEach(assertId)
    database.deleteDatabaseRecordsPermanently(databaseId, uniqueIds)
  })
  ipcMain.handle('database:update-record-content', (_event, recordId, content) => {
    assertId(recordId)
    if (typeof content !== 'string' || content.length > 2_000_000) throw new TypeError('Database record content is invalid or too large.')
    database.updateDatabaseRecordContent(recordId, content)
  })
  ipcMain.handle('database:list-record-history', (_event, recordId) => {
    assertId(recordId)
    return database.listDatabaseRecordHistory(recordId)
  })
  ipcMain.handle('database:restore-record-history', (_event, historyId) => {
    assertId(historyId)
    return database.restoreDatabaseRecordHistory(historyId)
  })
  ipcMain.handle('database:set-active-view', (_event, databaseId, viewId) => {
    assertId(databaseId)
    assertId(viewId)
    database.setActiveDatabaseView(databaseId, viewId)
  })
  ipcMain.handle('database:update-view-config', (_event, databaseId, viewId, config) => {
    assertId(databaseId)
    assertId(viewId)
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Invalid database view configuration.')
    const serialized = JSON.stringify(config)
    if ((config.filters !== undefined && !Array.isArray(config.filters)) || (config.quickFilters !== undefined && !Array.isArray(config.quickFilters)) || (config.sorts !== undefined && !Array.isArray(config.sorts)) || (config.visiblePropertyIds !== undefined && !Array.isArray(config.visiblePropertyIds)) || (config.propertyOrder !== undefined && !Array.isArray(config.propertyOrder)) || (config.collapsedGroupKeys !== undefined && !Array.isArray(config.collapsedGroupKeys)) || (config.recordOrder !== undefined && !Array.isArray(config.recordOrder))) throw new TypeError('Database view rules must be arrays.')
    if (config.propertyWidths !== undefined && (!config.propertyWidths || typeof config.propertyWidths !== 'object' || Array.isArray(config.propertyWidths))) throw new TypeError('Database property widths must be an object.')
    if (config.calculations !== undefined && (!config.calculations || typeof config.calculations !== 'object' || Array.isArray(config.calculations))) throw new TypeError('Database calculations must be an object.')
    if (serialized.length > 500_000 || (config.filters?.length ?? 0) > 20 || (config.quickFilters?.length ?? 0) > 5 || (config.sorts?.length ?? 0) > 10 || (config.visiblePropertyIds?.length ?? 0) > 50 || (config.propertyOrder?.length ?? 0) > 50 || (config.collapsedGroupKeys?.length ?? 0) > 100 || (config.recordOrder?.length ?? 0) > 10_000 || Object.keys(config.propertyWidths ?? {}).length > 50 || Object.keys(config.calculations ?? {}).length > 50) throw new TypeError('Database view configuration is too large.')
    database.updateDatabaseViewConfig(databaseId, viewId, config)
  })
  ipcMain.handle('database:create-view', (_event, databaseId, viewId, name, type, config) => {
    assertId(databaseId); assertId(viewId)
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new TypeError('Invalid database view name.')
    if (!['table', 'board', 'list', 'calendar', 'timeline', 'gallery'].includes(type)) throw new TypeError('Invalid database view type.')
    if (!config || typeof config !== 'object' || Array.isArray(config) || JSON.stringify(config).length > 50_000) throw new TypeError('Invalid database view configuration.')
    return database.createDatabaseView(databaseId, viewId, name.trim(), type, config)
  })
  ipcMain.handle('database:rename-view', (_event, databaseId, viewId, name) => {
    assertId(databaseId); assertId(viewId)
    if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new TypeError('Invalid database view name.')
    return database.renameDatabaseView(databaseId, viewId, name.trim())
  })
  ipcMain.handle('database:delete-view', (_event, databaseId, viewId) => {
    assertId(databaseId); assertId(viewId)
    return database.deleteDatabaseView(databaseId, viewId)
  })
  ipcMain.handle('database:set-default-view', (_event, databaseId, viewId) => {
    assertId(databaseId); assertId(viewId)
    return database.setDefaultDatabaseView(databaseId, viewId)
  })
  ipcMain.handle('database:bulk-update', (_event, databaseId, recordIds, propertyId, value) => {
    assertId(databaseId); assertId(propertyId)
    if (!Array.isArray(recordIds) || recordIds.length < 1 || recordIds.length > 1000) throw new TypeError('Select between 1 and 1000 database records.')
    const uniqueIds = [...new Set(recordIds)]
    uniqueIds.forEach(assertId)
    const serialized = JSON.stringify(value)
    if (serialized === undefined || serialized.length > 100_000) throw new TypeError('Database cell value is invalid or too large.')
    return database.bulkUpdateDatabaseRecords(databaseId, uniqueIds, propertyId, value)
  })
  ipcMain.handle('database:import-records', (_event, databaseId, records) => {
    validateIdentifier(databaseId, 'Database ID')
    return workspace.importDatabaseRecords(databaseId, records)
  })
  ipcMain.handle('database:save-template', (_event, databaseId, template) => {
    assertId(databaseId); assertId(template?.id)
    if (typeof template.name !== 'string' || !template.name.trim() || template.name.length > 200) throw new TypeError('Invalid database template name.')
    if (!template.values || typeof template.values !== 'object' || Array.isArray(template.values)) throw new TypeError('Invalid database template values.')
    if (typeof template.content !== 'string' || template.content.length > 2_000_000 || JSON.stringify(template.values).length > 500_000) throw new TypeError('Database template is too large.')
    return database.saveDatabaseTemplate(databaseId, { ...template, name: template.name.trim() })
  })
  ipcMain.handle('database:delete-template', (_event, databaseId, templateId) => {
    assertId(databaseId); assertId(templateId)
    return database.deleteDatabaseTemplate(databaseId, templateId)
  })
  ipcMain.handle('database:create-from-template', (_event, databaseId, templateId, recordId) => {
    assertId(databaseId); assertId(templateId); assertId(recordId)
    return database.createDatabaseRecordFromTemplate(databaseId, templateId, recordId)
  })
  ipcMain.handle('database:export-csv', async (_event, suggestedName, csv) => {
    if (typeof suggestedName !== 'string' || suggestedName.length > 200 || typeof csv !== 'string' || csv.length > 20_000_000) throw new TypeError('CSV export is invalid or too large.')
    const safeName = suggestedName.replace(/[<>:"/\\|?*\x00-\x1f]/gu, '_').trim() || 'database'
    const selected = await dialog.showSaveDialog({ title: '导出 CSV', defaultPath: `${safeName}.csv`, buttonLabel: '导出', filters: [{ name: 'CSV 文件', extensions: ['csv'] }] })
    if (selected.canceled || !selected.filePath) return false
    // UTF-8 BOM keeps Chinese text readable when the file is opened directly in Excel.
    await fs.promises.writeFile(selected.filePath, `\uFEFF${csv}`, 'utf8')
    return true
  })
  ipcMain.handle('sync:load-document', (_event, pageId) => {
    assertId(pageId)
    return database.loadSyncDocument(pageId)
  })
  ipcMain.handle('sync:append-update', (_event, pageId, clientId, data) => {
    assertId(pageId)
    assertId(clientId)
    if (typeof data !== 'string' || data.length > 2_000_000) throw new TypeError('Invalid sync update.')
    return database.appendSyncUpdate(pageId, clientId, data)
  })
  ipcMain.handle('sync:compact-document', (_event, pageId, snapshot, throughId) => {
    assertId(pageId)
    if (typeof snapshot !== 'string' || snapshot.length > 20_000_000 || !Number.isSafeInteger(throughId)) throw new TypeError('Invalid sync snapshot.')
    database.compactSyncDocument(pageId, snapshot, throughId)
  })
  ipcMain.handle('collaboration:get-ticket', (_event, pageId) => {
    assertId(pageId)
    const secret = process.env.NOTETODO_COLLAB_TOKEN
    if (!secret) return null
    let userId = database.getSetting('collaboration_user_id')
    if (!userId) { userId = randomUUID(); database.setSetting('collaboration_user_id', userId) }
    const existingRole = database.getPageRole(pageId, userId)
    const role = existingRole ?? 'owner'
    const identity = { userId, name: '本机用户', color: '#c45134', role }
    if (!existingRole) database.upsertPagePermission(pageId, userId, identity.name, 'owner')
    return {
      endpoint: process.env.NOTETODO_COLLAB_URL ?? 'ws://127.0.0.1:4789',
      ...identity,
      token: signRoomTicket({ pageId, ...identity, ttlSeconds: 300 }, secret),
    }
  })
  ipcMain.handle('sharing:list', (_event, pageId) => { assertId(pageId); return database.loadPagePermissions(pageId) })
  ipcMain.handle('sharing:upsert', (_event, pageId, subjectId, displayName, role) => {
    assertId(pageId); assertId(subjectId)
    if (typeof displayName !== 'string' || displayName.length < 1 || displayName.length > 80 || !['viewer', 'commenter', 'editor'].includes(role)) throw new TypeError('Invalid page permission.')
    database.upsertPagePermission(pageId, subjectId, displayName, role)
  })
  ipcMain.handle('sharing:remove', (_event, pageId, subjectId) => { assertId(pageId); assertId(subjectId); database.removePagePermission(pageId, subjectId) })
  ipcMain.handle('comments:list', (_event, pageId) => { assertId(pageId); return database.loadComments(pageId) })
  ipcMain.handle('comments:create', (_event, pageId, body, anchor, mentions = []) => {
    assertId(pageId)
    if (typeof body !== 'string' || body.trim().length < 1 || body.length > 10_000) throw new TypeError('Invalid comment body.')
    let userId = database.getSetting('collaboration_user_id')
    if (!userId) { userId = randomUUID(); database.setSetting('collaboration_user_id', userId) }
    if (anchor !== null && anchor !== undefined && (!Number.isSafeInteger(anchor.from) || !Number.isSafeInteger(anchor.to) || anchor.from < 0 || anchor.to < anchor.from || typeof anchor.quote !== 'string' || anchor.quote.length > 1000)) throw new TypeError('Invalid comment anchor.')
    if (!Array.isArray(mentions) || mentions.length > 20 || mentions.some((id) => typeof id !== 'string' || id.length > 128)) throw new TypeError('Invalid comment mentions.')
    const allowedSubjects = new Set(database.loadPagePermissions(pageId).map((permission) => permission.subjectId))
    const validatedMentions = [...new Set(mentions)].filter((id) => allowedSubjects.has(id))
    const comment = { id: randomUUID(), pageId, authorId: userId, authorName: '本机用户', body: body.trim(), anchor: anchor ?? null, mentions: validatedMentions }
    database.createComment(comment)
    return comment.id
  })
  ipcMain.handle('comments:resolve', (_event, id) => { assertId(id); database.resolveComment(id) })
  ipcMain.handle('notifications:list', () => {
    const userId = database.getSetting('collaboration_user_id')
    return userId ? database.loadNotifications(userId) : []
  })
  ipcMain.handle('notifications:mark-read', (_event, id) => {
    assertId(id)
    const userId = database.getSetting('collaboration_user_id')
    if (userId) database.markNotificationRead(id, userId)
  })
  ipcMain.handle('ai:create-patch-audit', (_event, pageId, operation, preview) => {
    assertId(pageId)
    if (!['insert-paragraphs', 'replace-selection'].includes(operation) || typeof preview !== 'string' || preview.length > 200_000) throw new TypeError('Invalid AI patch proposal.')
    return database.createAIPatchAudit(randomUUID(), pageId, operation, preview)
  })
  ipcMain.handle('ai:update-patch-audit', (_event, id, status) => {
    assertId(id)
    if (!['applied', 'undone', 'rejected'].includes(status)) throw new TypeError('Invalid AI patch status.')
    database.updateAIPatchAudit(id, status)
  })
  ipcMain.handle('model:get-config', () => {
    const stored = database.getSetting('model_config')
    return {
      ...(stored ? JSON.parse(stored) : { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b' }),
      hasApiKey: Boolean(database.getSetting('model_api_key')),
    }
  })
  ipcMain.handle('model:save-config', (_event, config) => {
    const normalized = validateModelConfig(config)
    database.setSetting('model_config', JSON.stringify(normalized))
    if (typeof config.apiKey === 'string' && config.apiKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS key encryption is unavailable.')
      database.setSetting('model_api_key', safeStorage.encryptString(config.apiKey).toString('base64'))
    }
    return { ...normalized, hasApiKey: Boolean(database.getSetting('model_api_key')) }
  })
  ipcMain.handle('model:test-connection', async () => {
    const stored = database.getSetting('model_config')
    if (!stored) throw new Error('Please save a model configuration first.')
    const config = validateModelConfig(JSON.parse(stored))
    const encryptedKey = database.getSetting('model_api_key')
    const apiKey = encryptedKey && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'))
      : ''
    const endpoint = new URL('models', config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    const startedAt = performance.now()
    try {
      const response = await fetch(endpoint, { signal: controller.signal, headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} })
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`)
      return { ok: true, latencyMs: Math.round(performance.now() - startedAt), endpoint: endpoint.toString() }
    } finally {
      clearTimeout(timeout)
    }
  })
  ipcMain.on('model:stream-chat', async (event, requestId, request) => {
    if (typeof requestId !== 'string' || requestId.length > 128) return
    const channel = `model:stream-event:${requestId}`
    let controller
    let cancelOnDestroyed
    try {
      validateModelRequest(request)
      const stored = database.getSetting('model_config')
      if (!stored) throw new Error('请先在设置中保存模型配置。')
      const config = validateModelConfig(JSON.parse(stored))
      const encryptedKey = database.getSetting('model_api_key')
      const apiKey = encryptedKey && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(encryptedKey, 'base64')) : ''
      activeModelRuns.get(requestId)?.abort()
      controller = new AbortController()
      cancelOnDestroyed = () => controller.abort()
      event.sender.once('destroyed', cancelOnDestroyed)
      activeModelRuns.set(requestId, controller)
      await modelService.stream(config, apiKey, request, controller.signal, (payload) => {
        if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
      })
    } catch (error) {
      if (!event.sender.isDestroyed()) event.sender.send(channel, controller?.signal.aborted
        ? { type: 'cancelled' }
        : { type: 'error', message: error instanceof Error ? error.message : '模型执行失败。' })
    } finally {
      if (cancelOnDestroyed && !event.sender.isDestroyed()) event.sender.removeListener('destroyed', cancelOnDestroyed)
      activeModelRuns.delete(requestId)
    }
  })
  ipcMain.on('model:cancel-chat', (_event, requestId) => activeModelRuns.get(requestId)?.abort())
}

function validateModelConfig(value) {
  if (!value || typeof value !== 'object') throw new TypeError('Model configuration is required.')
  const url = new URL(value.baseUrl)
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Model URL must use HTTP or HTTPS.')
  if (typeof value.model !== 'string' || value.model.length < 1 || value.model.length > 200) throw new TypeError('Invalid model name.')
  if (!['openai-compatible', 'ollama', 'lm-studio'].includes(value.provider)) throw new TypeError('Unsupported provider type.')
  return { provider: value.provider, baseUrl: url.toString().replace(/\/$/u, ''), model: value.model }
}

function validateModelRequest(value) {
  if (!value || !Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 100) throw new TypeError('Invalid model messages.')
  let totalLength = 0
  for (const message of value.messages) {
    if (!['system', 'user', 'assistant', 'tool'].includes(message.role) || typeof message.content !== 'string') throw new TypeError('Invalid model message.')
    totalLength += message.content.length
  }
  if (totalLength > 1_000_000) throw new TypeError('Model context is too large.')
}

async function createAssetThumbnail(assetRoot, attachment) {
  const sourcePath = path.resolve(assetRoot, attachment.relativePath)
  if (!sourcePath.startsWith(`${path.resolve(assetRoot)}${path.sep}`)) return false
  const thumbnailPath = path.join(assetRoot, 'thumbnails', attachment.hash.slice(0, 2), `${attachment.hash}.png`)
  try {
    await fs.promises.access(thumbnailPath)
    return true
  } catch {
    try {
      const thumbnail = await nativeImage.createThumbnailFromPath(sourcePath, { width: 1600, height: 1200 })
      if (thumbnail.isEmpty()) return false
      await fs.promises.mkdir(path.dirname(thumbnailPath), { recursive: true })
      const temporaryPath = `${thumbnailPath}.${randomUUID()}.pending`
      await fs.promises.writeFile(temporaryPath, thumbnail.toPNG(), { flag: 'wx' })
      try { await fs.promises.rename(temporaryPath, thumbnailPath) } catch (error) {
        await fs.promises.rm(temporaryPath, { force: true })
        if (error?.code !== 'EEXIST') throw error
      }
      return true
    } catch {
      // A preview is an optimization. Unsupported or malformed image data must
      // never prevent the original attachment from being inserted.
      return false
    }
  }
}

function createWindow() {
  const window = new BrowserWindow({
    show: process.env.NOTETODO_SMOKE_TEST !== '1',
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#f4f0e8',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#191b19',
      symbolColor: '#f4f0e8',
      height: 44,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    window.loadURL('http://127.0.0.1:5173')
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  if (process.env.NOTETODO_SMOKE_TEST === '1') {
    window.webContents.once('did-finish-load', async () => {
      try {
        // Running through the isolated preload API verifies the same complete
        // path used by the renderer: preload -> IPC -> SQLite -> IPC response.
        const result = await window.webContents.executeJavaScript(`
          Promise.all([
            window.notetodo.workspace.load(),
            window.notetodo.database.loadByPage('projects'),
            window.notetodo.model.saveConfig({
              provider: 'openai-compatible',
              baseUrl: 'http://127.0.0.1:65535/v1',
              model: 'smoke-model',
              apiKey: 'smoke-secret',
            }).then(() => window.notetodo.model.getConfig()),
            window.notetodo.sync.appendUpdate('welcome', 'smoke-client', btoa('smoke-update'))
              .then((updateId) => window.notetodo.sync.loadDocument('welcome').then((sync) => ({ updateId, sync }))),
            window.notetodo.collaboration.getTicket('welcome'),
            window.notetodo.comments.create('welcome', 'smoke comment', null).then(() => window.notetodo.comments.list('welcome')),
            window.notetodo.ai.createPatchAudit('welcome', 'insert-paragraphs', 'smoke patch').then((id) => window.notetodo.ai.updatePatchAudit(id, 'applied').then(() => id)),
            new Promise((resolve) => setTimeout(() => resolve(document.querySelector('.collaboration-presence')?.textContent ?? ''), 900)),
          ]).then(([workspace, database, model, syncResult, ticket, comments, patchId, collaborationLabel]) => ({
            pageCount: workspace.pages.length,
            activePageId: workspace.activePageId,
            databaseRecords: database.records.length,
            databaseViews: database.views.length,
            encryptedModelKey: model.hasApiKey,
            keyExposed: Object.hasOwn(model, 'apiKey'),
            syncUpdateId: syncResult.updateId,
            syncUpdateCount: syncResult.sync.updates.length,
            scopedTicketIssued: Boolean(ticket && ticket.token && !ticket.token.includes('smoke-collaboration-secret')),
            commentCount: comments.length,
            patchAuditId: patchId,
            collaborationLabel,
          }))
        `)
        console.log(`NOTETODO_SMOKE_OK ${JSON.stringify(result)}`)
        app.exit(0)
      } catch (error) {
        console.error('NOTETODO_SMOKE_FAILED', error)
        app.exit(1)
      }
    })
  }

  return window
}

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
}))

app.whenReady().then(() => {
  workspaceDatabase = new WorkspaceDatabase(path.join(app.getPath('userData'), 'workspace.db'))
  protocol.handle('notetodo-asset', async (request) => {
    const assetUrl = new URL(request.url)
    const hash = assetUrl.hostname.toLowerCase()
    const attachment = workspaceDatabase.getAttachment(hash)
    if (!attachment) return new Response('Not found', { status: 404 })
    const assetRoot = path.resolve(app.getPath('userData'), 'attachments')
    let thumbnail = assetUrl.searchParams.get('variant') === 'thumbnail'
    let target = thumbnail
      ? path.resolve(assetRoot, 'thumbnails', hash.slice(0, 2), `${hash}.png`)
      : path.resolve(assetRoot, attachment.relativePath)
    if (!target.startsWith(`${assetRoot}${path.sep}`)) return new Response('Forbidden', { status: 403 })
    try {
      if (thumbnail) {
        try { await fs.promises.access(target) } catch {
          if (!await createAssetThumbnail(assetRoot, attachment)) {
            thumbnail = false
            target = path.resolve(assetRoot, attachment.relativePath)
          }
        }
      }
      await fs.promises.access(target, fs.constants.R_OK)
      const stat = await fs.promises.stat(target)
      return new Response(Readable.toWeb(fs.createReadStream(target)), { headers: { 'Content-Type': thumbnail ? 'image/png' : attachment.mimeType, 'Content-Length': String(stat.size), 'Cache-Control': 'public, max-age=31536000, immutable' } })
    } catch { return new Response('Not found', { status: 404 }) }
  })
  registerWorkspaceIpc(workspaceDatabase)
  webhookWorker = new WebhookWorker(workspaceDatabase, (ciphertext) => safeStorage.decryptString(ciphertext))
  webhookWorker.start()
  const assetRoot = path.join(app.getPath('userData'), 'attachments')
  void collectUnusedAssets(workspaceDatabase, assetRoot)
  assetGcTimer = setInterval(() => { void collectUnusedAssets(workspaceDatabase, assetRoot) }, 6 * 60 * 60_000)
  assetGcTimer.unref()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => { clearInterval(assetGcTimer); webhookWorker?.stop(); workspaceDatabase?.close() })
