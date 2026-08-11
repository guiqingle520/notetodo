const { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, safeStorage, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const { WorkspaceDatabase } = require('./workspace-db.cjs')
const { WebhookWorker } = require('./webhook-worker.cjs')
const { ModelService } = require('./model-service.cjs')
const { collectUnusedAssets, isRenderableImage, safeDisplayName, storeLocalAsset } = require('./asset-store.cjs')
const { signRoomTicket } = require('@notetodo/auth-core')
const { randomUUID } = require('node:crypto')
const { createTrustedIpcHandler, createTrustedIpcListener } = require('./ipc-security.cjs')
const { appInfoIpcContract } = require('./ipc-contracts.cjs')
const { workspaceIpcContracts } = require('./ipc-workspace-contracts.cjs')
const { assertModelStreamEvent, modelIpcContracts, normalizeModelConfig } = require('./ipc-model-contracts.cjs')
const { syncIpcContracts } = require('./ipc-sync-contracts.cjs')
const { collaborationIpcContracts } = require('./ipc-collaboration-contracts.cjs')
const { removePagePermission, resolveLocalCollaborationIdentity, upsertPagePermission } = require('./ipc-collaboration-authorization.cjs')
const { commentsIpcContracts } = require('./ipc-comments-contracts.cjs')
const { aiIpcContracts } = require('./ipc-ai-contracts.cjs')
const { attachmentIpcContracts } = require('./ipc-attachment-contracts.cjs')
const { platformIpcContracts } = require('./ipc-platform-contracts.cjs')
const { webhookIpcContracts } = require('./ipc-webhook-contracts.cjs')
const { createWebhookEndpoint } = require('./ipc-webhook-service.cjs')
const { registerAutomationIpc } = require('./ipc-automation-register.cjs')
const { registerHistoryIpc } = require('./ipc-history-register.cjs')
const { registerRetrievalIpc } = require('./ipc-retrieval-register.cjs')
const { registerImportIpc } = require('./ipc-import-register.cjs')
const { registerDatabaseIpc } = require('./ipc-database-register.cjs')
const isDev = !app.isPackaged && process.env.NOTETODO_E2E_TEST !== '1'
const handleTrusted = createTrustedIpcHandler(ipcMain, {
  isDevelopment: isDev,
  developmentUrl: 'http://127.0.0.1:5173',
  packagedRendererPath: path.join(__dirname, '../dist/index.html'),
})
const onTrusted = createTrustedIpcListener(ipcMain, {
  isDevelopment: isDev,
  developmentUrl: 'http://127.0.0.1:5173',
  packagedRendererPath: path.join(__dirname, '../dist/index.html'),
})
let workspaceDatabase
const modelService = new ModelService()
const activeModelRuns = new Map()
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
const isolatedDataDir = process.env.NOTETODO_E2E_DATA_DIR ?? process.env.NOTETODO_SMOKE_DATA_DIR
if ((process.env.NOTETODO_SMOKE_TEST === '1' || process.env.NOTETODO_E2E_TEST === '1') && isolatedDataDir) {
  if (!path.isAbsolute(isolatedDataDir)) throw new Error('Test data directory must be absolute.')
  app.setPath('userData', isolatedDataDir)
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

  handleTrusted('workspace:load', workspaceIpcContracts.load, () => database.loadWorkspace())
  handleTrusted('workspace:upsert-page', workspaceIpcContracts.upsertPage, (_event, page) => database.upsertPage(page))
  handleTrusted('workspace:set-active-page', workspaceIpcContracts.setActivePage, (_event, id) => database.setActivePage(id))
  handleTrusted('workspace:archive-page', workspaceIpcContracts.archivePage, (_event, id) => database.archivePage(id))
  handleTrusted('workspace:restore-page', workspaceIpcContracts.restorePage, (_event, id) => database.restorePage(id))
  handleTrusted('workspace:search', workspaceIpcContracts.search, (_event, query) => database.searchPages(query))
  handleTrusted('platform:list-tokens', platformIpcContracts.listTokens, () => database.listApiTokens())
  handleTrusted('platform:issue-token', platformIpcContracts.issueToken, (_event, name, scopes) => database.issueApiToken(name, scopes))
  handleTrusted('platform:revoke-token', platformIpcContracts.revokeToken, (_event, id) => database.revokeApiToken(id))
  handleTrusted('webhooks:list', webhookIpcContracts.list, () => database.listWebhookEndpoints())
  handleTrusted('webhooks:create', webhookIpcContracts.create, (_event, name, url, events) => createWebhookEndpoint({ database, safeStorageApi: safeStorage, name, url, events }))
  handleTrusted('webhooks:set-active', webhookIpcContracts.setActive, (_event, id, active) => database.setWebhookEndpointActive(id, active))
  handleTrusted('webhooks:list-deliveries', webhookIpcContracts.listDeliveries, (_event, endpointId) => database.listWebhookDeliveries(endpointId))
  registerAutomationIpc(handleTrusted, database)
  registerHistoryIpc(handleTrusted, database)
  registerRetrievalIpc(handleTrusted, database)
  registerImportIpc({ handleTrusted, onTrusted, database, dialogApi: dialog, assetStoreDir: path.join(app.getPath('userData'), 'attachments') })
  handleTrusted('attachments:pick-and-store', attachmentIpcContracts.pickAndStore, async (event, pageId, kind, requestId) => {
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
  handleTrusted('attachments:store-dropped', attachmentIpcContracts.storeDropped, (event, pageId, filePaths, requestId) => storeAttachmentPaths(event, pageId, filePaths, requestId))
  handleTrusted('attachments:store-memory', attachmentIpcContracts.storeMemory, async (event, pageId, items, requestId) => {
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
  handleTrusted('attachments:open', attachmentIpcContracts.open, async (_event, hash, requestedName) => {
    const { sourcePath } = resolveAttachment(hash)
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
  handleTrusted('attachments:export', attachmentIpcContracts.export, async (_event, hash, requestedName) => {
    const { sourcePath } = resolveAttachment(hash)
    const displayName = safeDisplayName(requestedName)
    const selected = await dialog.showSaveDialog({ title: '导出附件', defaultPath: displayName, buttonLabel: '导出' })
    if (selected.canceled || !selected.filePath) return false
    await fs.promises.copyFile(sourcePath, selected.filePath)
    return true
  })
  registerDatabaseIpc({ handleTrusted, database, dialogApi: dialog })
  handleTrusted('sync:load-document', syncIpcContracts.loadDocument, (_event, pageId) => database.loadSyncDocument(pageId))
  handleTrusted('sync:append-update', syncIpcContracts.appendUpdate, (_event, pageId, clientId, data) => database.appendSyncUpdate(pageId, clientId, data))
  handleTrusted('sync:compact-document', syncIpcContracts.compactDocument, (_event, pageId, snapshot, throughId) => database.compactSyncDocument(pageId, snapshot, throughId))
  handleTrusted('collaboration:get-ticket', collaborationIpcContracts.getTicket, (_event, pageId) => {
    const secret = process.env.NOTETODO_COLLAB_TOKEN
    if (!secret) return null
    const identity = resolveLocalCollaborationIdentity(database, pageId)
    return {
      endpoint: process.env.NOTETODO_COLLAB_URL ?? 'ws://127.0.0.1:4789',
      ...identity,
      token: signRoomTicket({ pageId, ...identity, ttlSeconds: 300 }, secret),
    }
  })
  handleTrusted('sharing:list', collaborationIpcContracts.listPermissions, (_event, pageId) => database.loadPagePermissions(pageId))
  handleTrusted('sharing:upsert', collaborationIpcContracts.upsertPermission, (_event, pageId, subjectId, displayName, role) => upsertPagePermission(database, pageId, subjectId, displayName, role))
  handleTrusted('sharing:remove', collaborationIpcContracts.removePermission, (_event, pageId, subjectId) => removePagePermission(database, pageId, subjectId))
  handleTrusted('comments:list', commentsIpcContracts.list, (_event, pageId) => database.loadComments(pageId))
  handleTrusted('comments:create', commentsIpcContracts.create, (_event, pageId, body, anchor, mentions = []) => {
    let userId = database.getSetting('collaboration_user_id')
    if (!userId) { userId = randomUUID(); database.setSetting('collaboration_user_id', userId) }
    const allowedSubjects = new Set(database.loadPagePermissions(pageId).map((permission) => permission.subjectId))
    const validatedMentions = [...new Set(mentions)].filter((id) => allowedSubjects.has(id))
    const comment = { id: randomUUID(), pageId, authorId: userId, authorName: '本机用户', body: body.trim(), anchor: anchor ?? null, mentions: validatedMentions }
    database.createComment(comment)
    return comment.id
  })
  handleTrusted('comments:resolve', commentsIpcContracts.resolve, (_event, id) => database.resolveComment(id))
  handleTrusted('notifications:list', commentsIpcContracts.listNotifications, () => {
    const userId = database.getSetting('collaboration_user_id')
    return userId ? database.loadNotifications(userId) : []
  })
  handleTrusted('notifications:mark-read', commentsIpcContracts.markNotificationRead, (_event, id) => {
    const userId = database.getSetting('collaboration_user_id')
    if (userId) database.markNotificationRead(id, userId)
  })
  handleTrusted('ai:create-patch-audit', aiIpcContracts.createPatchAudit, (_event, pageId, operation, preview) => database.createAIPatchAudit(randomUUID(), pageId, operation, preview))
  handleTrusted('ai:update-patch-audit', aiIpcContracts.updatePatchAudit, (_event, id, status) => database.updateAIPatchAudit(id, status))
  handleTrusted('model:get-config', modelIpcContracts.getConfig, () => {
    const stored = database.getSetting('model_config')
    return {
      ...normalizeModelConfig(stored ? JSON.parse(stored) : { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b' }),
      hasApiKey: Boolean(database.getSetting('model_api_key')),
    }
  })
  handleTrusted('model:save-config', modelIpcContracts.saveConfig, (_event, config) => {
    const normalized = normalizeModelConfig(config)
    database.setSetting('model_config', JSON.stringify(normalized))
    if (typeof config.apiKey === 'string' && config.apiKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('OS key encryption is unavailable.')
      database.setSetting('model_api_key', safeStorage.encryptString(config.apiKey).toString('base64'))
    }
    return { ...normalized, hasApiKey: Boolean(database.getSetting('model_api_key')) }
  })
  handleTrusted('model:test-connection', modelIpcContracts.testConnection, async () => {
    const stored = database.getSetting('model_config')
    if (!stored) throw new Error('Please save a model configuration first.')
    const config = normalizeModelConfig(JSON.parse(stored))
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
  onTrusted('model:stream-chat', modelIpcContracts.streamChat, async (event, requestId, request) => {
    const channel = `model:stream-event:${requestId}`
    let controller
    let cancelOnDestroyed
    const sendEvent = (payload) => {
      assertModelStreamEvent(payload)
      if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
    }
    try {
      const stored = database.getSetting('model_config')
      if (!stored) throw new Error('请先在设置中保存模型配置。')
      const config = normalizeModelConfig(JSON.parse(stored))
      const encryptedKey = database.getSetting('model_api_key')
      const apiKey = encryptedKey && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(encryptedKey, 'base64')) : ''
      activeModelRuns.get(requestId)?.abort()
      controller = new AbortController()
      cancelOnDestroyed = () => controller.abort()
      event.sender.once('destroyed', cancelOnDestroyed)
      activeModelRuns.set(requestId, controller)
      await modelService.stream(config, apiKey, request, controller.signal, sendEvent)
    } catch (error) {
      if (!event.sender.isDestroyed()) sendEvent(controller?.signal.aborted
        ? { type: 'cancelled' }
        : { type: 'error', message: error instanceof Error ? error.message : '模型执行失败。' })
    } finally {
      if (cancelOnDestroyed && !event.sender.isDestroyed()) event.sender.removeListener('destroyed', cancelOnDestroyed)
      activeModelRuns.delete(requestId)
    }
  })
  onTrusted('model:cancel-chat', modelIpcContracts.cancelChat, (_event, requestId) => activeModelRuns.get(requestId)?.abort())
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
        console.warn(`NOTETODO_SMOKE_OK ${JSON.stringify(result)}`)
        app.exit(0)
      } catch (error) {
        console.error('NOTETODO_SMOKE_FAILED', error)
        app.exit(1)
      }
    })
  }

  return window
}

handleTrusted('app:info', appInfoIpcContract, () => ({
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
