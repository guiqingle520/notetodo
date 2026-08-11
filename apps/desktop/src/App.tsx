import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Bot,
  Bookmark,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  CircleHelp,
  Code2,
  Columns2,
  Columns3,
  Command,
  Copy,
  FileText,
  Grid2X2,
  GripVertical,
  Heading1,
  Heading2,
  Home,
  History as HistoryIcon,
  Inbox,
  Image as ImageIcon,
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
  PanelRightOpen,
  PanelsTopLeft,
  Paperclip,
  Plus,
  Quote,
  Search,
  Settings,
  Sparkles,
  Sigma,
  Star,
  Trash2,
  Type,
  Users,
  Upload,
} from 'lucide-react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { pageBreadcrumbs, type PageIcon, type WorkspacePage } from './domain'
import { useWorkspace } from './store'
import { PageDatabaseMount } from './DatabaseMount'
import { ArchivePanel, CommentsPanel, ImportPanel, ModelSettingsPanel, NotificationPanel, PageHistoryPanel, SearchPalette, SharePanel } from './AppPanels'
import { PageSyncSession } from './data/page-sync'
import { documentSchemaExtensions, migrateHtmlToNativeFragment } from './data/native-collaboration'
import { RemoteCursors, renderRemoteCursors, type RemoteCursor } from './data/remote-cursors'
import { createColumnLayoutContent, normalizeEmbedUrl, safeHttpsUrl } from './editor/rich-blocks'
import { applyBlockAction, type BlockAction } from './editor/block-actions'
import { pageTemplates } from './data/page-templates'
import { AIPanel, type AIPatchProposal, type SelectionContext } from './AppAIPanel'

type StoredAttachment = { hash: string; size: number; mimeType: string; displayName: string; url: string; previewUrl: string | null }
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


function WorkspaceEditor(props: { onEditorReady: (editor: Editor | null) => void; onSelectionChange: (selection: SelectionContext | null) => void }) {
  const { pages, activePageId } = useWorkspace()
  const page = pages.find((candidate) => candidate.id === activePageId) ?? pages[0]
  if (!page) {
    return <main className="workspace-main"><div className="empty-state">工作区暂时没有可显示的页面。</div></main>
  }
  return <WorkspaceEditorContent {...props} page={page} />
}

function WorkspaceEditorContent({ page, onEditorReady, onSelectionChange }: { page: WorkspacePage; onEditorReady: (editor: Editor | null) => void; onSelectionChange: (selection: SelectionContext | null) => void }) {
  const { pages, updatePage, toggleFavorite, archivePage, setActivePage } = useWorkspace()
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
        const command = filteredSlashCommands[slashMenu.index] ?? filteredSlashCommands[0]
        if (command) runSlashCommand(command)
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
        event.preventDefault()
        const mentionedPage = mentionedPages[pageMentionMenu.index] ?? mentionedPages[0]
        if (mentionedPage) insertPageMention(mentionedPage)
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
