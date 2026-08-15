import { useEffect, useId, useRef, useState, type ComponentType } from 'react'
import {
  Archive,
  Bell,
  BookOpen,
  Bot,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  CircleHelp,
  FileText,
  Files,
  Grid2X2,
  Home,
  LayoutTemplate,
  Plus,
  Search,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react'
import { type PageIcon, type WorkspacePage } from './domain'
import { pageTemplates } from './data/page-templates'
import { useWorkspace } from './store'
import { focusSidebarTreeItem, navigateSidebarTree } from './sidebar-tree-keyboard'

export const iconMap: Record<PageIcon, ComponentType<{ size?: number }>> = {
  spark: Sparkles,
  note: FileText,
  check: CheckSquare2,
  grid: Grid2X2,
  book: BookOpen,
}

function PageRow({
  page,
  depth = 0,
  isEditorSurface,
  tabStopPageId,
  onPageOpen,
}: {
  page: WorkspacePage
  depth?: number
  isEditorSurface: boolean
  tabStopPageId: string | undefined
  onPageOpen: () => void
}) {
  const { pages, activePageId, setActivePage, addPage } = useWorkspace()
  const [open, setOpen] = useState(true)
  const children = pages.filter(
    (candidate) => candidate.parentId === page.id && !candidate.archivedAt,
  )
  const Icon = iconMap[page.icon]
  const openPage = () => {
    setActivePage(page.id)
    onPageOpen()
  }

  return (
    <>
      <div
        className={`page-row ${isEditorSurface && activePageId === page.id ? 'is-active' : ''}`}
        style={{ paddingLeft: 10 + depth * 15 }}
        role="treeitem"
        tabIndex={page.id === tabStopPageId ? 0 : -1}
        aria-current={isEditorSurface && activePageId === page.id ? 'page' : undefined}
        aria-expanded={children.length ? open : undefined}
        aria-level={depth + 1}
        onClick={openPage}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return
          event.preventDefault()
          openPage()
        }}
      >
        {children.length ? (
          <button
            className="row-disclosure"
            aria-label={open ? '收起子页面' : '展开子页面'}
            onClick={(event) => {
              event.stopPropagation()
              setOpen((value) => !value)
            }}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="row-disclosure" aria-hidden="true" />
        )}
        <Icon size={15} />
        <span>{page.title}</span>
        <button
          className="row-add"
          aria-label="添加子页面"
          onClick={(event) => {
            event.stopPropagation()
            addPage(page.id)
            onPageOpen()
          }}
        >
          <Plus size={13} />
        </button>
      </div>
      {open &&
        children.map((child) => (
          <PageRow
            key={child.id}
            page={child}
            depth={depth + 1}
            isEditorSurface={isEditorSurface}
            tabStopPageId={tabStopPageId}
            onPageOpen={onPageOpen}
          />
        ))}
    </>
  )
}

