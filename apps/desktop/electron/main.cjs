const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron')
const path = require('node:path')
const { WorkspaceDatabase } = require('./workspace-db.cjs')
const { ModelService } = require('./model-service.cjs')
const { signRoomTicket } = require('@notetodo/auth-core')
const { randomUUID } = require('node:crypto')

const isDev = !app.isPackaged
let workspaceDatabase
const modelService = new ModelService()
const activeModelRuns = new Map()

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
  ipcMain.handle('database:load-by-page', (_event, pageId) => {
    assertId(pageId)
    return database.loadDatabaseByPage(pageId)
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
  ipcMain.handle('database:set-active-view', (_event, databaseId, viewId) => {
    assertId(databaseId)
    assertId(viewId)
    database.setActiveDatabaseView(databaseId, viewId)
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
    const identity = { userId, name: '本机用户', color: '#c45134' }
    const role = database.getPageRole(pageId, userId)
    if (!role) database.upsertPagePermission(pageId, userId, identity.name, 'owner')
    else if (!['editor', 'owner'].includes(role)) throw new Error('当前用户没有编辑此页面的权限。')
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
  ipcMain.handle('comments:list', (_event, pageId) => { assertId(pageId); return database.loadComments(pageId) })
  ipcMain.handle('comments:create', (_event, pageId, body, anchor) => {
    assertId(pageId)
    if (typeof body !== 'string' || body.trim().length < 1 || body.length > 10_000) throw new TypeError('Invalid comment body.')
    let userId = database.getSetting('collaboration_user_id')
    if (!userId) { userId = randomUUID(); database.setSetting('collaboration_user_id', userId) }
    if (anchor !== null && anchor !== undefined && (!Number.isSafeInteger(anchor.from) || !Number.isSafeInteger(anchor.to) || anchor.from < 0 || anchor.to < anchor.from || typeof anchor.quote !== 'string' || anchor.quote.length > 1000)) throw new TypeError('Invalid comment anchor.')
    const comment = { id: randomUUID(), pageId, authorId: userId, authorName: '本机用户', body: body.trim(), anchor: anchor ?? null }
    database.createComment(comment)
    return comment.id
  })
  ipcMain.handle('comments:resolve', (_event, id) => { assertId(id); database.resolveComment(id) })
  ipcMain.handle('ai:create-patch-audit', (_event, pageId, operation, preview) => {
    assertId(pageId)
    if (operation !== 'insert-paragraphs' || typeof preview !== 'string' || preview.length > 200_000) throw new TypeError('Invalid AI patch proposal.')
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
  registerWorkspaceIpc(workspaceDatabase)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => workspaceDatabase?.close())
