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
    database: {
      loadByPage: (pageId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot | null>
      updateCell: (recordId: string, propertyId: string, value: import('@notetodo/database-core').PropertyValue) => Promise<void>
      createRecord: (databaseId: string, recordId: string) => Promise<void>
      setActiveView: (databaseId: string, viewId: string) => Promise<void>
    }
    sync: {
      loadDocument: (pageId: string) => Promise<{ snapshot: string | null; updates: Array<{ id: number; clientId: string; data: string }>; latestUpdateId: number }>
      appendUpdate: (pageId: string, clientId: string, data: string) => Promise<number>
      compactDocument: (pageId: string, snapshot: string, throughId: number) => Promise<void>
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
