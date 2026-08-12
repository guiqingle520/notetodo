import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Archive, BookOpen, CheckCircle2, CheckSquare2, ChevronRight, CircleHelp, Clock3, Copy, Cpu, FileArchive, FileText, Grid2X2, History as HistoryIcon, Inbox, KeyRound, MessageSquare, Plus, RotateCcw, Search, ShieldCheck, Sparkles, Trash2, Upload, Users, Webhook as WebhookIcon, Wifi, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import type { PageIcon, WorkspacePage } from './domain'
import { useWorkspace } from './store'
import { diffHistoryHtml, historyTextLines } from './data/page-history'
import type { ApiScope } from '@notetodo/auth-core'
import type { WebhookEvent } from '@notetodo/webhook-core'

type PagePermission = { subjectId: string; displayName: string; role: 'viewer' | 'commenter' | 'editor' | 'owner' }
type PageComment = { id: string; authorName: string; body: string; anchor: null | { from: number; to: number; quote: string }; resolvedAt: string | null; createdAt: string }
type WorkspaceNotification = { id: string; type: 'mention' | 'comment'; readAt: string | null; createdAt: string; pageId: string; pageTitle: string; authorName: string; body: string }
type ImportInspection = NonNullable<Awaited<ReturnType<NonNullable<typeof window.notetodo>['imports']['pickAndInspect']>>>
type ImportJob = Awaited<ReturnType<NonNullable<typeof window.notetodo>['imports']['listJobs']>>[number]
type PageVersionSummary = Awaited<ReturnType<NonNullable<typeof window.notetodo>['history']['list']>>[number]
type PageVersionDetail = NonNullable<Awaited<ReturnType<NonNullable<typeof window.notetodo>['history']['get']>>>

const iconMap: Record<PageIcon, React.ComponentType<{ size?: number }>> = { spark: Sparkles, note: FileText, check: CheckSquare2, grid: Grid2X2, book: BookOpen }

