const { contextBridge, ipcRenderer } = require('electron')

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
  database: {
    loadByPage: (pageId) => ipcRenderer.invoke('database:load-by-page', pageId),
    updateCell: (recordId, propertyId, value) => ipcRenderer.invoke('database:update-cell', recordId, propertyId, value),
    createRecord: (databaseId, recordId) => ipcRenderer.invoke('database:create-record', databaseId, recordId),
    setActiveView: (databaseId, viewId) => ipcRenderer.invoke('database:set-active-view', databaseId, viewId),
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
