/// <reference types="vite/client" />

interface Window {
  notetodo?: {
    getAppInfo: () => Promise<{ version: string; platform: string }>
    workspace: {
      load: () => Promise<import('./domain').WorkspaceSnapshot>
      upsertPage: (page: import('./domain').WorkspacePage) => Promise<import('./domain').WorkspacePage>
      setActivePage: (id: string) => Promise<void>
      archivePage: (id: string) => Promise<void>
      restorePage: (id: string) => Promise<void>
      search: (query: string) => Promise<import('./domain').WorkspacePage[]>
    }
    history: {
      list: (pageId: string) => Promise<Array<{ id: number; pageId: string; title: string; reason: 'autosave' | 'restore'; createdAt: string; contentLength: number; preview: string }>>
      get: (pageId: string, versionId: number) => Promise<null | { id: number; pageId: string; title: string; content: string; reason: 'autosave' | 'restore'; createdAt: string }>
      restore: (pageId: string, versionId: number) => Promise<import('./domain').WorkspacePage>
    }
    retrieval: {
      search: (query: string, limit?: number) => Promise<Array<{ citationId: string; pageId: string; chunkIndex: number; title: string; heading: string; excerpt: string; score: number }>>
    }
    platform: {
      listTokens: () => Promise<Array<{ id: string; name: string; prefix: string; scopes: import('@notetodo/auth-core').ApiScope[]; expiresAt: string | null; revokedAt: string | null; lastUsedAt: string | null; createdAt: string }>>
      issueToken: (name: string, scopes: import('@notetodo/auth-core').ApiScope[]) => Promise<{ id: string; name: string; rawToken: string; prefix: string; scopes: import('@notetodo/auth-core').ApiScope[]; createdAt: string }>
      revokeToken: (id: string) => Promise<boolean>
    }
    webhooks: {
      list: () => Promise<Array<{ id: string; name: string; url: string; events: import('@notetodo/webhook-core').WebhookEvent[]; active: boolean; pendingCount: number; deadCount: number; createdAt: string; updatedAt: string }>>
      create: (name: string, url: string, events: import('@notetodo/webhook-core').WebhookEvent[]) => Promise<{ id: string; name: string; url: string; events: import('@notetodo/webhook-core').WebhookEvent[]; active: boolean; secret: string }>
      setActive: (id: string, active: boolean) => Promise<boolean>
      listDeliveries: (endpointId: string) => Promise<Array<{ id: string; event: import('@notetodo/webhook-core').WebhookEvent; status: 'pending' | 'leased' | 'delivered' | 'dead'; attempts: number; nextAttemptAt: string; lastError: string | null; createdAt: string; deliveredAt: string | null }>>
    }
    automations: {
      list: (databaseId: string) => Promise<Array<import('@notetodo/automation-core').AutomationRule & { createdAt: string; updatedAt: string }>>
      save: (databaseId: string, rule: import('@notetodo/automation-core').AutomationRule) => Promise<import('@notetodo/automation-core').AutomationRule>
      setEnabled: (id: string, enabled: boolean) => Promise<boolean>
      listRuns: (databaseId: string) => Promise<Array<{ id: string; automationId: string | null; automationName: string; recordId: string; triggerPropertyId: string; output: Array<{ propertyId: string; value: import('@notetodo/automation-core').AutomationValue }>; status: 'succeeded' | 'failed'; errorMessage: string | null; replayOf: string | null; createdAt: string; completedAt: string }>>
      replay: (runId: string) => Promise<string>
    }
    database: {
      loadByPage: (pageId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot | null>
      create: (pageId: string, databaseId: string, name: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      addProperty: (databaseId: string, propertyId: string, name: string, type: import('@notetodo/database-core').PropertyType) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      listSources: () => Promise<Array<{ id: string; pageId: string; name: string; pageTitle: string; recordCount: number }>>
      updatePropertyConfig: (databaseId: string, propertyId: string, config: Partial<Pick<import('@notetodo/database-core').DatabaseProperty, 'options' | 'relation' | 'rollup' | 'formula' | 'constraints'>>) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      rename: (databaseId: string, name: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      reorderProperties: (databaseId: string, propertyIds: string[]) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      renameProperty: (databaseId: string, propertyId: string, name: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      deleteProperty: (databaseId: string, propertyId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      updateCell: (recordId: string, propertyId: string, value: import('@notetodo/database-core').PropertyValue) => Promise<{ automationRuns: string[] }>
      createRecord: (databaseId: string, recordId: string) => Promise<void>
      duplicateRecord: (databaseId: string, sourceRecordId: string, recordId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      trashRecords: (databaseId: string, recordIds: string[]) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      listTrashedRecords: (databaseId: string) => Promise<import('@notetodo/database-core').DatabaseTrashRecord[]>
      restoreRecords: (databaseId: string, recordIds: string[]) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      deleteRecordsPermanently: (databaseId: string, recordIds: string[]) => Promise<void>
      updateRecordContent: (recordId: string, content: string) => Promise<void>
      setActiveView: (databaseId: string, viewId: string) => Promise<void>
      updateViewConfig: (databaseId: string, viewId: string, config: import('@notetodo/database-core').DatabaseViewConfig) => Promise<void>
      createView: (databaseId: string, viewId: string, name: string, type: import('@notetodo/database-core').DatabaseView['type'], config: import('@notetodo/database-core').DatabaseViewConfig) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      renameView: (databaseId: string, viewId: string, name: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      deleteView: (databaseId: string, viewId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      setDefaultView: (databaseId: string, viewId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      bulkUpdate: (databaseId: string, recordIds: string[], propertyId: string, value: import('@notetodo/database-core').PropertyValue) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      importRecords: (databaseId: string, records: Array<{ id: string; values: Record<string, import('@notetodo/database-core').PropertyValue> }>) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      saveTemplate: (databaseId: string, template: import('@notetodo/database-core').DatabaseTemplate) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      deleteTemplate: (databaseId: string, templateId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      createFromTemplate: (databaseId: string, templateId: string, recordId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
      exportCsv: (suggestedName: string, csv: string) => Promise<boolean>
    }
    sync: {
      loadDocument: (pageId: string) => Promise<{ snapshot: string | null; updates: Array<{ id: number; clientId: string; data: string }>; latestUpdateId: number }>
      appendUpdate: (pageId: string, clientId: string, data: string) => Promise<number>
      compactDocument: (pageId: string, snapshot: string, throughId: number) => Promise<void>
    }
    collaboration: {
      getTicket: (pageId: string) => Promise<null | { endpoint: string; token: string; userId: string; name: string; color: string; role: 'viewer' | 'commenter' | 'editor' | 'owner' }>
    }
    ai: {
      createPatchAudit: (pageId: string, operation: 'insert-paragraphs' | 'replace-selection', preview: string) => Promise<string>
      updatePatchAudit: (id: string, status: 'applied' | 'undone' | 'rejected') => Promise<void>
    }
    sharing: {
      list: (pageId: string) => Promise<Array<{ subjectId: string; displayName: string; role: 'viewer' | 'commenter' | 'editor' | 'owner' }>>
      upsert: (pageId: string, subjectId: string, displayName: string, role: 'viewer' | 'commenter' | 'editor') => Promise<void>
      remove: (pageId: string, subjectId: string) => Promise<void>
    }
    comments: {
      list: (pageId: string) => Promise<Array<{ id: string; authorName: string; body: string; anchor: null | { from: number; to: number; quote: string }; resolvedAt: string | null; createdAt: string }>>
      create: (pageId: string, body: string, anchor: null | { from: number; to: number; quote: string }, mentions?: string[]) => Promise<string>
      resolve: (id: string) => Promise<void>
    }
    notifications: {
      list: () => Promise<Array<{ id: string; type: 'mention' | 'comment'; readAt: string | null; createdAt: string; pageId: string; pageTitle: string; authorName: string; body: string }>>
      markRead: (id: string) => Promise<void>
    }
    imports: {
      pickAndInspect: () => Promise<null | {
        importId: string
        fileName: string
        compressedBytes: number
        acceptedBytes: number
        rejected: boolean
        summary: { page: number; database: number; asset: number; sitemap: number; unsupported: number }
        entries: Array<{ path: string; kind: 'page' | 'database' | 'asset' | 'sitemap' | 'unsupported'; size: number }>
        issues: Array<{ code: string; path?: string; message: string }>
      }>
      start: (
        importId: string,
        onProgress: (progress: { phase: 'convert' | 'commit' | 'done'; completed: number; total: number; path?: string }) => void,
      ) => {
        promise: Promise<{ rootPageId: string; pageCount: number; databaseCount: number; importedPages: number; importedDatabases: number; importedAssets: number; skippedAssets: number; unsupported: number; unresolvedLinks: number }>
        cancel: () => void
      }
      listJobs: () => Promise<Array<{ id: string; sourceName: string; status: 'converting' | 'committing' | 'completed' | 'failed' | 'cancelled'; report: Record<string, number>; errorMessage: string | null; createdAt: string; updatedAt: string }>>
    }
    attachments: {
      pickAndStore: (pageId: string, kind: 'image' | 'file', onProgress: (progress: { completed: number; total: number; currentName: string }) => void) => Promise<Array<{ hash: string; size: number; mimeType: string; displayName: string; url: string; previewUrl: string | null }>>
      storeDropped: (pageId: string, files: File[], onProgress: (progress: { completed: number; total: number; currentName: string }) => void) => Promise<Array<{ hash: string; size: number; mimeType: string; displayName: string; url: string; previewUrl: string | null }>>
      open: (hash: string, displayName: string) => Promise<void>
      export: (hash: string, displayName: string) => Promise<boolean>
    }
    model: {
      getConfig: () => Promise<{ provider: 'openai-compatible' | 'ollama' | 'lm-studio'; baseUrl: string; model: string; hasApiKey: boolean }>
      saveConfig: (config: { provider: string; baseUrl: string; model: string; apiKey?: string }) => Promise<{ provider: 'openai-compatible' | 'ollama' | 'lm-studio'; baseUrl: string; model: string; hasApiKey: boolean }>
      testConnection: () => Promise<{ ok: boolean; endpoint: string }>
      streamChat: (
        request: { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; temperature?: number },
        onEvent: (event: { type: 'text-delta' | 'usage' | 'done' | 'cancelled' | 'error'; text?: string; message?: string; inputTokens?: number; outputTokens?: number }) => void,
      ) => () => void
    }
  }
}