export function ImportPanel({ onClose, onImported }: { onClose: () => void; onImported: () => Promise<void> }) {
  const [inspection, setInspection] = useState<ImportInspection | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'importing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ phase: 'convert', completed: 0, total: 1, path: '' })
  const [result, setResult] = useState<{ pageCount: number; databaseCount: number; importedAssets: number; skippedAssets: number; unresolvedLinks: number } | null>(null)
  const [recentJobs, setRecentJobs] = useState<ImportJob[]>([])
  const cancelImportRef = useRef<null | (() => void)>(null)

  useEffect(() => {
    if (window.notetodo?.imports) void window.notetodo.imports.listJobs().then(setRecentJobs).catch(() => {})
  }, [])

  const pickArchive = async () => {
    if (!window.notetodo?.imports) {
      setError('导入功能需要在 NoteTodo 桌面应用中使用。')
      setStatus('error')
      return
    }
    setStatus('loading')
    setError('')
    try {
      const result = await window.notetodo.imports.pickAndInspect()
      if (!result) { setStatus(inspection ? 'ready' : 'idle'); return }
      setInspection(result)
      setStatus('ready')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取这个导出档案。')
      setStatus('error')
    }
  }

  const startImport = async () => {
    if (!inspection || inspection.rejected || !window.notetodo?.imports) return
    setStatus('importing')
    setProgress({ phase: 'convert', completed: 0, total: Math.max(1, inspection.summary.page + inspection.summary.database), path: '' })
    const task = window.notetodo.imports.start(inspection.importId, (next) => setProgress({ ...next, path: next.path ?? '' }))
    cancelImportRef.current = task.cancel
    try {
      const completed = await task.promise
      setResult(completed)
      setStatus('done')
      await onImported()
      setRecentJobs(await window.notetodo.imports.listJobs())
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message.includes('IMPORT_CANCELLED') ? '导入已取消，工作区没有发生部分写入。' : message)
      setStatus('error')
    } finally {
      cancelImportRef.current = null
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }

  return (
    <div className="modal-backdrop import-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="import-panel" role="dialog" aria-modal="true" aria-label="导入工作区" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><FileArchive size={19} /><span><strong>迁入你的知识库</strong><small>NOTION ARCHIVE · LOCAL PREFLIGHT</small></span></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </header>

        {!inspection && status !== 'error' && (
          <div className="import-landing">
            <div className="import-seal"><FileArchive size={28} /><span>ZIP</span></div>
            <p className="import-kicker">从原处带走你的内容</p>
            <h2>先检查，<em>再落库。</em></h2>
            <p>选择 Notion 导出的 ZIP。NoteTodo 只读取目录元数据完成安全预检，此阶段不会解压或改动当前工作区。</p>
            <button className="import-primary" onClick={() => void pickArchive()} disabled={status === 'loading'}>
              <Upload size={15} />{status === 'loading' ? '正在读取目录…' : '选择 Notion 导出包'}
            </button>
            <div className="import-footnote"><ShieldCheck size={13} />路径逃逸、重复文件和解压体积会在写入前被拦截</div>
            {recentJobs.length > 0 && <div className="import-ledger"><header><span>最近迁移</span><small>本地导入记录</small></header>{recentJobs.slice(0, 3).map((job) => <div key={job.id}><i data-status={job.status} /><span><strong>{job.sourceName}</strong><small>{new Date(job.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · {job.status === 'completed' ? `完成 ${job.report.importedPages ?? 0} 页` : job.status === 'cancelled' ? '已取消' : job.status === 'failed' ? '已回滚' : '处理中'}</small></span><em>{job.status === 'completed' ? '完成' : job.status === 'failed' ? '失败' : job.status === 'cancelled' ? '取消' : '中断'}</em></div>)}</div>}
          </div>
        )}

        {status === 'error' && (
          <div className="import-error"><AlertTriangle size={24} /><strong>无法完成预检</strong><p>{error}</p><button onClick={() => void pickArchive()}>重新选择</button></div>
        )}

        {inspection && !['error', 'importing', 'done'].includes(status) && (
          <div className="import-report">
            <div className="import-report-title">
              <span className={inspection.rejected ? 'is-rejected' : 'is-safe'}>{inspection.rejected ? '需要处理' : '安全可导入'}</span>
              <h2>{inspection.fileName}</h2>
              <p>{formatSize(inspection.compressedBytes)} 压缩 · {formatSize(inspection.acceptedBytes)} 展开后</p>
            </div>
            <div className="import-metrics">
              <div><FileText size={15} /><strong>{inspection.summary.page}</strong><span>页面</span></div>
              <div><Grid2X2 size={15} /><strong>{inspection.summary.database}</strong><span>数据库</span></div>
              <div><FileArchive size={15} /><strong>{inspection.summary.asset}</strong><span>附件</span></div>
              <div><LayersIcon /><strong>{inspection.summary.unsupported}</strong><span>跳过</span></div>
            </div>
            {inspection.issues.length > 0 && <div className="import-issues">{inspection.issues.slice(0, 4).map((issue, index) => <p key={`${issue.code}-${index}`}><AlertTriangle size={13} /><span><strong>{issue.code}</strong>{issue.path ? ` · ${issue.path}` : ''}<small>{issue.message}</small></span></p>)}</div>}
            <div className="import-file-sample">
              <header><span>档案清单</span><small>显示前 {Math.min(inspection.entries.length, 6)} / {inspection.entries.length} 项</small></header>
              {inspection.entries.slice(0, 6).map((entry) => <div key={entry.path}><span data-kind={entry.kind}>{entry.kind.slice(0, 1).toUpperCase()}</span><p>{entry.path}</p><small>{formatSize(entry.size)}</small></div>)}
            </div>
            <footer><button className="import-secondary" onClick={() => void pickArchive()}>更换档案</button><span>{inspection.rejected ? '修复导出包中的问题后才能继续' : '页面将在一次事务中写入，失败时自动回滚'}</span>{!inspection.rejected && <button className="import-primary" onClick={() => void startImport()}>开始导入</button>}</footer>
          </div>
        )}
        {inspection && status === 'importing' && (
          <div className="import-running">
            <div className="import-orbit"><FileArchive size={25} /><i /></div>
            <p>{progress.phase === 'commit' ? '正在提交事务' : '正在转换内容'}</p>
            <h2>{progress.phase === 'commit' ? '即将完成。' : `${progress.completed} / ${progress.total}`}</h2>
            <div className="import-progress"><span style={{ width: `${progress.phase === 'commit' ? 96 : Math.min(92, progress.completed / Math.max(1, progress.total) * 92)}%` }} /></div>
            <small>{progress.path || '正在准备安全读取…'}</small>
            <button className="import-secondary" onClick={() => cancelImportRef.current?.()}>取消导入</button>
          </div>
        )}
        {status === 'done' && result && (
          <div className="import-complete"><CheckCircle2 size={32} /><p>迁移完成</p><h2>知识已经回到你手中。</h2><div><span><strong>{result.pageCount}</strong>页面</span><span><strong>{result.databaseCount}</strong>数据库</span><span><strong>{result.importedAssets}</strong>附件</span></div>{(result.skippedAssets > 0 || result.unresolvedLinks > 0) && <small>{result.skippedAssets} 个附件跳过 · {result.unresolvedLinks} 个链接待检查</small>}<button className="import-primary" onClick={onClose}>打开导入空间</button></div>
        )}
      </section>
    </div>
  )
}

function LayersIcon() { return <span className="layers-icon" aria-hidden="true">×</span> }

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const { searchResults, search, setActivePage } = useWorkspace()
  const [query, setQuery] = useState('')

  useEffect(() => {
    // Short debounce avoids searching SQLite for every IME composition update.
    const timer = setTimeout(() => void search(query), 90)
    return () => clearTimeout(timer)
  }, [query, search])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="搜索工作区" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-search">
          <Search size={18} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索页面与内容…" />
          <kbd>ESC</kbd>
        </div>
        <div className="command-caption"><span>{query ? '搜索结果' : '最近访问'}</span><span>{searchResults.length} 项</span></div>
        <div className="search-results">
          {searchResults.map((page) => {
            const Icon = iconMap[page.icon]
            return (
              <button key={page.id} onClick={() => { setActivePage(page.id); onClose() }}>
                <span className="result-icon"><Icon size={16} /></span>
                <span><strong>{page.title || '无标题'}</strong><small>{new Date(page.updatedAt).toLocaleString('zh-CN')}</small></span>
                <ChevronRight size={15} />
              </button>
            )
          })}
          {!searchResults.length && <div className="empty-state"><Search size={24} /><strong>没有找到内容</strong><span>换一个关键词，或直接创建新页面。</span></div>}
        </div>
        <footer><span><kbd>↑↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span>本机全文索引</span></footer>
      </section>
    </div>
  )
}

