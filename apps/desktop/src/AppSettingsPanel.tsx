import type { ApiScope } from '@notetodo/auth-core'
import type { WebhookEvent } from '@notetodo/webhook-core'
import {
  CheckCircle2,
  CircleHelp,
  Copy,
  Cpu,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  Webhook,
  Wifi,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  platformScopes,
  webhookEvents,
  type ModelForm,
  type PlatformToken,
  type SettingsSection,
  type WebhookEndpoint,
} from './AppSettingsData'
import { AppSettingsSidebar } from './AppSettingsSidebar'
import { useDialogFocus } from './use-dialog-focus'

export function ModelSettingsPanel({ onClose }: { onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>()
  const [activeSection, setActiveSection] = useState<SettingsSection>('model')
  const [form, setForm] = useState<ModelForm>({
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen3:8b',
    apiKey: '',
    hasApiKey: false,
  })
  const [state, setState] = useState<'idle' | 'saving' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [tokens, setTokens] = useState<PlatformToken[]>([])
  const [tokenName, setTokenName] = useState('本地集成')
  const [tokenScopes, setTokenScopes] = useState<ApiScope[]>(['pages:read'])
  const [issuedSecret, setIssuedSecret] = useState('')
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([])
  const [webhookName, setWebhookName] = useState('产品事件')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>(['page.updated'])
  const [issuedWebhookSecret, setIssuedWebhookSecret] = useState('')

  useEffect(() => {
    if (window.notetodo?.model) {
      void window.notetodo.model.getConfig().then((config) => setForm({ ...config, apiKey: '' }))
    }
    if (window.notetodo?.platform) void window.notetodo.platform.listTokens().then(setTokens)
    if (window.notetodo?.webhooks) void window.notetodo.webhooks.list().then(setWebhooks)
  }, [])

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const showSection = (section: SettingsSection) => {
    setActiveSection(section)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    document
      .getElementById(`settings-${section}`)
      ?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const issueToken = async () => {
    if (!tokenName.trim() || !tokenScopes.length) return
    if (!window.notetodo?.platform) {
      setMessage('访问令牌需要在桌面应用中签发。')
      setState('error')
      return
    }
    try {
      const issued = await window.notetodo.platform.issueToken(tokenName.trim(), tokenScopes)
      setIssuedSecret(issued.rawToken)
      setTokens(await window.notetodo.platform.listTokens())
      setState('success')
      setMessage('令牌已签发。请现在复制，关闭后无法再查看明文。')
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : '令牌签发失败。')
    }
  }

  const revokeToken = async (id: string) => {
    if (!window.notetodo?.platform) return
    await window.notetodo.platform.revokeToken(id)
    setTokens(await window.notetodo.platform.listTokens())
  }

  const createWebhook = async () => {
    if (
      !window.notetodo?.webhooks ||
      !webhookName.trim() ||
      !webhookUrl.trim() ||
      !selectedEvents.length
    )
      return
    try {
      const endpoint = await window.notetodo.webhooks.create(
        webhookName.trim(),
        webhookUrl.trim(),
        selectedEvents,
      )
      setIssuedWebhookSecret(endpoint.secret)
      setWebhookUrl('')
      setWebhooks(await window.notetodo.webhooks.list())
      setState('success')
      setMessage('Webhook 已启用。签名密钥只显示这一次。')
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Webhook 创建失败。')
    }
  }

  const toggleWebhook = async (endpoint: WebhookEndpoint) => {
    if (!window.notetodo?.webhooks) return
    await window.notetodo.webhooks.setActive(endpoint.id, !endpoint.active)
    setWebhooks(await window.notetodo.webhooks.list())
  }

  const save = async () => {
    setState('saving')
    try {
      if (window.notetodo?.model) {
        const saved = await window.notetodo.model.saveConfig({
          provider: form.provider,
          baseUrl: form.baseUrl,
          model: form.model,
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        })
        setForm((current) => ({ ...current, ...saved, apiKey: '' }))
      }
      setMessage('配置已保存，密钥由操作系统加密。')
      setState('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法保存模型配置。')
      setState('error')
    }
  }

  const test = async () => {
    if (!window.notetodo?.model) {
      setMessage('浏览器预览不执行本机模型连接；桌面应用中可用。')
      setState('success')
      return
    }
    setState('testing')
    try {
      const result = await window.notetodo.model.testConnection()
      setMessage(`连接成功：${result.endpoint}`)
      setState('success')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型连接失败。')
      setState('error')
    }
  }

  const modelInvalid = !form.baseUrl.trim() || !form.model.trim()

  return (
    <div
      ref={ref}
      className="settings-shell"
      role="dialog"
      aria-modal="true"
      aria-label="模型与 AI 设置"
    >
      <AppSettingsSidebar activeSection={activeSection} onSelect={showSection} />
      <main>
        <header>
          <div>
            <span>工作区设置</span>
            <h2>模型与集成</h2>
            <p>配置自定义模型、本地 API 与事件投递。</p>
          </div>
          <button onClick={onClose} aria-label="关闭设置">
            <X size={18} />
          </button>
        </header>
        <section className="settings-card" id="settings-model">
          <div className="settings-card-title">
            <Cpu size={17} />
            <span>
              <strong>默认模型</strong>
              <small>用于写作、问答与数据库 AI</small>
            </span>
            <i>工作区</i>
          </div>
          <label>
            <span>供应商协议</span>
            <select
              value={form.provider}
              onChange={(event) =>
                setForm({ ...form, provider: event.target.value as ModelForm['provider'] })
              }
            >
              <option value="ollama">Ollama</option>
              <option value="lm-studio">LM Studio</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </label>
          <label>
            <span>Base URL</span>
            <input
              value={form.baseUrl}
              onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
              placeholder="http://127.0.0.1:11434/v1"
            />
          </label>
          <label>
            <span>模型名称</span>
            <input
              value={form.model}
              onChange={(event) => setForm({ ...form, model: event.target.value })}
              placeholder="qwen3:8b"
            />
          </label>
          <label>
            <span>
              API Key <small>{form.hasApiKey ? '已有加密密钥' : '本地模型可留空'}</small>
            </span>
            <div className="secret-input">
              <KeyRound size={14} />
              <input
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                placeholder={form.hasApiKey ? '输入新值以替换现有密钥' : 'sk-…'}
              />
            </div>
          </label>
          <footer>
            <button
              className="test-model"
              onClick={() => void test()}
              disabled={state === 'testing' || modelInvalid}
            >
              <Wifi size={14} />
              {state === 'testing' ? '连接中…' : '测试连接'}
            </button>
            <button
              className="save-model"
              onClick={() => void save()}
              disabled={state === 'saving' || modelInvalid}
            >
              {state === 'saving' ? '保存中…' : '保存配置'}
            </button>
          </footer>
        </section>
        <section className="settings-card platform-token-card" id="settings-tokens">
          <div className="settings-card-title">
            <KeyRound size={17} />
            <span>
              <strong>API 访问令牌</strong>
              <small>为 REST API、MCP 与本地集成授权</small>
            </span>
            <i>本地 API</i>
          </div>
          <div className="token-issuer">
            <input
              aria-label="令牌名称"
              value={tokenName}
              maxLength={100}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="令牌名称"
            />
            <button
              disabled={!tokenName.trim() || !tokenScopes.length}
              onClick={() => void issueToken()}
            >
              <Plus size={13} />
              签发令牌
            </button>
          </div>
          <div className="token-scopes" aria-label="令牌权限">
            {platformScopes.map((scope) => (
              <label key={scope.id}>
                <input
                  type="checkbox"
                  checked={tokenScopes.includes(scope.id)}
                  onChange={(event) =>
                    setTokenScopes((current) =>
                      event.target.checked
                        ? [...current, scope.id]
                        : current.filter((item) => item !== scope.id),
                    )
                  }
                />
                <span>{scope.label}</span>
                <code>{scope.id}</code>
              </label>
            ))}
          </div>
          {issuedSecret && (
            <div className="issued-token">
              <span>
                <small>仅显示一次</small>
                <code>{issuedSecret}</code>
              </span>
              <button onClick={() => void navigator.clipboard.writeText(issuedSecret)}>
                <Copy size={13} />
                复制
              </button>
              <button aria-label="隐藏访问令牌" onClick={() => setIssuedSecret('')}>
                <X size={13} />
              </button>
            </div>
          )}
          <div className="token-ledger">
            {tokens.map((token) => (
              <div className={token.revokedAt ? 'is-revoked' : ''} key={token.id}>
                <i>{token.name.slice(0, 1).toLocaleUpperCase()}</i>
                <span>
                  <strong>{token.name}</strong>
                  <code>{token.prefix}</code>
                  <small>
                    {token.lastUsedAt
                      ? `最近使用 ${new Date(token.lastUsedAt).toLocaleString('zh-CN')}`
                      : '尚未使用'}{' '}
                    · {token.scopes.length} 项权限
                  </small>
                </span>
                {token.revokedAt ? (
                  <em>已撤销</em>
                ) : (
                  <button
                    aria-label={`撤销 ${token.name}`}
                    onClick={() => void revokeToken(token.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            {!tokens.length && <p>尚未签发任何访问令牌。</p>}
          </div>
        </section>
        <section className="settings-card webhook-card" id="settings-webhooks">
          <div className="settings-card-title">
            <Webhook size={17} />
            <span>
              <strong>Webhook 投递</strong>
              <small>签名事件、退避重试与死信监控</small>
            </span>
            <i>事件</i>
          </div>
          <div className="webhook-compose">
            <input
              aria-label="Webhook 名称"
              value={webhookName}
              maxLength={100}
              onChange={(event) => setWebhookName(event.target.value)}
              placeholder="端点名称"
            />
            <input
              aria-label="Webhook 地址"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://hooks.example.com/notetodo"
            />
            <button
              disabled={
                !webhookName.trim() ||
                !webhookUrl.trim() ||
                !selectedEvents.length ||
                !window.notetodo?.webhooks
              }
              onClick={() => void createWebhook()}
            >
              <Plus size={13} />
              添加端点
            </button>
          </div>
          <div className="webhook-events" aria-label="Webhook 事件">
            {webhookEvents.map((event) => (
              <label key={event.id}>
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(event.id)}
                  onChange={(change) =>
                    setSelectedEvents((current) =>
                      change.target.checked
                        ? [...current, event.id]
                        : current.filter((item) => item !== event.id),
                    )
                  }
                />
                <span>{event.label}</span>
                <code>{event.id}</code>
              </label>
            ))}
          </div>
          {issuedWebhookSecret && (
            <div className="issued-token">
              <span>
                <small>签名密钥 · 仅显示一次</small>
                <code>{issuedWebhookSecret}</code>
              </span>
              <button onClick={() => void navigator.clipboard.writeText(issuedWebhookSecret)}>
                <Copy size={13} />
                复制
              </button>
              <button aria-label="隐藏签名密钥" onClick={() => setIssuedWebhookSecret('')}>
                <X size={13} />
              </button>
            </div>
          )}
          <div className="webhook-ledger">
            {webhooks.map((endpoint) => (
              <article className={!endpoint.active ? 'is-paused' : ''} key={endpoint.id}>
                <i>
                  <Webhook size={14} />
                </i>
                <span>
                  <strong>
                    {endpoint.name}
                    <em>{endpoint.active ? '已启用' : '已暂停'}</em>
                  </strong>
                  <code>{endpoint.url}</code>
                  <small>
                    {endpoint.events.length} 类事件 · {endpoint.pendingCount} 待投递{' '}
                    {endpoint.deadCount > 0 && `· ${endpoint.deadCount} 死信`}
                  </small>
                </span>
                <button onClick={() => void toggleWebhook(endpoint)}>
                  {endpoint.active ? '暂停' : '启用'}
                </button>
              </article>
            ))}
            {!webhooks.length && <p>尚无投递端点。桌面应用会加密保存签名密钥。</p>}
          </div>
        </section>
        {message && (
          <div
            className={`settings-message is-${state}`}
            role={state === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {state === 'success' ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}
            {message}
          </div>
        )}
        <div className="privacy-note">
          <ShieldCheck size={18} />
          <div>
            <strong>密钥安全边界</strong>
            <p>
              桌面端使用 Windows DPAPI / macOS Keychain
              对密钥加密。Renderer、页面数据库、日志和错误报告都不会取得明文密钥。
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
