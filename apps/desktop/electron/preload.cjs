const { contextBridge, ipcRenderer, webUtils } = require('electron')

function invokeAttachmentStore(channel, pageId, value, onProgress) {
  const requestId = crypto.randomUUID()
  const progressChannel = `attachments:progress:${requestId}`
  const listener = (_event, progress) => onProgress(progress)
  ipcRenderer.on(progressChannel, listener)
  return ipcRenderer.invoke(channel, pageId, value, requestId)
    .finally(() => ipcRenderer.removeListener(progressChannel, listener))
}

contextBridge.exposeInMainWorld('notetodo', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  workspace: {
    load: () => ipcRenderer.invoke('workspace:load'),
    upsertPage: (page) => ipcRenderer.invoke('workspace:upsert-page', page),
    setActivePage: (id) => ipcRenderer.invoke('workspace:set-active-page', id),
    archivePage: (id) => ipcRenderer.invoke('workspace:archive-page', id),
    restorePage: (id) => ipcRenderer.invoke('workspace:restore-page', id),
    search: (query) => ipcRenderer.invoke('workspace:search', query),
  },
  history: {
    list: (pageId) => ipcRenderer.invoke('history:list', pageId),
    get: (pageId, versionId) => ipcRenderer.invoke('history:get', pageId, versionId),
    restore: (pageId, versionId) => ipcRenderer.invoke('history:restore', pageId, versionId),
  },
  retrieval: {
    search: (query, limit) => ipcRenderer.invoke('retrieval:search', query, limit),
  },
  platform: {
    listTokens: () => ipcRenderer.invoke('platform:list-tokens'),
    issueToken: (name, scopes) => ipcRenderer.invoke('platform:issue-token', name, scopes),
    revokeToken: (id) => ipcRenderer.invoke('platform:revoke-token', id),
  },
  webhooks: {
    list: () => ipcRenderer.invoke('webhooks:list'),
    create: (name, url, events) => ipcRenderer.invoke('webhooks:create', name, url, events),
    setActive: (id, active) => ipcRenderer.invoke('webhooks:set-active', id, active),
    listDeliveries: (endpointId) => ipcRenderer.invoke('webhooks:list-deliveries', endpointId),
  },
  automations: {
    list: (databaseId) => ipcRenderer.invoke('automations:list', databaseId),
    save: (databaseId, rule) => ipcRenderer.invoke('automations:save', databaseId, rule),
    setEnabled: (id, enabled) => ipcRenderer.invoke('automations:set-enabled', id, enabled),
    listRuns: (databaseId) => ipcRenderer.invoke('automations:list-runs', databaseId),
    replay: (runId) => ipcRenderer.invoke('automations:replay', runId),
  },
  database: {
    loadByPage: (pageId) => ipcRenderer.invoke('database:load-by-page', pageId),
    create: (pageId, databaseId, name) => ipcRenderer.invoke('database:create', pageId, databaseId, name),
    addProperty: (databaseId, propertyId, name, type) => ipcRenderer.invoke('database:add-property', databaseId, propertyId, name, type),
    renameProperty: (databaseId, propertyId, name) => ipcRenderer.invoke('database:rename-property', databaseId, propertyId, name),
    deleteProperty: (databaseId, propertyId) => ipcRenderer.invoke('database:delete-property', databaseId, propertyId),
    updateCell: (recordId, propertyId, value) => ipcRenderer.invoke('database:update-cell', recordId, propertyId, value),
    createRecord: (databaseId, recordId) => ipcRenderer.invoke('database:create-record', databaseId, recordId),
    updateRecordContent: (recordId, content) => ipcRenderer.invoke('database:update-record-content', recordId, content),
    setActiveView: (databaseId, viewId) => ipcRenderer.invoke('database:set-active-view', databaseId, viewId),
    updateViewConfig: (databaseId, viewId, config) => ipcRenderer.invoke('database:update-view-config', databaseId, viewId, config),
    createView: (databaseId, viewId, name, type, config) => ipcRenderer.invoke('database:create-view', databaseId, viewId, name, type, config),
    renameView: (databaseId, viewId, name) => ipcRenderer.invoke('database:rename-view', databaseId, viewId, name),
    deleteView: (databaseId, viewId) => ipcRenderer.invoke('database:delete-view', databaseId, viewId),
    setDefaultView: (databaseId, viewId) => ipcRenderer.invoke('database:set-default-view', databaseId, viewId),
  },
  sync: {
    loadDocument: (pageId) => ipcRenderer.invoke('sync:load-document', pageId),
    appendUpdate: (pageId, clientId, data) => ipcRenderer.invoke('sync:append-update', pageId, clientId, data),
    compactDocument: (pageId, snapshot, throughId) => ipcRenderer.invoke('sync:compact-document', pageId, snapshot, throughId),
  },
  collaboration: {
    getTicket: (pageId) => ipcRenderer.invoke('collaboration:get-ticket', pageId),
  },
  ai: {
    createPatchAudit: (pageId, operation, preview) => ipcRenderer.invoke('ai:create-patch-audit', pageId, operation, preview),
    updatePatchAudit: (id, status) => ipcRenderer.invoke('ai:update-patch-audit', id, status),
  },
  sharing: {
    list: (pageId) => ipcRenderer.invoke('sharing:list', pageId),
    upsert: (pageId, subjectId, displayName, role) => ipcRenderer.invoke('sharing:upsert', pageId, subjectId, displayName, role),
    remove: (pageId, subjectId) => ipcRenderer.invoke('sharing:remove', pageId, subjectId),
  },
  comments: {
    list: (pageId) => ipcRenderer.invoke('comments:list', pageId),
    create: (pageId, body, anchor, mentions) => ipcRenderer.invoke('comments:create', pageId, body, anchor, mentions),
    resolve: (id) => ipcRenderer.invoke('comments:resolve', id),
  },
  notifications: {
    list: () => ipcRenderer.invoke('notifications:list'),
    markRead: (id) => ipcRenderer.invoke('notifications:mark-read', id),
  },
  imports: {
    pickAndInspect: () => ipcRenderer.invoke('import:pick-and-inspect'),
    start: (importId, onProgress) => {
      const requestId = crypto.randomUUID()
      const channel = `import:progress:${requestId}`
      const listener = (_event, progress) => onProgress(progress)
      ipcRenderer.on(channel, listener)
      const promise = ipcRenderer.invoke('import:start', importId, requestId).finally(() => ipcRenderer.removeListener(channel, listener))
      return { promise, cancel: () => ipcRenderer.send('import:cancel', requestId) }
    },
    listJobs: () => ipcRenderer.invoke('import:list-jobs'),
  },
  attachments: {
    pickAndStore: (pageId, kind, onProgress) => invokeAttachmentStore('attachments:pick-and-store', pageId, kind, onProgress),
    storeDropped: async (pageId, files, onProgress) => {
      const pathBacked = []
      const memoryBacked = []
      for (const file of Array.from(files)) {
        const filePath = webUtils.getPathForFile(file)
        if (filePath) pathBacked.push(filePath)
        else memoryBacked.push({ name: file.name || '粘贴图片.png', data: await file.arrayBuffer() })
      }
      const stored = []
      if (pathBacked.length) stored.push(...await invokeAttachmentStore('attachments:store-dropped', pageId, pathBacked, onProgress))
      if (memoryBacked.length) stored.push(...await invokeAttachmentStore('attachments:store-memory', pageId, memoryBacked, onProgress))
      return stored
    },
    open: (hash, displayName) => ipcRenderer.invoke('attachments:open', hash, displayName),
    export: (hash, displayName) => ipcRenderer.invoke('attachments:export', hash, displayName),
  },
  model: {
    getConfig: () => ipcRenderer.invoke('model:get-config'),
    saveConfig: (config) => ipcRenderer.invoke('model:save-config', config),
    testConnection: () => ipcRenderer.invoke('model:test-connection'),
    streamChat: (request, onEvent) => {
      const requestId = crypto.randomUUID()
      const channel = `model:stream-event:${requestId}`
      const listener = (_event, payload) => {
        onEvent(payload)
        if (['done', 'error', 'cancelled'].includes(payload.type)) ipcRenderer.removeListener(channel, listener)
      }
      ipcRenderer.on(channel, listener)
      ipcRenderer.send('model:stream-chat', requestId, request)
      return () => {
        ipcRenderer.send('model:cancel-chat', requestId)
        ipcRenderer.removeListener(channel, listener)
      }
    },
  },
})