export function ArchivePanel({ onClose }: { onClose: () => void }) {
  const { pages, restorePage } = useWorkspace()
  const archivedPages = pages.filter((page) => page.archivedAt)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="archive-panel" role="dialog" aria-modal="true" aria-label="归档与回收站" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><Archive size={18} /><span><strong>归档与回收站</strong><small>内容仍然安全保存在本机</small></span></div><button onClick={onClose}><X size={17} /></button></header>
        <div className="archive-list">
          {archivedPages.map((page) => {
            const Icon = iconMap[page.icon]
            return <div key={page.id}><span className="result-icon"><Icon size={16} /></span><span><strong>{page.title}</strong><small>{page.archivedAt && new Date(page.archivedAt).toLocaleString('zh-CN')}</small></span><button onClick={() => restorePage(page.id)}><RotateCcw size={14} />恢复</button></div>
          })}
          {!archivedPages.length && <div className="empty-state"><Archive size={26} /><strong>回收站是空的</strong><span>归档的页面会出现在这里。</span></div>}
        </div>
      </section>
    </div>
  )
}

export function NotificationPanel({ onClose, onCountChange }: { onClose: () => void; onCountChange: (count: number) => void }) {
  const { setActivePage } = useWorkspace()
  const [items, setItems] = useState<WorkspaceNotification[]>([])
  useEffect(() => {
    const load = async () => {
      const notifications = window.notetodo?.notifications ? await window.notetodo.notifications.list() : []
      setItems(notifications)
      onCountChange(notifications.filter((item) => !item.readAt).length)
    }
    void load()
  }, [onCountChange])

  const open = async (item: WorkspaceNotification) => {
    if (!item.readAt && window.notetodo?.notifications) await window.notetodo.notifications.markRead(item.id)
    setActivePage(item.pageId)
    onCountChange(Math.max(0, items.filter((entry) => !entry.readAt && entry.id !== item.id).length))
    onClose()
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="notification-panel" role="dialog" aria-modal="true" aria-label="更新" onMouseDown={(event) => event.stopPropagation()}><header><div><Inbox size={17} /><span><strong>更新</strong><small>提及与页面协作动态</small></span></div><button onClick={onClose} aria-label="关闭更新"><X size={16} /></button></header><div className="notification-list">{items.map((item) => <button className={item.readAt ? 'is-read' : ''} key={item.id} onClick={() => void open(item)}><i>{item.authorName?.slice(0, 1) || '@'}</i><span><strong>{item.authorName} 在「{item.pageTitle}」中提到了你</strong><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small></span>{!item.readAt && <em />}</button>)}{!items.length && <div className="empty-state"><Inbox size={25} /><strong>没有新消息</strong><span>评论中的 @提及会出现在这里。</span></div>}</div></section></div>
}

type ModelForm = { provider: 'openai-compatible' | 'ollama' | 'lm-studio'; baseUrl: string; model: string; apiKey: string; hasApiKey: boolean }
type PlatformToken = { id: string; name: string; prefix: string; scopes: ApiScope[]; revokedAt: string | null; lastUsedAt: string | null; createdAt: string }
const platformScopes: Array<{ id: ApiScope; label: string }> = [
  { id: 'pages:read', label: '页面读取' }, { id: 'pages:write', label: '页面写入' },
  { id: 'databases:read', label: '数据库读取' }, { id: 'databases:write', label: '数据库写入' },
  { id: 'webhooks:manage', label: 'Webhook 管理' }, { id: 'automations:manage', label: '自动化管理' },
]
type WebhookEndpoint = { id: string; name: string; url: string; events: WebhookEvent[]; active: boolean; pendingCount: number; deadCount: number }
const webhookEvents: Array<{ id: WebhookEvent; label: string }> = [
  { id: 'page.created', label: '页面创建' }, { id: 'page.updated', label: '页面更新' }, { id: 'page.archived', label: '页面归档' },
  { id: 'database.record.created', label: '记录创建' }, { id: 'database.record.updated', label: '记录更新' },
]

export function ModelSettingsPanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<ModelForm>({ provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:8b', apiKey: '', hasApiKey: false })
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

  const issueToken = async () => {
    if (!tokenName.trim() || !tokenScopes.length) return
    if (!window.notetodo?.platform) { setMessage('访问令牌需要在桌面应用中签发。'); setState('error'); return }
    try {
      const issued = await window.notetodo.platform.issueToken(tokenName.trim(), tokenScopes)
      setIssuedSecret(issued.rawToken)
      setTokens(await window.notetodo.platform.listTokens())
      setState('success'); setMessage('令牌已签发。请现在复制，关闭后无法再查看明文。')
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : '令牌签发失败。') }
  }

  const revokeToken = async (id: string) => {
    if (!window.notetodo?.platform) return
    await window.notetodo.platform.revokeToken(id)
    setTokens(await window.notetodo.platform.listTokens())
  }

  const createWebhook = async () => {
    if (!window.notetodo?.webhooks || !webhookName.trim() || !webhookUrl.trim() || !selectedEvents.length) return
    try {
      const endpoint = await window.notetodo.webhooks.create(webhookName.trim(), webhookUrl.trim(), selectedEvents)
      setIssuedWebhookSecret(endpoint.secret)
      setWebhookUrl('')
      setWebhooks(await window.notetodo.webhooks.list())
      setState('success'); setMessage('Webhook 已启用。签名密钥只显示这一次。')
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'Webhook 创建失败。') }
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
        const saved = await window.notetodo.model.saveConfig({ provider: form.provider, baseUrl: form.baseUrl, model: form.model, ...(form.apiKey ? { apiKey: form.apiKey } : {}) })
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

  return (
    <div className="settings-shell" role="dialog" aria-modal="true" aria-label="模型与 AI 设置">
      <aside><div className="settings-brand"><span className="brand-mark">N</span><strong>设置</strong></div><nav aria-label="设置分类"><button>工作区</button><button className="is-active" aria-current="page"><Cpu size={15} />模型与 AI</button><button>连接器</button><button>数据与安全</button></nav><div className="settings-trust"><ShieldCheck size={16} /><span><strong>本地优先</strong><small>密钥不会进入页面内容</small></span></div></aside>
      <main>
        <header><div><span>工作区设置</span><h2>模型与 AI</h2><p>选择云端或本地模型。NoteTodo 使用统一网关，不绑定供应商。</p></div><button onClick={onClose} aria-label="关闭设置"><X size={18} /></button></header>
        <section className="settings-card">
          <div className="settings-card-title"><Cpu size={17} /><span><strong>默认模型</strong><small>用于写作、问答与数据库 AI</small></span><i>工作区</i></div>
          <label><span>供应商协议</span><select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as ModelForm['provider'] })}><option value="ollama">Ollama</option><option value="lm-studio">LM Studio</option><option value="openai-compatible">OpenAI-compatible</option></select></label>
          <label><span>Base URL</span><input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="http://127.0.0.1:11434/v1" /></label>
          <label><span>模型名称</span><input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="qwen3:8b" /></label>
          <label><span>API Key <small>{form.hasApiKey ? '已有加密密钥' : '本地模型可留空'}</small></span><div className="secret-input"><KeyRound size={14} /><input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder={form.hasApiKey ? '输入新值以替换现有密钥' : 'sk-…'} /></div></label>
          <footer><button className="test-model" onClick={() => void test()} disabled={state === 'testing'}><Wifi size={14} />{state === 'testing' ? '连接中…' : '测试连接'}</button><button className="save-model" onClick={() => void save()} disabled={state === 'saving'}>{state === 'saving' ? '保存中…' : '保存配置'}</button></footer>
        </section>
        <section className="settings-card platform-token-card">
          <div className="settings-card-title"><KeyRound size={17} /><span><strong>API 访问令牌</strong><small>为 REST API、MCP 与本地集成授权</small></span><i>本地 API</i></div>
          <div className="token-issuer"><input value={tokenName} maxLength={100} onChange={(event) => setTokenName(event.target.value)} placeholder="令牌名称" /><button disabled={!tokenName.trim() || !tokenScopes.length} onClick={() => void issueToken()}><Plus size={13} />签发令牌</button></div>
          <div className="token-scopes">{platformScopes.map((scope) => <label key={scope.id}><input type="checkbox" checked={tokenScopes.includes(scope.id)} onChange={(event) => setTokenScopes((current) => event.target.checked ? [...current, scope.id] : current.filter((item) => item !== scope.id))} /><span>{scope.label}</span><code>{scope.id}</code></label>)}</div>
          {issuedSecret && <div className="issued-token"><span><small>仅显示一次</small><code>{issuedSecret}</code></span><button onClick={() => void navigator.clipboard.writeText(issuedSecret)}><Copy size={13} />复制</button><button onClick={() => setIssuedSecret('')}><X size={13} /></button></div>}
          <div className="token-ledger">{tokens.map((token) => <div className={token.revokedAt ? 'is-revoked' : ''} key={token.id}><i>{token.name.slice(0, 1).toLocaleUpperCase()}</i><span><strong>{token.name}</strong><code>{token.prefix}</code><small>{token.lastUsedAt ? `最近使用 ${new Date(token.lastUsedAt).toLocaleString('zh-CN')}` : '尚未使用'} · {token.scopes.length} 项权限</small></span>{token.revokedAt ? <em>已撤销</em> : <button aria-label={`撤销 ${token.name}`} onClick={() => void revokeToken(token.id)}><Trash2 size={13} /></button>}</div>)}{!tokens.length && <p>尚未签发任何访问令牌。</p>}</div>
        </section>
        <section className="settings-card webhook-card">
          <div className="settings-card-title"><WebhookIcon size={17} /><span><strong>Webhook 投递台</strong><small>签名事件、退避重试与死信监控</small></span><i>发件箱</i></div>
          <div className="webhook-compose"><input value={webhookName} maxLength={100} onChange={(event) => setWebhookName(event.target.value)} placeholder="端点名称" /><input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://hooks.example.com/notetodo" /><button disabled={!webhookName.trim() || !webhookUrl.trim() || !selectedEvents.length || !window.notetodo?.webhooks} onClick={() => void createWebhook()}><Plus size={13} />添加端点</button></div>
          <div className="webhook-events">{webhookEvents.map((event) => <label key={event.id}><input type="checkbox" checked={selectedEvents.includes(event.id)} onChange={(change) => setSelectedEvents((current) => change.target.checked ? [...current, event.id] : current.filter((item) => item !== event.id))} /><span>{event.label}</span><code>{event.id}</code></label>)}</div>
          {issuedWebhookSecret && <div className="issued-token"><span><small>签名密钥 · 仅显示一次</small><code>{issuedWebhookSecret}</code></span><button onClick={() => void navigator.clipboard.writeText(issuedWebhookSecret)}><Copy size={13} />复制</button><button onClick={() => setIssuedWebhookSecret('')}><X size={13} /></button></div>}
          <div className="webhook-ledger">{webhooks.map((endpoint) => <article className={!endpoint.active ? 'is-paused' : ''} key={endpoint.id}><i><WebhookIcon size={14} /></i><span><strong>{endpoint.name}<em>{endpoint.active ? 'LIVE' : 'PAUSED'}</em></strong><code>{endpoint.url}</code><small>{endpoint.events.length} 类事件 · {endpoint.pendingCount} 待投递 {endpoint.deadCount > 0 && `· ${endpoint.deadCount} 死信`}</small></span><button onClick={() => void toggleWebhook(endpoint)}>{endpoint.active ? '暂停' : '启用'}</button></article>)}{!webhooks.length && <p>尚无投递端点。桌面应用会加密保存签名密钥。</p>}</div>
        </section>
        {message && <div className={`settings-message is-${state}`}>{state === 'success' ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}{message}</div>}
        <div className="privacy-note"><ShieldCheck size={18} /><div><strong>密钥安全边界</strong><p>桌面端使用 Windows DPAPI / macOS Keychain 对密钥加密。Renderer、页面数据库、日志和错误报告都不会取得明文密钥。</p></div></div>
      </main>
    </div>
  )
}