export function Sidebar({
  collapsed,
  onToggle,
  onSearch,
  onArchive,
  onSettings,
  onNotifications,
  onImport,
  onAI,
  onHelp,
  notificationCount,
  activeSurface,
  onHome,
  onAllPages,
  onPageOpen,
  panels,
}: {
  collapsed: boolean
  onToggle: () => void
  onSearch: () => void
  onArchive: () => void
  onSettings: () => void
  onNotifications: () => void
  onImport: () => void
  onAI: () => void
  onHelp: () => void
  notificationCount: number
  activeSurface: 'home' | 'pages' | 'editor'
  onHome: () => void
  onAllPages: () => void
  onPageOpen: () => void
  panels?: {
    search: { id: string; open: boolean }
    notifications: { id: string; open: boolean }
    settings: { id: string; open: boolean }
    ai: { id: string; open: boolean }
    import: { id: string; open: boolean }
    archive: { id: string; open: boolean }
    help: { id: string; open: boolean }
  }
}) {
  const { pages, activePageId, addPage, setActivePage } = useWorkspace()
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const templateMenuId = useId()
  const templateMenuRef = useRef<HTMLDivElement>(null)
  const templateTriggerRef = useRef<HTMLButtonElement>(null)
  const topLevel = pages.filter((page) => page.parentId === null && !page.archivedAt)
  const tabStopPageId = activeSurface === 'editor' ? activePageId : topLevel[0]?.id
  const favorites = pages.filter((page) => page.favorite && !page.archivedAt)

  useEffect(() => {
    if (!templateMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setTemplateMenuOpen(false)
      templateTriggerRef.current?.focus()
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !templateMenuRef.current?.contains(event.target) &&
        !templateTriggerRef.current?.contains(event.target)
      )
        setTemplateMenuOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [templateMenuOpen])

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="icon-button brand-mark" onClick={onToggle} aria-label="展开侧栏">
          N
        </button>
        <button
          className="icon-button"
          onClick={onSearch}
          aria-label="搜索"
          aria-haspopup="dialog"
          aria-expanded={panels?.search.open}
          aria-controls={panels?.search.id}
        >
          <Search size={17} />
        </button>
        <button
          className="icon-button"
          onClick={onNotifications}
          aria-label="更新"
          aria-haspopup="dialog"
          aria-expanded={panels?.notifications.open}
          aria-controls={panels?.notifications.id}
        >
          <Bell size={17} />
        </button>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="workspace-switcher">
        <div className="brand-mark">N</div>
        <div className="workspace-name">
          <strong>NoteTodo</strong>
          <span>个人工作区</span>
        </div>
        <button className="icon-button" onClick={onToggle} aria-label="收起侧栏">
          <ChevronsLeft size={16} />
        </button>
      </div>

      <nav className="primary-nav">
        <button
          onClick={onSearch}
          aria-haspopup="dialog"
          aria-expanded={panels?.search.open}
          aria-controls={panels?.search.id}
        >
          <Search size={16} />
          <span>搜索</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button
          onClick={onNotifications}
          aria-haspopup="dialog"
          aria-expanded={panels?.notifications.open}
          aria-controls={panels?.notifications.id}
        >
          <Bell size={16} />
          <span>更新</span>
          {notificationCount > 0 && <em>{notificationCount}</em>}
        </button>
        <button
          onClick={onSettings}
          aria-haspopup="dialog"
          aria-expanded={panels?.settings.open}
          aria-controls={panels?.settings.id}
        >
          <Settings size={16} />
          <span>设置</span>
        </button>
      </nav>

      <div className="sidebar-scroll-area">
        <div className="sidebar-section page-section">
          <div className="section-label">
            <span>私有</span>
            <button
              ref={templateTriggerRef}
              aria-label="从模板新建页面"
              aria-haspopup="dialog"
              aria-expanded={templateMenuOpen}
              aria-controls={templateMenuId}
              onClick={() => setTemplateMenuOpen((value) => !value)}
            >
              <Plus size={14} />
            </button>
          </div>
          {templateMenuOpen && (
            <div
              className="template-quick-menu"
              id={templateMenuId}
              ref={templateMenuRef}
              role="dialog"
              aria-label="选择页面模板"
            >
              <header>
                <LayoutTemplate size={13} />
                <span>选择起点</span>
                <small>本地模板</small>
              </header>
              {pageTemplates.map((template) => {
                const TemplateIcon = iconMap[template.icon]
                return (
                  <button
                    autoFocus={template.id === pageTemplates[0]?.id}
                    key={template.id}
                    onClick={() => {
                      addPage(null, template.id)
                      setTemplateMenuOpen(false)
                      onPageOpen()
                    }}
                  >
                    <TemplateIcon size={14} />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <div
            className="page-tree"
            role="tree"
            aria-label="私有页面"
            onFocus={(event) => {
              if (
                event.target instanceof HTMLElement &&
                event.target.matches('[role="treeitem"]')
              ) {
                focusSidebarTreeItem(event.currentTarget, event.target)
              }
            }}
            onKeyDown={(event) => {
              if (
                !(event.target instanceof HTMLElement) ||
                !event.target.matches('[role="treeitem"]')
              )
                return
              if (!navigateSidebarTree(event.currentTarget, event.target, event.key)) return
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {topLevel.map((page) => (
              <PageRow
                key={page.id}
                page={page}
                isEditorSurface={activeSurface === 'editor'}
                tabStopPageId={tabStopPageId}
                onPageOpen={onPageOpen}
              />
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-label">
            <span>共享</span>
          </div>
          <p className="sidebar-section-empty">共享给你的页面会显示在这里</p>
        </div>

        <div className="sidebar-section">
          <div className="section-label">
            <span>工作区</span>
          </div>
          <button
            className={`simple-row ${activeSurface === 'home' ? 'is-active' : ''}`}
            onClick={onHome}
          >
            <Home size={15} />
            <span>主页</span>
          </button>
          <button
            className={`simple-row ${activeSurface === 'pages' ? 'is-active' : ''}`}
            onClick={onAllPages}
          >
            <Files size={15} />
            <span>所有页面</span>
          </button>
          <button
            className="simple-row"
            onClick={onAI}
            aria-expanded={panels?.ai.open}
            aria-controls={panels?.ai.id}
          >
            <Bot size={15} />
            <span>AI 工作台</span>
            <i>Beta</i>
          </button>
          {favorites.map((page) => {
            const Icon = iconMap[page.icon]
            return (
              <button
                className="simple-row"
                key={page.id}
                onClick={() => {
                  setActivePage(page.id)
                  onPageOpen()
                }}
              >
                <Icon size={15} />
                <span>{page.title}</span>
              </button>
            )
          })}
        </div>
      </div>

      <nav className="secondary-nav">
        <button
          onClick={() => {
            addPage(null)
            onPageOpen()
          }}
        >
          <Plus size={16} />
          <span>新建页面</span>
        </button>
        <button
          onClick={onImport}
          aria-haspopup="dialog"
          aria-expanded={panels?.import.open}
          aria-controls={panels?.import.id}
        >
          <Upload size={16} />
          <span>导入工作区</span>
        </button>
        <button
          onClick={onArchive}
          aria-haspopup="dialog"
          aria-expanded={panels?.archive.open}
          aria-controls={panels?.archive.id}
        >
          <Archive size={16} />
          <span>归档与回收站</span>
        </button>
        <button
          onClick={onHelp}
          aria-haspopup="dialog"
          aria-expanded={panels?.help.open}
          aria-controls={panels?.help.id}
        >
          <CircleHelp size={16} />
          <span>帮助与快捷键</span>
        </button>
      </nav>
    </aside>
  )
}
