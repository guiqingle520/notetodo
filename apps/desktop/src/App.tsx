import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Bot,
  Bookmark,
  CheckSquare2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  CircleHelp,
  Clock3,
  Code2,
  Columns2,
  Columns3,
  Command,
  Copy,
  Cpu,
  FileText,
  FileArchive,
  Grid2X2,
  GripVertical,
  Heading1,
  Heading2,
  Home,
  History as HistoryIcon,
  Inbox,
  Image as ImageIcon,
  KeyRound,
  Menu,
  List,
  ListOrdered,
  ListCollapse,
  ListTree,
  ListTodo,
  Lightbulb,
  LayoutTemplate,
  MessageSquare,
  Minus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  PanelsTopLeft,
  Paperclip,
  Plus,
  Quote,
  RotateCcw,
  Search,
  ShieldCheck,
  Settings,
  Sparkles,
  Sigma,
  Star,
  Trash2,
  Type,
  X,
  Wifi,
  Webhook as WebhookIcon,
  Users,
  Upload,
} from 'lucide-react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { pageBreadcrumbs, type PageIcon, type WorkspacePage } from './domain'
import { useWorkspace } from './store'
import { PageDatabaseMount } from './DatabaseBlock'
import { PageSyncSession } from './data/page-sync'
import { documentSchemaExtensions, migrateHtmlToNativeFragment } from './data/native-collaboration'
import { RemoteCursors, renderRemoteCursors, type RemoteCursor } from './data/remote-cursors'
import { createColumnLayoutContent, normalizeEmbedUrl, safeHttpsUrl } from './editor/rich-blocks'
import { applyBlockAction, type BlockAction } from './editor/block-actions'
import { diffHistoryHtml, historyTextLines } from './data/page-history'
import { pageTemplates } from './data/page-templates'
import type { ApiScope } from '@notetodo/auth-core'
import type { WebhookEvent } from '@notetodo/webhook-core'

type PagePermission = { subjectId: string; displayName: string; role: 'viewer' | 'commenter' | 'editor' | 'owner' }
type PageComment = { id: string; authorName: string; body: string; anchor: null | { from: number; to: number; quote: string }; resolvedAt: string | null; createdAt: string }
type WorkspaceNotification = { id: string; type: 'mention' | 'comment'; readAt: string | null; createdAt: string; pageId: string; pageTitle: string; authorName: string; body: string }
type SelectionContext = { from: number; to: number; text: string }
type AIPatchProposal = { text: string; operation: 'insert-paragraphs' | 'replace-selection'; range?: { from: number; to: number } }
type ImportInspection = NonNullable<Awaited<ReturnType<NonNullable<typeof window.notetodo>['imports']['pickAndInspect']>>>
type ImportJob = Awaited<ReturnType<NonNullable<typeof window.notetodo>['imports']['listJobs']>>[number]
type StoredAttachment = { hash: string; size: number; mimeType: string; displayName: string; url: string; previewUrl: string | null }
type PageVersionSummary = Awaited<ReturnType<NonNullable<typeof window.notetodo>['history']['list']>>[number]
type PageVersionDetail = NonNullable<Awaited<ReturnType<NonNullable<typeof window.notetodo>['history']['get']>>>
type RetrievalCitation = Awaited<ReturnType<NonNullable<typeof window.notetodo>['retrieval']['search']>>[number]
type EditorMenuState = { from: number; left: number; top: number; query: string; index: number }

const iconMap: Record<PageIcon, React.ComponentType<{ size?: number }>> = {
  spark: Sparkles,
  note: FileText,
  check: CheckSquare2,
  grid: Grid2X2,
  book: BookOpen,
}

interface SlashCommand {
  label: string
  hint: string
  keywords: string
  icon: React.ComponentType<{ size?: number }>
  run: (editor: Editor) => void
}

const baseSlashCommands: SlashCommand[] = [
  { label: '正文', hint: '普通文本段落', keywords: 'text paragraph 正文 文本', icon: Type, run: (editor) => { editor.chain().focus().setParagraph().run() } },
  { label: '一级标题', hint: '页面主要章节', keywords: 'heading h1 标题', icon: Heading1, run: (editor) => { editor.chain().focus().setHeading({ level: 1 }).run() } },
  { label: '二级标题', hint: '页面次级章节', keywords: 'heading h2 标题', icon: Heading2, run: (editor) => { editor.chain().focus().setHeading({ level: 2 }).run() } },
  { label: '项目列表', hint: '无序信息列表', keywords: 'bullet list 项目 列表', icon: List, run: (editor) => { editor.chain().focus().toggleBulletList().run() } },
  { label: '编号列表', hint: '有顺序的步骤', keywords: 'ordered list 编号 列表', icon: ListOrdered, run: (editor) => { editor.chain().focus().toggleOrderedList().run() } },
  { label: '待办事项', hint: '可以勾选的任务', keywords: 'todo task check 待办 任务', icon: ListTodo, run: (editor) => { editor.chain().focus().toggleTaskList().run() } },
  { label: '引用', hint: '突出一句重要的话', keywords: 'quote blockquote 引用', icon: Quote, run: (editor) => { editor.chain().focus().toggleBlockquote().run() } },
  { label: '代码块', hint: '保留格式的代码', keywords: 'code block 代码', icon: Code2, run: (editor) => { editor.chain().focus().toggleCodeBlock().run() } },
  { label: '提示框', hint: '突出背景、结论或提醒', keywords: 'callout note 提示 提醒', icon: Lightbulb, run: (editor) => { editor.chain().focus().insertContent({ type: 'callout', attrs: { tone: 'note', icon: '✦' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '输入提示内容…' }] }] }).run() } },
  { label: '折叠内容', hint: '收纳可展开的详细信息', keywords: 'toggle details 折叠 展开', icon: ListCollapse, run: (editor) => { editor.chain().focus().insertContent({ type: 'toggle', attrs: { title: '展开查看', open: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '输入折叠内容…' }] }] }).run() } },
  { label: '双栏布局', hint: '并排组织正文与资料', keywords: 'columns layout two 双栏 分栏 布局', icon: Columns2, run: (editor) => { editor.chain().focus().insertContent(createColumnLayoutContent(2)).run() } },
  { label: '三栏布局', hint: '创建紧凑的信息矩阵', keywords: 'columns layout three 三栏 分栏 布局', icon: Columns3, run: (editor) => { editor.chain().focus().insertContent(createColumnLayoutContent(3)).run() } },
  { label: '网页书签', hint: '保存带摘要的网址卡片', keywords: 'bookmark url 书签 链接', icon: Bookmark, run: (editor) => { const input = window.prompt('输入 HTTPS 网页地址'); const url = safeHttpsUrl(input?.trim() ?? ''); if (!url) return; const parsed = new URL(url); editor.chain().focus().insertContent({ type: 'bookmark', attrs: { url, title: parsed.hostname.replace(/^www\./, ''), description: url, site: parsed.hostname } }).run() } },
  { label: '公式', hint: '插入 KaTeX 块公式', keywords: 'formula math latex 公式 数学', icon: Sigma, run: (editor) => { const expression = window.prompt('输入 LaTeX 公式', 'E = mc^2')?.trim(); if (expression) editor.chain().focus().insertContent({ type: 'formula', attrs: { expression: expression.slice(0, 5000) } }).run() } },
  { label: '页面目录', hint: '自动列出当前页面标题', keywords: 'toc contents 目录 大纲', icon: ListTree, run: (editor) => { editor.chain().focus().insertContent({ type: 'tableOfContents' }).run() } },
  { label: '嵌入', hint: '嵌入视频、设计稿或地图', keywords: 'embed iframe video 嵌入 视频', icon: PanelsTopLeft, run: (editor) => { const input = window.prompt('输入支持的 HTTPS 嵌入地址'); const url = normalizeEmbedUrl(input?.trim() ?? ''); if (url) editor.chain().focus().insertContent({ type: 'embed', attrs: { url, title: '嵌入内容' } }).run() } },
  { label: '分割线', hint: '分隔上下文', keywords: 'divider rule 分割线', icon: Minus, run: (editor) => { editor.chain().focus().setHorizontalRule().run() } },
]

