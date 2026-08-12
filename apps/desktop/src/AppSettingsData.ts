import type { ApiScope } from '@notetodo/auth-core'
import type { WebhookEvent } from '@notetodo/webhook-core'

export type ModelForm = {
  provider: 'openai-compatible' | 'ollama' | 'lm-studio'
  baseUrl: string
  model: string
  apiKey: string
  hasApiKey: boolean
}

export type PlatformToken = {
  id: string
  name: string
  prefix: string
  scopes: ApiScope[]
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export type WebhookEndpoint = {
  id: string
  name: string
  url: string
  events: WebhookEvent[]
  active: boolean
  pendingCount: number
  deadCount: number
}

export type SettingsSection = 'model' | 'tokens' | 'webhooks'

export const platformScopes: Array<{ id: ApiScope; label: string }> = [
  { id: 'pages:read', label: '页面读取' },
  { id: 'pages:write', label: '页面写入' },
  { id: 'databases:read', label: '数据库读取' },
  { id: 'databases:write', label: '数据库写入' },
  { id: 'webhooks:manage', label: 'Webhook 管理' },
  { id: 'automations:manage', label: '自动化管理' },
]

export const webhookEvents: Array<{ id: WebhookEvent; label: string }> = [
  { id: 'page.created', label: '页面创建' },
  { id: 'page.updated', label: '页面更新' },
  { id: 'page.archived', label: '页面归档' },
  { id: 'database.record.created', label: '记录创建' },
  { id: 'database.record.updated', label: '记录更新' },
]