export function SharePanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [permissions, setPermissions] = useState<PagePermission[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor'>('editor')

  useEffect(() => {
    if (window.notetodo?.sharing) void window.notetodo.sharing.list(pageId).then(setPermissions)
    else setPermissions([{ subjectId: 'preview-owner', displayName: '本机用户', role: 'owner' }])
  }, [pageId])

  const add = async () => {
    const displayName = name.trim()
    if (!displayName) return
    const subjectId = crypto.randomUUID()
    if (window.notetodo?.sharing) await window.notetodo.sharing.upsert(pageId, subjectId, displayName, role)
    setPermissions((current) => [...current, { subjectId, displayName, role }])
    setName('')
  }

  const remove = async (permission: PagePermission) => {
    if (permission.role === 'owner') return
    if (window.notetodo?.sharing) await window.notetodo.sharing.remove(pageId, permission.subjectId)
    setPermissions((current) => current.filter((item) => item.subjectId !== permission.subjectId))
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="share-panel" role="dialog" aria-modal="true" aria-label="共享此页面" onMouseDown={(event) => event.stopPropagation()}><header><div><Users size={17} /><span><strong>共享此页面</strong><small>权限在加入协作房间前验证</small></span></div><button onClick={onClose} aria-label="关闭共享"><X size={16} /></button></header><div className="share-invite"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名或团队成员 ID" /><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="editor">可编辑</option><option value="commenter">可评论</option><option value="viewer">可查看</option></select><button onClick={() => void add()}>邀请</button></div><div className="permission-list"><span>已有访问权限</span>{permissions.map((permission) => <div key={permission.subjectId}><i>{permission.displayName.slice(0, 1)}</i><span><strong>{permission.displayName}</strong><small>{permission.subjectId.slice(0, 8)}</small></span><em>{permission.role === 'owner' ? '所有者' : permission.role === 'editor' ? '可编辑' : permission.role === 'commenter' ? '可评论' : '可查看'}</em>{permission.role !== 'owner' && <button aria-label={`移除 ${permission.displayName}`} onClick={() => void remove(permission)}><X size={12} /></button>}</div>)}</div><footer><ShieldCheck size={14} />房间票据仅对当前页面有效，5 分钟后过期</footer></section></div>
}

export function CommentsPanel({ pageId, editor, onClose }: { pageId: string; editor: Editor | null; onClose: () => void }) {
  const [comments, setComments] = useState<PageComment[]>([])
  const [members, setMembers] = useState<PagePermission[]>([])
  const [body, setBody] = useState('')
  const selection = editor?.state.selection
  const quote = selection && !selection.empty ? editor?.state.doc.textBetween(selection.from, selection.to, ' ') ?? '' : ''

  useEffect(() => {
    if (window.notetodo?.comments) void window.notetodo.comments.list(pageId).then(setComments)
    if (window.notetodo?.sharing) void window.notetodo.sharing.list(pageId).then(setMembers)
    else setMembers([{ subjectId: 'preview-ming', displayName: 'Ming', role: 'editor' }])
  }, [pageId])

  const create = async () => {
    const value = body.trim()
    if (!value) return
    const anchor = selection && !selection.empty ? { from: selection.from, to: selection.to, quote: quote.slice(0, 1000) } : null
    const mentions = members.filter((member) => value.includes(`@${member.displayName}`)).map((member) => member.subjectId)
    const id = window.notetodo?.comments ? await window.notetodo.comments.create(pageId, value, anchor, mentions) : crypto.randomUUID()
    setComments((current) => [{ id, authorName: '本机用户', body: value, anchor, resolvedAt: null, createdAt: new Date().toISOString() }, ...current])
    setBody('')
  }

  const resolve = async (id: string) => {
    if (window.notetodo?.comments) await window.notetodo.comments.resolve(id)
    setComments((current) => current.map((comment) => comment.id === id ? { ...comment, resolvedAt: new Date().toISOString() } : comment))
  }

  return <aside className="comments-panel" role="dialog" aria-modal="true" aria-label="页面讨论"><header><div><MessageSquare size={16} /><span><strong>页面讨论</strong><small>{comments.filter((comment) => !comment.resolvedAt).length} 条未解决</small></span></div><button onClick={onClose} aria-label="关闭页面讨论"><X size={16} /></button></header><div className="comment-composer">{quote && <blockquote>“{quote}”</blockquote>}<textarea aria-label="评论内容" value={body} onChange={(event) => setBody(event.target.value)} placeholder={quote ? '评论所选内容，支持 @提及…' : '添加页面评论，输入 @ 提及成员…'} />{members.length > 0 && <div className="mention-members"><span>提及</span>{members.slice(0, 5).map((member) => <button key={member.subjectId} onClick={() => setBody((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${member.displayName} `)}>@{member.displayName}</button>)}</div>}<button onClick={() => void create()} disabled={!body.trim()}>发布评论</button></div><div className="comment-list">{comments.map((comment) => <article className={comment.resolvedAt ? 'is-resolved' : ''} key={comment.id}>{comment.anchor?.quote && <blockquote>“{comment.anchor.quote}”</blockquote>}<header><i>{comment.authorName.slice(0, 1)}</i><span><strong>{comment.authorName}</strong><small>{new Date(comment.createdAt).toLocaleString('zh-CN')}</small></span></header><p>{comment.body}</p>{!comment.resolvedAt && <button onClick={() => void resolve(comment.id)}><CheckCircle2 size={12} />标记已解决</button>}</article>)}</div></aside>
}

export function PageHistoryPanel({ page, canRestore, onRestored, onClose }: { page: WorkspacePage; canRestore: boolean; onRestored: (page: WorkspacePage) => void; onClose: () => void }) {
  const [versions, setVersions] = useState<PageVersionSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<PageVersionDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = async () => {
    if (!window.notetodo?.history) return
    const items = await window.notetodo.history.list(page.id)
    setVersions(items)
    setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null)
  }

  useEffect(() => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : '历史记录读取失败。')) }, [page.id])
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  useEffect(() => {
    let active = true
    setDetail(null)
    if (selectedId && window.notetodo?.history) void window.notetodo.history.get(page.id, selectedId).then((version) => { if (active) setDetail(version) })
    return () => { active = false }
  }, [page.id, selectedId])

  const diff = useMemo(() => detail ? diffHistoryHtml(detail.content, page.content) : [], [detail?.id, page.content])
  const additions = diff.filter((line) => line.kind === 'added').length
  const removals = diff.filter((line) => line.kind === 'removed').length
  const restore = async () => {
    if (!selectedId || !canRestore || !window.notetodo?.history) return
    setBusy(true); setError('')
    try {
      const restored = await window.notetodo.history.restore(page.id, selectedId)
      onRestored(restored)
      await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message.split('Error: ').at(-1) ?? reason.message : '版本恢复失败。') }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop history-backdrop" onMouseDown={onClose}>
      <section className="history-panel" role="dialog" aria-modal="true" aria-label="页面历史" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><HistoryIcon size={17} /><span><strong>版本档案册</strong><small>{page.title} · 最多保留 200 版</small></span></div>
          <button onClick={onClose} aria-label="关闭页面历史"><X size={16} /></button>
        </header>
        <div className="history-layout">
          <aside className="history-timeline">
            <div><span>自动存档</span><small>{versions.length} 版</small></div>
            {versions.map((version, index) => (
              <button className={selectedId === version.id ? 'is-selected' : ''} key={version.id} onClick={() => setSelectedId(version.id)}>
                <i>{String(versions.length - index).padStart(2, '0')}</i>
                <span><strong>{version.reason === 'restore' ? '恢复前快照' : version.title}</strong><small>{new Date(version.createdAt).toLocaleString('zh-CN')}</small><em>{historyTextLines(version.preview, 1)[0] ?? '空白页面'}</em></span>
              </button>
            ))}
            {!versions.length && <div className="history-empty"><Clock3 size={22} /><strong>还没有历史版本</strong><span>编辑页面后会自动留下首个快照。</span></div>}
          </aside>
          <main className="history-proof">
            {detail ? <>
              <div className="history-proof-head">
                <span><small>ARCHIVE #{detail.id}</small><strong>{detail.title}</strong></span>
                <div><em className="is-added">+{additions}</em><em className="is-removed">−{removals}</em></div>
              </div>
              {detail.title !== page.title && <div className="history-title-diff"><del>{detail.title}</del><ins>{page.title}</ins></div>}
              <div className="history-diff" aria-label="版本文本差异">
                {diff.map((line, index) => <div className={`is-${line.kind}`} key={`${index}-${line.text}`}><i>{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : '·'}</i><span>{line.text}</span></div>)}
                {!diff.length && <div className="history-no-change">此版本与当前正文没有文本差异。</div>}
              </div>
              <footer>
                <span>{canRestore ? '恢复前会先保存当前页面，因此本操作可以撤回。' : '当前角色只能浏览历史，无法恢复。'}</span>
                <button disabled={!canRestore || busy} onClick={() => void restore()}><RotateCcw size={13} />{busy ? '正在恢复…' : '恢复此版本'}</button>
              </footer>
            </> : <div className="history-loading">{versions.length ? '正在展开档案…' : '编辑页面后，版本会陈列在这里。'}</div>}
            {error && <p className="history-error">{error}</p>}
          </main>
        </div>
      </section>
    </div>
  )
}