function PageRow({ page, depth = 0 }: { page: WorkspacePage; depth?: number }) {
  const { pages, activePageId, setActivePage, addPage } = useWorkspace()
  const [open, setOpen] = useState(true)
  const children = pages.filter((candidate) => candidate.parentId === page.id && !candidate.archivedAt)
  const Icon = iconMap[page.icon]

  return (
    <>
      <div
        className={`page-row ${activePageId === page.id ? 'is-active' : ''}`}
        style={{ paddingLeft: 10 + depth * 15 }}
        onClick={() => setActivePage(page.id)}
      >
        <button
          className="row-disclosure"
          aria-label={open ? '收起子页面' : '展开子页面'}
          onClick={(event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          }}
        >
          {children.length ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span />}
        </button>
        <Icon size={15} />
        <span>{page.title}</span>
        <button
          className="row-add"
          aria-label="添加子页面"
          onClick={(event) => {
            event.stopPropagation()
            addPage(page.id)
          }}
        >
          <Plus size={13} />
        </button>
      </div>
      {open && children.map((child) => <PageRow key={child.id} page={child} depth={depth + 1} />)}
    </>
  )
}

function Sidebar({
  collapsed,
  onToggle,
  onSearch,
  onArchive,
  onSettings,
  onNotifications,
  onImport,
  notificationCount,
}: {
  collapsed: boolean
  onToggle: () => void
  onSearch: () => void
  onArchive: () => void
  onSettings: () => void
  onNotifications: () => void
  onImport: () => void
  notificationCount: number
}) {
  const { pages, addPage, setActivePage } = useWorkspace()
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const topLevel = pages.filter((page) => page.parentId === null && !page.archivedAt)
  const favorites = pages.filter((page) => page.favorite && !page.archivedAt)

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="icon-button brand-mark" onClick={onToggle} aria-label="展开侧栏">N</button>
        <button className="icon-button" onClick={onSearch}><Search size={17} /></button>
        <button className="icon-button" onClick={onNotifications}><Inbox size={17} /></button>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="workspace-switcher">
        <div className="brand-mark">N</div>
        <div className="workspace-name"><strong>NoteTodo</strong><span>个人工作区</span></div>
        <button className="icon-button" onClick={onToggle}><ChevronsLeft size={16} /></button>
      </div>

      <nav className="primary-nav">
        <button onClick={onSearch}><Search size={16} /><span>搜索</span><kbd>Ctrl K</kbd></button>
        <button><Home size={16} /><span>主页</span></button>
        <button onClick={onNotifications}><Inbox size={16} /><span>收件箱</span>{notificationCount > 0 && <em>{notificationCount}</em>}</button>
        <button><Bot size={16} /><span>AI 工作台</span><i>Beta</i></button>
      </nav>

      <div className="sidebar-section">
        <div className="section-label"><span>收藏</span><MoreHorizontal size={14} /></div>
        {favorites.map((page) => {
          const Icon = iconMap[page.icon]
          return <button className="simple-row" key={page.id} onClick={() => setActivePage(page.id)}><Icon size={15} /><span>{page.title}</span></button>
        })}
      </div>

      <div className="sidebar-section page-section">
        <div className="section-label"><span>私有</span><button aria-label="从模板新建页面" onClick={() => setTemplateMenuOpen((value) => !value)}><Plus size={14} /></button></div>
        {templateMenuOpen && <div className="template-quick-menu">
          <header><LayoutTemplate size={13} /><span>选择起点</span><small>LOCAL TEMPLATES</small></header>
          {pageTemplates.map((template) => {
            const TemplateIcon = iconMap[template.icon]
            return <button key={template.id} onClick={() => { addPage(null, template.id); setTemplateMenuOpen(false) }}><TemplateIcon size={14} /><span><strong>{template.name}</strong><small>{template.description}</small></span></button>
          })}
        </div>}
        <div className="page-tree">
          {topLevel.map((page) => <PageRow key={page.id} page={page} />)}
        </div>
      </div>

      <nav className="secondary-nav">
        <button onClick={onImport}><Upload size={16} /><span>导入工作区</span></button>
        <button onClick={onArchive}><Archive size={16} /><span>归档与回收站</span></button>
        <button onClick={onSettings}><Settings size={16} /><span>设置</span></button>
        <button><CircleHelp size={16} /><span>帮助与快捷键</span></button>
      </nav>
    </aside>
  )
}

function ImportPanel({ onClose, onImported }: { onClose: () => void; onImported: () => Promise<void> }) {
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

function SearchPalette({ onClose }: { onClose: () => void }) {
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

function ArchivePanel({ onClose }: { onClose: () => void }) {
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

function NotificationPanel({ onClose, onCountChange }: { onClose: () => void; onCountChange: (count: number) => void }) {
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

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="notification-panel" onMouseDown={(event) => event.stopPropagation()}><header><div><Inbox size={17} /><span><strong>收件箱</strong><small>提及与页面协作动态</small></span></div><button onClick={onClose}><X size={16} /></button></header><div className="notification-list">{items.map((item) => <button className={item.readAt ? 'is-read' : ''} key={item.id} onClick={() => void open(item)}><i>{item.authorName?.slice(0, 1) || '@'}</i><span><strong>{item.authorName} 在「{item.pageTitle}」中提到了你</strong><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small></span>{!item.readAt && <em />}</button>)}{!items.length && <div className="empty-state"><Inbox size={25} /><strong>没有新消息</strong><span>评论中的 @提及会出现在这里。</span></div>}</div></section></div>
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

function ModelSettingsPanel({ onClose }: { onClose: () => void }) {
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
      <aside><div className="settings-brand"><span className="brand-mark">N</span><strong>设置</strong></div><nav><button>工作区</button><button className="is-active"><Cpu size={15} />模型与 AI</button><button>连接器</button><button>数据与安全</button></nav><div className="settings-trust"><ShieldCheck size={16} /><span><strong>本地优先</strong><small>密钥不会进入页面内容</small></span></div></aside>
      <main>
        <header><div><span>工作区设置</span><h2>模型与 AI</h2><p>选择云端或本地模型。NoteTodo 使用统一网关，不绑定供应商。</p></div><button onClick={onClose}><X size={18} /></button></header>
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

function SharePanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
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

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="share-panel" onMouseDown={(event) => event.stopPropagation()}><header><div><Users size={17} /><span><strong>共享此页面</strong><small>权限在加入协作房间前验证</small></span></div><button onClick={onClose}><X size={16} /></button></header><div className="share-invite"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="姓名或团队成员 ID" /><select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="editor">可编辑</option><option value="commenter">可评论</option><option value="viewer">可查看</option></select><button onClick={() => void add()}>邀请</button></div><div className="permission-list"><span>已有访问权限</span>{permissions.map((permission) => <div key={permission.subjectId}><i>{permission.displayName.slice(0, 1)}</i><span><strong>{permission.displayName}</strong><small>{permission.subjectId.slice(0, 8)}</small></span><em>{permission.role === 'owner' ? '所有者' : permission.role === 'editor' ? '可编辑' : permission.role === 'commenter' ? '可评论' : '可查看'}</em>{permission.role !== 'owner' && <button aria-label={`移除 ${permission.displayName}`} onClick={() => void remove(permission)}><X size={12} /></button>}</div>)}</div><footer><ShieldCheck size={14} />房间票据仅对当前页面有效，5 分钟后过期</footer></section></div>
}

function CommentsPanel({ pageId, editor, onClose }: { pageId: string; editor: Editor | null; onClose: () => void }) {
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

  return <aside className="comments-panel"><header><div><MessageSquare size={16} /><span><strong>页面讨论</strong><small>{comments.filter((comment) => !comment.resolvedAt).length} 条未解决</small></span></div><button onClick={onClose}><X size={16} /></button></header><div className="comment-composer">{quote && <blockquote>“{quote}”</blockquote>}<textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={quote ? '评论所选内容，支持 @提及…' : '添加页面评论，输入 @ 提及成员…'} />{members.length > 0 && <div className="mention-members"><span>提及</span>{members.slice(0, 5).map((member) => <button key={member.subjectId} onClick={() => setBody((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${member.displayName} `)}>@{member.displayName}</button>)}</div>}<button onClick={() => void create()} disabled={!body.trim()}>发布评论</button></div><div className="comment-list">{comments.map((comment) => <article className={comment.resolvedAt ? 'is-resolved' : ''} key={comment.id}>{comment.anchor?.quote && <blockquote>“{comment.anchor.quote}”</blockquote>}<header><i>{comment.authorName.slice(0, 1)}</i><span><strong>{comment.authorName}</strong><small>{new Date(comment.createdAt).toLocaleString('zh-CN')}</small></span></header><p>{comment.body}</p>{!comment.resolvedAt && <button onClick={() => void resolve(comment.id)}><CheckCircle2 size={12} />标记已解决</button>}</article>)}</div></aside>
}

function PageHistoryPanel({ page, canRestore, onRestored, onClose }: { page: WorkspacePage; canRestore: boolean; onRestored: (page: WorkspacePage) => void; onClose: () => void }) {
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

function AIPanel({ onClose, selectionContext, onApplyPatch, onUndoPatch }: { onClose: () => void; selectionContext: SelectionContext | null; onApplyPatch: (patch: AIPatchProposal) => boolean; onUndoPatch: () => void }) {
  const { pages, activePageId, setActivePage } = useWorkspace()
  const activePage = pages.find((page) => page.id === activePageId)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; citations?: RetrievalCitation[] }>>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const cancelRef = useRef<null | (() => void)>(null)
  const [modelName, setModelName] = useState('浏览器预览模型')
  const [contextMode, setContextMode] = useState<'page' | 'selection'>('page')
  const [patch, setPatch] = useState<null | { id: string; text: string; operation: AIPatchProposal['operation']; range?: { from: number; to: number }; status: 'proposed' | 'applied' }>(null)
  const pageContext = useMemo(() => {
    if (!activePage) return { text: '', blocks: 0 }
    const document = new DOMParser().parseFromString(activePage.content, 'text/html')
    const blocks = document.body.querySelectorAll('p,h1,h2,h3,li,blockquote,pre').length
    return { text: (document.body.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40_000), blocks }
  }, [activePage])
  const usingSelection = contextMode === 'selection' && selectionContext

  useEffect(() => {
    if (window.notetodo?.model) void window.notetodo.model.getConfig().then((config) => setModelName(config.model))
  }, [])

  const submit = async () => {
    const content = prompt.trim()
    if (!content || running) return
    const history = [...messages, { role: 'user' as const, content }]
    setPrompt('')
    setError('')
    setRunning(true)
    const citations = !usingSelection && window.notetodo?.retrieval
      ? await window.notetodo.retrieval.search(content, 6).catch(() => [] as RetrievalCitation[])
      : []
    setMessages([...history, { role: 'assistant', content: '', citations }])

    const onEvent = (event: { type: string; text?: string; message?: string }) => {
      if (event.type === 'text-delta' && event.text) {
        setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: message.content + event.text } : message))
      }
      if (event.type === 'error') {
        setError(event.message ?? '模型执行失败。')
        setRunning(false)
      }
      if (event.type === 'done' || event.type === 'cancelled') setRunning(false)
    }

    if (window.notetodo?.model) {
      cancelRef.current = window.notetodo.model.streamChat({
        messages: [
          { role: 'system', content: '你是 NoteTodo 工作副驾驶。回答简洁、准确；涉及写入时先说明将要修改的内容。' },
          ...(activePage ? [{ role: 'system' as const, content: usingSelection
            ? `当前页面标题：${activePage.title}\n用户明确选择的正文：${selectionContext.text}`
            : `当前页面标题：${activePage.title}\n当前页面正文：${pageContext.text || '（空页面）'}` }] : []),
          ...(citations.length ? [{ role: 'system' as const, content: `以下是经过页面权限过滤的工作区检索片段。仅依据相关内容回答，并用 [S1] 形式标注引用：\n${citations.map((citation) => `[${citation.citationId}] ${citation.title} / ${citation.heading}\n${citation.excerpt}`).join('\n\n')}` }] : []),
          ...history.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        ],
      }, onEvent)
    } else {
      // Browser preview uses a deterministic stream so interaction and layout
      // can be tested without sending data to an external model.
      const demo = '这是浏览器预览响应。桌面应用会使用你在设置中配置的模型，并以流式方式返回结果。'
      let index = 0
      const timer = window.setInterval(() => {
        onEvent({ type: 'text-delta', text: demo[index] })
        index += 1
        if (index >= demo.length) { window.clearInterval(timer); onEvent({ type: 'done' }) }
      }, 24)
      cancelRef.current = () => { window.clearInterval(timer); onEvent({ type: 'cancelled' }) }
    }
  }

  const cancel = () => {
    cancelRef.current?.()
    cancelRef.current = null
    setRunning(false)
  }

  useEffect(() => () => cancelRef.current?.(), [])

  const proposePatch = async (text: string) => {
    const operation: AIPatchProposal['operation'] = usingSelection ? 'replace-selection' : 'insert-paragraphs'
    const id = window.notetodo?.ai && activePage
      ? await window.notetodo.ai.createPatchAudit(activePage.id, operation, text)
      : crypto.randomUUID()
    setPatch({ id, text, operation, ...(usingSelection ? { range: { from: selectionContext.from, to: selectionContext.to } } : {}), status: 'proposed' })
  }

  const rejectPatch = () => {
    if (patch && window.notetodo?.ai) void window.notetodo.ai.updatePatchAudit(patch.id, 'rejected')
    setPatch(null)
  }

  const applyPatch = () => {
    if (!patch || !onApplyPatch({ text: patch.text, operation: patch.operation, range: patch.range })) return
    if (window.notetodo?.ai) void window.notetodo.ai.updatePatchAudit(patch.id, 'applied')
    setPatch({ ...patch, status: 'applied' })
  }

  const undoPatch = () => {
    if (!patch) return
    onUndoPatch()
    if (window.notetodo?.ai) void window.notetodo.ai.updatePatchAudit(patch.id, 'undone')
    setPatch(null)
  }

  return (
    <aside className="ai-panel">
      <div className="ai-panel-head">
        <div><span className="ai-orbit"><Sparkles size={15} /></span><strong>工作副驾驶</strong></div>
        <button className="icon-button" onClick={onClose}><PanelRightClose size={17} /></button>
      </div>
      <div className="ai-context"><span>上下文</span><div className="context-switch"><button className={contextMode === 'page' ? 'is-active' : ''} onClick={() => setContextMode('page')}>当前页面 · {pageContext.blocks} 块</button><button className={contextMode === 'selection' ? 'is-active' : ''} disabled={!selectionContext} onClick={() => setContextMode('selection')}>所选文本</button></div><strong>{usingSelection ? `“${selectionContext.text.slice(0, 36)}${selectionContext.text.length > 36 ? '…' : ''}”` : activePage?.title ?? '当前页面'}</strong></div>
      <div className="ai-conversation">
        {!messages.length && <div className="ai-message"><span className="ai-orbit"><Sparkles size={14} /></span><div><p>我可以帮你整理这页内容，也可以调用已经授权的工具。</p><div className="quick-actions"><button onClick={() => setPrompt('提取当前页面的待办事项')}>提取待办</button><button onClick={() => setPrompt('总结当前页面')}>生成摘要</button><button onClick={() => setPrompt('根据当前内容继续写')}>继续写</button></div></div></div>}
        {messages.map((message, index) => <div className={`chat-message is-${message.role}`} key={index}>{message.role === 'assistant' && <span className="ai-orbit"><Sparkles size={13} /></span>}<div><small>{message.role === 'user' ? '你' : 'NoteTodo AI'}</small><p>{message.content || (running && index === messages.length - 1 ? '正在思考…' : '')}</p>{message.role === 'assistant' && message.content && !running && index === messages.length - 1 && <><button className="preview-patch" onClick={() => void proposePatch(message.content)}><FileText size={12} />预览写入</button><div className="ai-citation"><BookOpen size={11} /><span>来源</span>{message.citations?.length ? message.citations.map((citation) => <button key={`${citation.pageId}-${citation.chunkIndex}`} onClick={() => setActivePage(citation.pageId)}><em>{citation.citationId}</em>{citation.title}</button>) : <button onClick={() => activePage && setActivePage(activePage.id)}>{activePage?.title}{usingSelection ? ' / 所选文本' : ' / 当前页面'}</button>}</div></>}</div></div>)}
        {error && <div className="ai-error"><CircleHelp size={14} />{error}</div>}
        {patch && <section className={`ai-patch-card is-${patch.status}`}><header><span>AI PATCH / {patch.operation === 'replace-selection' ? 'REPLACE' : 'INSERT'}</span><strong>{patch.status === 'applied' ? '已写入页面' : '待确认变更'}</strong></header><div className="patch-target"><FileText size={13} /><span><small>目标</small>{activePage?.title ?? '当前页面'} · {patch.operation === 'replace-selection' ? '替换所选文本' : '光标后插入'}</span></div>{patch.operation === 'replace-selection' && selectionContext && <del>{selectionContext.text}</del>}<pre>{patch.text}</pre><footer>{patch.status === 'proposed' ? <><button onClick={rejectPatch}>取消</button><button className="apply-patch" onClick={applyPatch}>确认写入</button></> : <><span><CheckCircle2 size={13} />已记录到审计日志</span><button onClick={undoPatch}>撤销</button></>}</footer></section>}
      </div>
      <div className="model-pill"><span className="status-dot" />当前模型 · {modelName}</div>
      <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="询问、改写，或交给 AI 执行…" />
        <div><button type="button"><Plus size={16} /></button><span>页面上下文已开启</span>{running ? <button type="button" className="send-button is-cancel" onClick={cancel} aria-label="停止生成"><X size={14} /></button> : <button className="send-button" disabled={!prompt.trim()}><ChevronRight size={17} /></button>}</div>
      </form>
      <small className="ai-disclaimer">AI 可能犯错。所有写入操作都可以撤销。</small>
    </aside>
  )
}

function WorkspaceEditor({ onEditorReady, onSelectionChange }: { onEditorReady: (editor: Editor | null) => void; onSelectionChange: (selection: SelectionContext | null) => void }) {
  const { pages, activePageId, updatePage, toggleFavorite, archivePage, setActivePage } = useWorkspace()
  const page = pages.find((candidate) => candidate.id === activePageId) ?? pages[0]
  const breadcrumbs = useMemo(() => pageBreadcrumbs(pages, page.id), [pages, page.id])
  const isDatabasePage = page.icon === 'grid' && page.content.includes('data-notetodo-page-layout="database"')
  const [slashMenu, setSlashMenu] = useState<EditorMenuState | null>(null)
  const slashMenuRef = useRef(slashMenu)
  const [pageMentionMenu, setPageMentionMenu] = useState<EditorMenuState | null>(null)
  const pageMentionMenuRef = useRef(pageMentionMenu)
  const [syncSession, setSyncSession] = useState<PageSyncSession | null>(null)
  const loadingDocument = useMemo(() => new Y.Doc(), [page.id])
  const [syncState, setSyncState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [collaborationState, setCollaborationState] = useState<'local' | 'connecting' | 'online' | 'offline'>('local')
  const [collaborators, setCollaborators] = useState<RemoteCursor[]>([])
  const [shareOpen, setShareOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pageRole, setPageRole] = useState<'viewer' | 'commenter' | 'editor' | 'owner'>('owner')
  const [uploadState, setUploadState] = useState<null | { phase: 'working' | 'complete' | 'error'; percent: number; name: string; message: string }>(null)
  const [dropActive, setDropActive] = useState(false)
  const [blockToolbar, setBlockToolbar] = useState<null | { index: number; top: number }>(null)
  const uploadBusyRef = useRef(false)
  const localEditorRef = useRef<Editor | null>(null)
  slashMenuRef.current = slashMenu
  pageMentionMenuRef.current = pageMentionMenu

  const reportAttachmentProgress = (progress: { completed: number; total: number; currentName: string }) => {
    const percent = progress.total ? Math.min(100, Math.round(progress.completed / progress.total * 100)) : 0
    setUploadState({ phase: 'working', percent, name: progress.currentName, message: '正在校验并写入本地资源库' })
  }

  const insertStoredAttachments = (activeEditor: Editor, attachments: StoredAttachment[], forcedKind?: 'image' | 'file') => {
    const content = attachments.map((attachment) => forcedKind === 'image' || (!forcedKind && attachment.mimeType.startsWith('image/'))
      ? { type: 'image', attrs: { src: attachment.url, previewSrc: attachment.previewUrl, alt: attachment.displayName, title: attachment.displayName } }
      : { type: 'fileAttachment', attrs: { src: attachment.url, name: attachment.displayName, size: attachment.size, mimeType: attachment.mimeType } })
    activeEditor.chain().focus().insertContent(content).run()
  }

  const pickAndInsertAttachment = async (activeEditor: Editor, kind: 'image' | 'file') => {
    if (uploadBusyRef.current) return
    if (!window.notetodo?.attachments) {
      setUploadState({ phase: 'error', percent: 0, name: '', message: '请在 NoteTodo 桌面应用中选择本地附件。' })
      return
    }
    uploadBusyRef.current = true
    setUploadState({ phase: 'working', percent: 0, name: '', message: '等待选择本地文件…' })
    try {
      const attachments = await window.notetodo.attachments.pickAndStore(page.id, kind, reportAttachmentProgress)
      if (!attachments.length) return setUploadState(null)
      insertStoredAttachments(activeEditor, attachments, kind)
      setUploadState({ phase: 'complete', percent: 100, name: attachments.at(-1)?.displayName ?? '', message: `已插入 ${attachments.length} 个${kind === 'image' ? '图片' : '文件'}` })
    } catch (error) {
      const detail = error instanceof Error ? error.message.split('Error: ').at(-1) ?? error.message : '附件写入失败。'
      setUploadState({ phase: 'error', percent: 0, name: '', message: detail })
    } finally {
      uploadBusyRef.current = false
    }
  }

  const storeDroppedAttachments = async (activeEditor: Editor, files: File[]) => {
    if (uploadBusyRef.current || !files.length || !window.notetodo?.attachments) { setDropActive(false); return }
    uploadBusyRef.current = true
    setUploadState({ phase: 'working', percent: 0, name: files[0]?.name ?? '', message: '正在接收拖放内容…' })
    try {
      const attachments = await window.notetodo.attachments.storeDropped(page.id, files, reportAttachmentProgress)
      if (!attachments.length) return setUploadState(null)
      insertStoredAttachments(activeEditor, attachments)
      setUploadState({ phase: 'complete', percent: 100, name: attachments.at(-1)?.displayName ?? '', message: `已插入 ${attachments.length} 个附件` })
    } catch (error) {
      const detail = error instanceof Error ? error.message.split('Error: ').at(-1) ?? error.message : '附件写入失败。'
      setUploadState({ phase: 'error', percent: 0, name: '', message: detail })
    } finally {
      uploadBusyRef.current = false
      setDropActive(false)
    }
  }

  const databaseSourcePage = pages.find((candidate) => candidate.id === 'projects')
  const slashCommands = useMemo<SlashCommand[]>(() => [
    ...baseSlashCommands,
    { label: '关联数据库', hint: '嵌入产品路线的实时视图', keywords: 'linked database 关联 数据库 视图', icon: Grid2X2, run: (activeEditor) => {
      if (databaseSourcePage) activeEditor.chain().focus().insertContent({ type: 'linkedDatabase', attrs: { sourcePageId: databaseSourcePage.id, sourceTitle: databaseSourcePage.title } }).run()
    } },
    { label: '本地图片', hint: '选择图片并安全存入工作区', keywords: 'image photo upload 图片 上传', icon: ImageIcon, run: (activeEditor) => { void pickAndInsertAttachment(activeEditor, 'image') } },
    { label: '本地文件', hint: '附加文档、压缩包或媒体', keywords: 'file attachment upload 文件 附件 上传', icon: Paperclip, run: (activeEditor) => { void pickAndInsertAttachment(activeEditor, 'file') } },
  ], [page.id, databaseSourcePage?.id, databaseSourcePage?.title])

  const filteredSlashCommands = useMemo(() => {
    const query = slashMenu?.query.toLocaleLowerCase() ?? ''
    return slashCommands.filter((command) => `${command.label} ${command.keywords}`.toLocaleLowerCase().includes(query))
  }, [slashMenu?.query, slashCommands])

  const mentionedPages = useMemo(() => {
    const query = pageMentionMenu?.query.trim().toLocaleLowerCase() ?? ''
    return pages
      .filter((candidate) => !candidate.archivedAt && candidate.id !== page.id && (!query || candidate.title.toLocaleLowerCase().includes(query)))
      .slice(0, 8)
  }, [page.id, pageMentionMenu?.query, pages])

  const editor = useEditor({
    extensions: [
      ...documentSchemaExtensions(),
      Placeholder.configure({ placeholder: "输入 '/' 插入内容，或直接开始书写…" }),
      Collaboration.configure({ document: syncSession?.document ?? loadingDocument, field: 'body' }),
      RemoteCursors,
    ],
    content: syncSession?.initialContent(page.content) ?? '',
    editable: Boolean(syncSession) && ['editor', 'owner'].includes(pageRole),
    immediatelyRender: false,
    editorProps: {
      handleClick: (_view, _position, event) => {
        const anchor = (event.target as HTMLElement).closest('a[href^="notetodo-page:"]')
        const href = anchor?.getAttribute('href')
        if (!href) return false
        const targetPageId = href.slice('notetodo-page:'.length)
        if (!pages.some((candidate) => candidate.id === targetPageId)) return false
        event.preventDefault()
        setActivePage(targetPageId)
        return true
      },
      handleKeyDown: (view, event) => {
        if (!['/', '@'].includes(event.key) || !view.state.selection.empty) return false
        const position = view.state.selection.from
        const coordinates = view.coordsAtPos(position)
        const nextMenu = {
          from: position,
          left: Math.min(coordinates.left, window.innerWidth - 310),
          top: Math.min(coordinates.bottom + 8, window.innerHeight - 430),
          query: '',
          index: 0,
        }
        if (event.key === '/') { setSlashMenu(nextMenu); setPageMentionMenu(null) }
        else { setPageMentionMenu(nextMenu); setSlashMenu(null) }
        return false
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        if (!files.length || !window.notetodo?.attachments || !localEditorRef.current?.isEditable) return false
        event.preventDefault()
        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })
        const activeEditor = localEditorRef.current
        if (!activeEditor) return true
        if (coordinates) activeEditor.commands.setTextSelection(coordinates.pos)
        void storeDroppedAttachments(activeEditor, files)
        return true
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
        if (!files.length || !window.notetodo?.attachments || !localEditorRef.current?.isEditable) return false
        event.preventDefault()
        const activeEditor = localEditorRef.current
        if (activeEditor) void storeDroppedAttachments(activeEditor, files)
        return true
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      // A full-page database stores its layout marker in the page document.
      // The hidden rich-text editor must not normalize that marker away.
      if (isDatabasePage) return
      const content = activeEditor.getHTML()
      updatePage(page.id, { content })
      const menu = slashMenuRef.current
      const cursor = activeEditor.state.selection.from
      if (menu) {
        const typed = activeEditor.state.doc.textBetween(menu.from, cursor, '\n', '\0')
        if (typed.startsWith('/') && !/\s/u.test(typed)) setSlashMenu((current) => current ? { ...current, query: typed.slice(1), index: 0 } : null)
        else setSlashMenu(null)
      }
      const mentionMenu = pageMentionMenuRef.current
      if (mentionMenu) {
        const typed = activeEditor.state.doc.textBetween(mentionMenu.from, cursor, '\n', '\0')
        if (typed.startsWith('@') && !/\s/u.test(typed)) setPageMentionMenu((current) => current ? { ...current, query: typed.slice(1), index: 0 } : null)
        else setPageMentionMenu(null)
      }
    },
    onSelectionUpdate: ({ editor: activeEditor }) => {
      const selection = activeEditor.state.selection
      syncSession?.updatePresence({ anchor: selection.anchor, head: selection.head })
      onSelectionChange(selection.empty ? null : { from: selection.from, to: selection.to, text: activeEditor.state.doc.textBetween(selection.from, selection.to, ' ') })
    },
  }, [page.id, syncSession, loadingDocument, pageRole, isDatabasePage])
  localEditorRef.current = editor

  const trackHoveredBlock = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editor?.isEditable) return
    const root = editor.view.dom
    let block = event.target as HTMLElement | null
    while (block?.parentElement && block.parentElement !== root) block = block.parentElement
    if (!block || block.parentElement !== root) return
    const index = Array.from(root.children).indexOf(block)
    if (index < 0) return
    const documentElement = root.closest('.document')
    if (!documentElement) return
    const blockRect = block.getBoundingClientRect()
    const documentRect = documentElement.getBoundingClientRect()
    setBlockToolbar((current) => current?.index === index && Math.abs(current.top - (blockRect.top - documentRect.top)) < 1
      ? current
      : { index, top: blockRect.top - documentRect.top })
  }

  const runBlockAction = (action: BlockAction) => {
    if (!editor || !blockToolbar) return
    const moved = applyBlockAction(editor, blockToolbar.index, action)
    if (!moved) return
    setBlockToolbar((current) => {
      if (!current) return null
      if (action === 'move-up') return { ...current, index: Math.max(0, current.index - 1) }
      if (action === 'move-down') return { ...current, index: Math.min(editor.state.doc.childCount - 1, current.index + 1) }
      if (action === 'delete') return null
      return current
    })
  }

  const runSlashCommand = (command: SlashCommand) => {
    if (!editor || !slashMenu) return
    const cursor = editor.state.selection.from
    editor.chain().focus().deleteRange({ from: slashMenu.from, to: cursor }).run()
    command.run(editor)
    setSlashMenu(null)
  }

  const insertPageMention = (mentionedPage: WorkspacePage) => {
    if (!editor || !pageMentionMenu) return
    const cursor = editor.state.selection.from
    editor.chain().focus().deleteRange({ from: pageMentionMenu.from, to: cursor }).insertContent([
      { type: 'pageMention', attrs: { pageId: mentionedPage.id, title: mentionedPage.title } },
      { type: 'text', text: ' ' },
    ]).run()
    setPageMentionMenu(null)
  }

  useEffect(() => { onEditorReady(editor); return () => onEditorReady(null) }, [editor, onEditorReady])
  useEffect(() => renderRemoteCursors(editor, collaborators), [editor, collaborators])

  useEffect(() => {
    if (!uploadState || uploadState.phase === 'working') return
    const timeout = window.setTimeout(() => setUploadState(null), uploadState.phase === 'complete' ? 3200 : 6500)
    return () => window.clearTimeout(timeout)
  }, [uploadState?.phase, uploadState?.message])

  useEffect(() => {
    if (!slashMenu) return
    const handleMenuKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSlashMenu(null)
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setSlashMenu((current) => current && filteredSlashCommands.length
          ? { ...current, index: (current.index + direction + filteredSlashCommands.length) % filteredSlashCommands.length }
          : current)
      } else if (event.key === 'Enter' && filteredSlashCommands.length) {
        event.preventDefault()
        runSlashCommand(filteredSlashCommands[slashMenu.index] ?? filteredSlashCommands[0])
      }
    }
    window.addEventListener('keydown', handleMenuKeys, true)
    return () => window.removeEventListener('keydown', handleMenuKeys, true)
  }, [slashMenu, filteredSlashCommands, editor])

  useEffect(() => {
    if (!pageMentionMenu) return
    const handleMentionKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPageMentionMenu(null) }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setPageMentionMenu((current) => current && mentionedPages.length
          ? { ...current, index: (current.index + direction + mentionedPages.length) % mentionedPages.length }
          : current)
      } else if (event.key === 'Enter' && mentionedPages.length) {
        event.preventDefault(); insertPageMention(mentionedPages[pageMentionMenu.index] ?? mentionedPages[0])
      }
    }
    window.addEventListener('keydown', handleMentionKeys, true)
    return () => window.removeEventListener('keydown', handleMentionKeys, true)
  }, [pageMentionMenu, mentionedPages, editor])

  useEffect(() => {
    let active = true
    let session: PageSyncSession | undefined
    let disconnectCollaboration: (() => void) | undefined
    setSyncState('loading')
    setCollaborationState('local')
    setCollaborators([])
    void PageSyncSession.open(page.id, page.content).then((opened) => {
      if (!active) return void opened.dispose()
      session = opened
      const legacyContent = opened.initialContent(page.content) ?? ''
      migrateHtmlToNativeFragment(opened.document, legacyContent)
      setSyncSession(opened)
      opened.subscribeState(setSyncState)
      if (window.notetodo?.collaboration) {
        void window.notetodo.collaboration.getTicket(page.id).then((ticket) => {
          if (!active) return
          if (!ticket) {
            return
          }
          setPageRole(ticket.role)
          setCollaborators([{ clientId: ticket.userId, name: ticket.name, color: ticket.color }])
          disconnectCollaboration = opened.connectCollaboration(ticket, {
            refreshTicket: () => window.notetodo!.collaboration.getTicket(page.id),
            onSeedRequired: () => migrateHtmlToNativeFragment(opened.document, legacyContent),
            onState: (state) => setCollaborationState(state === 'online' ? 'online' : state === 'offline' ? 'offline' : 'connecting'),
            onPresence: (presence) => setCollaborators((current) => {
              if (presence.clientId === ticket.userId) return current
              return 'left' in presence
                ? current.filter((person) => person.clientId !== presence.clientId)
                : [...current.filter((person) => person.clientId !== presence.clientId), presence]
            }),
          })
        })
      }
    }).catch(() => active && setSyncState('error'))
    return () => {
      active = false
      disconnectCollaboration?.()
      setSyncSession((current) => current === session ? null : current)
      if (session) void session.dispose()
    }
  }, [page.id])

  return (
    <main className="workspace">
      <header className="topbar">
        <div className="breadcrumbs">
          {breadcrumbs.map((crumb, index) => <span key={crumb.id}>{index > 0 && <ChevronRight size={13} />}{crumb.title}</span>)}
        </div>
        <div className="top-actions">
          <span className={`save-state is-${syncState}`}><i />{syncState === 'loading' ? '正在恢复' : syncState === 'saving' ? '正在保存' : syncState === 'error' ? '同步异常' : '本机 CRDT 已同步'}</span>
          <div className={`collaboration-presence is-${collaborationState}`} title={collaborationState === 'online' ? '实时协作已连接' : collaborationState === 'offline' ? '离线编辑，恢复后自动同步' : '本机模式'}>
            <span className="presence-state"><Users size={13} />{collaborationState === 'online' ? '实时' : collaborationState === 'offline' ? '离线' : collaborationState === 'connecting' ? '连接中' : '本机'}</span>
            <span className="presence-avatars">{collaborators.slice(0, 3).map((person) => <i key={person.clientId} style={{ background: person.color }} title={person.name}>{person.name.slice(0, 1)}</i>)}</span>
          </div>
          <button onClick={() => setCommentsOpen(true)} aria-label="页面评论"><MessageSquare size={15} /></button>
          <button onClick={() => setHistoryOpen(true)} aria-label="页面历史"><HistoryIcon size={15} /></button>
          <button onClick={() => setShareOpen(true)}>分享</button>
          <button className={page.favorite ? 'is-starred' : ''} onClick={() => toggleFavorite(page.id)}><Star size={17} fill={page.favorite ? 'currentColor' : 'none'} /></button>
          <button aria-label="归档当前页面" onClick={() => archivePage(page.id)}><Trash2 size={16} /></button>
          <button><MoreHorizontal size={18} /></button>
        </div>
      </header>

      <div className="editor-scroll">
        <article className={`document ${isDatabasePage ? 'is-database-page' : ''}`}>
          <div className="document-kicker"><span>NT / {page.id.slice(0, 4).toUpperCase()}</span><span>{new Date(page.updatedAt).toLocaleDateString('zh-CN')}</span></div>
          {!isDatabasePage && <div className="page-meta-actions"><button>添加图标</button><button>添加封面</button><button>添加说明</button></div>}
          <input
            className="page-title"
            value={page.title}
            aria-label="页面标题"
            onChange={(event) => updatePage(page.id, { title: event.target.value })}
          />
          {!isDatabasePage && <div
            className={`editor-stage ${dropActive ? 'is-drop-active' : ''}`}
            onMouseMove={trackHoveredBlock}
            onDragEnter={(event) => { if (editor?.isEditable && window.notetodo?.attachments && event.dataTransfer.types.includes('Files')) setDropActive(true) }}
            onDragOver={(event) => { if (editor?.isEditable && window.notetodo?.attachments && event.dataTransfer.types.includes('Files')) event.preventDefault() }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }}
          >
            <EditorContent editor={editor} className="editor-content" />
            {dropActive && <div className="editor-drop-guide" aria-hidden="true"><Upload size={18} /><strong>放入工作页</strong><span>图片显示为画面，其他内容成为文件卡片</span></div>}
          </div>}
          {!isDatabasePage && blockToolbar && editor?.isEditable && (
            <div className="block-toolbar" style={{ top: blockToolbar.top }} role="toolbar" aria-label="内容块工具栏">
              <span title="内容块"><GripVertical size={14} /></span>
              <button onMouseDown={(event) => { event.preventDefault(); runBlockAction('move-up') }} disabled={blockToolbar.index === 0} aria-label="上移内容块"><ArrowUp size={13} /></button>
              <button onMouseDown={(event) => { event.preventDefault(); runBlockAction('move-down') }} disabled={blockToolbar.index >= editor.state.doc.childCount - 1} aria-label="下移内容块"><ArrowDown size={13} /></button>
              <button onMouseDown={(event) => { event.preventDefault(); runBlockAction('duplicate') }} aria-label="复制内容块"><Copy size={13} /></button>
              <button className="is-danger" onMouseDown={(event) => { event.preventDefault(); runBlockAction('delete') }} aria-label="删除内容块"><Trash2 size={13} /></button>
            </div>
          )}
          {uploadState && (
            <div className={`asset-progress is-${uploadState.phase}`} role="status" aria-live="polite">
              <span className="asset-progress-mark">{uploadState.phase === 'complete' ? '✓' : uploadState.phase === 'error' ? '!' : <Upload size={13} />}</span>
              <span className="asset-progress-copy">
                <strong>{uploadState.message}</strong>
                {uploadState.name && <small>{uploadState.name}</small>}
              </span>
              {uploadState.phase === 'working' && <em>{uploadState.percent}%</em>}
              <i style={{ width: `${uploadState.percent}%` }} />
            </div>
          )}
          <PageDatabaseMount pageId={page.id} pageTitle={page.title} canEdit={Boolean(editor?.isEditable)} fullPage={isDatabasePage} />
          {!isDatabasePage && slashMenu && (
            <div className="slash-menu" style={{ left: slashMenu.left, top: slashMenu.top }}>
              <header><span>插入内容块</span><kbd>/</kbd></header>
              <div>
                {filteredSlashCommands.map((command, index) => {
                  const Icon = command.icon
                  return (
                    <button
                      className={index === slashMenu.index ? 'is-selected' : ''}
                      key={command.label}
                      onMouseDown={(event) => { event.preventDefault(); runSlashCommand(command) }}
                    >
                      <span><Icon size={16} /></span>
                      <span><strong>{command.label}</strong><small>{command.hint}</small></span>
                    </button>
                  )
                })}
                {!filteredSlashCommands.length && <div className="slash-empty">没有匹配的内容块</div>}
              </div>
              <footer><span><kbd>↑↓</kbd> 选择</span><span><kbd>Enter</kbd> 插入</span></footer>
            </div>
          )}
          {!isDatabasePage && pageMentionMenu && (
            <div className="page-mention-menu" style={{ left: pageMentionMenu.left, top: pageMentionMenu.top }}>
              <header><span>链接到页面</span><kbd>@</kbd></header>
              <div>
                {mentionedPages.map((mentionedPage, index) => {
                  const MentionIcon = iconMap[mentionedPage.icon]
                  return (
                    <button
                      className={index === pageMentionMenu.index ? 'is-selected' : ''}
                      key={mentionedPage.id}
                      onMouseDown={(event) => { event.preventDefault(); insertPageMention(mentionedPage) }}
                    >
                      <span><MentionIcon size={15} /></span>
                      <span><strong>{mentionedPage.title}</strong><small>{pageBreadcrumbs(pages, mentionedPage.id).map((crumb) => crumb.title).join(' / ')}</small></span>
                    </button>
                  )
                })}
                {!mentionedPages.length && <div className="slash-empty">没有匹配的页面</div>}
              </div>
              <footer><span><kbd>↑↓</kbd> 选择</span><span><kbd>Enter</kbd> 链接</span></footer>
            </div>
          )}
          {!isDatabasePage && <div className="document-end"><span />END OF PAGE<span /></div>}
        </article>
      </div>
      {shareOpen && <SharePanel pageId={page.id} onClose={() => setShareOpen(false)} />}
      {commentsOpen && <CommentsPanel pageId={page.id} editor={editor} onClose={() => setCommentsOpen(false)} />}
      {historyOpen && <PageHistoryPanel
        page={page}
        canRestore={Boolean(editor?.isEditable)}
        onClose={() => setHistoryOpen(false)}
        onRestored={(restored) => {
          editor?.commands.setContent(restored.content)
          updatePage(restored.id, { title: restored.title, content: restored.content })
        }}
      />}
    </main>
  )
}

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [aiOpen, setAiOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null)
  const hydrate = useWorkspace((state) => state.hydrate)
  const activeEditorRef = useRef<Editor | null>(null)
  const setActiveEditor = useMemo(() => (editor: Editor | null) => { activeEditorRef.current = editor }, [])

  const applyAIPatch = (patch: AIPatchProposal) => {
    const editor = activeEditorRef.current
    if (!editor) return false
    const paragraphs = patch.text.split(/\n{2,}/u).map((value) => value.trim()).filter(Boolean).map((value) => ({ type: 'paragraph', content: [{ type: 'text', text: value }] }))
    if (!paragraphs.length) return false
    return patch.operation === 'replace-selection' && patch.range
      ? editor.chain().focus().insertContentAt(patch.range, paragraphs).run()
      : editor.chain().focus().insertContent(paragraphs).run()
  }

  useEffect(() => { void hydrate() }, [hydrate])
  useEffect(() => {
    if (window.notetodo?.notifications) void window.notetodo.notifications.list().then((items) => setNotificationCount(items.filter((item) => !item.readAt).length))
  }, [])

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setArchiveOpen(false)
        setSettingsOpen(false)
        setNotificationsOpen(false)
        setImportOpen(false)
      }
    }
    window.addEventListener('keydown', handleGlobalShortcut)
    return () => window.removeEventListener('keydown', handleGlobalShortcut)
  }, [])

  return (
    <div className="app-shell">
      <div className="title-drag-region"><div className="drag-title"><Command size={13} />NoteTodo</div></div>
      <div className="app-body">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          onSearch={() => setSearchOpen(true)}
          onArchive={() => setArchiveOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onNotifications={() => setNotificationsOpen(true)}
          onImport={() => setImportOpen(true)}
          notificationCount={notificationCount}
        />
        {sidebarCollapsed && <button className="floating-menu" onClick={() => setSidebarCollapsed(false)}><Menu size={17} /></button>}
        <WorkspaceEditor onEditorReady={setActiveEditor} onSelectionChange={setSelectionContext} />
        {aiOpen ? <AIPanel onClose={() => setAiOpen(false)} selectionContext={selectionContext} onApplyPatch={applyAIPatch} onUndoPatch={() => activeEditorRef.current?.commands.undo()} /> : <button className="open-ai" onClick={() => setAiOpen(true)}><PanelRightOpen size={17} /><Sparkles size={14} /></button>}
        {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
        {archiveOpen && <ArchivePanel onClose={() => setArchiveOpen(false)} />}
        {settingsOpen && <ModelSettingsPanel onClose={() => setSettingsOpen(false)} />}
        {notificationsOpen && <NotificationPanel onClose={() => setNotificationsOpen(false)} onCountChange={setNotificationCount} />}
        {importOpen && <ImportPanel onClose={() => setImportOpen(false)} onImported={hydrate} />}
      </div>
    </div>
  )
}
