import { useState, type ComponentType } from 'react'
import {
  Archive,
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
  Inbox,
  LayoutTemplate,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react'
import { type PageIcon, type WorkspacePage } from './domain'
import { pageTemplates } from './data/page-templates'
import { useWorkspace } from './store'

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
  onPageOpen,
}: {
  page: WorkspacePage
  depth?: number
  isEditorSurface: boolean
  onPageOpen: () => void
}) {
  const { pages, activePageId, setActivePage, addPage } = useWorkspace()
  const [open, setOpen] = useState(true)
  const children = pages.filter(
    (candidate) => candidate.parentId === page.id && !candidate.archivedAt,
  )
  const Icon = iconMap[page.icon]

  return (
    <>
      <div
        className={`page-row ${isEditorSurface && activePageId === page.id ? 'is-active' : ''}`}
        style={{ paddingLeft: 10 + depth * 15 }}
        onClick={() => {
          setActivePage(page.id)
          onPageOpen()
        }}
      >
        <button
          className="row-disclosure"
          aria-label={open ? '收起子页面' : '展开子页面'}
          onClick={(event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          }}
        >
          {children.length ? (
            open ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )
          ) : (
            <span />
          )}
        </button>
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
  notificationCount,
  activeSurface,
  onHome,
  onAllPages,
  onPageOpen,
}: {
  collapsed: boolean
  onToggle: () => void
  onSearch: () => void
  onArchive: () => void
  onSettings: () => void
  onNotifications: () => void
  onImport: () => void
  notificationCount: number
  activeSurface: 'home' | 'pages' | 'editor'
  onHome: () => void
  onAllPages: () => void
  onPageOpen: () => void
}) {
  const { pages, addPage, setActivePage } = useWorkspace()
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const topLevel = pages.filter((page) => page.parentId === null && !page.archivedAt)
  const favorites = pages.filter((page) => page.favorite && !page.archivedAt)

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <button className="icon-button brand-mark" onClick={onToggle} aria-label="展开侧栏">
          N
        </button>
        <button className="icon-button" onClick={onSearch}>
          <Search size={17} />
        </button>
        <button className="icon-button" onClick={onNotifications}>
          <Inbox size={17} />
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
        <button className="icon-button" onClick={onToggle}>
          <ChevronsLeft size={16} />
        </button>
      </div>

      <nav className="primary-nav">
        <button onClick={onSearch}>
          <Search size={16} />
          <span>搜索</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className={activeSurface === 'home' ? 'is-active' : ''} onClick={onHome}>
          <Home size={16} />
          <span>主页</span>
        </button>
        <button className={activeSurface === 'pages' ? 'is-active' : ''} onClick={onAllPages}>
          <Files size={16} />
          <span>所有页面</span>
        </button>
        <button onClick={onNotifications}>
          <Inbox size={16} />
          <span>收件箱</span>
          {notificationCount > 0 && <em>{notificationCount}</em>}
        </button>
        <button>
          <Bot size={16} />
          <span>AI 工作台</span>
          <i>Beta</i>
        </button>
      </nav>

      <div className="sidebar-section">
        <div className="section-label">
          <span>收藏</span>
          <MoreHorizontal size={14} />
        </div>
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

      <div className="sidebar-section page-section">
        <div className="section-label">
          <span>私有</span>
          <button
            aria-label="从模板新建页面"
            onClick={() => setTemplateMenuOpen((value) => !value)}
          >
            <Plus size={14} />
          </button>
        </div>
        {templateMenuOpen && (
          <div className="template-quick-menu">
            <header>
              <LayoutTemplate size={13} />
              <span>选择起点</span>
              <small>LOCAL TEMPLATES</small>
            </header>
            {pageTemplates.map((template) => {
              const TemplateIcon = iconMap[template.icon]
              return (
                <button
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
        <div className="page-tree">
          {topLevel.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              isEditorSurface={activeSurface === 'editor'}
              onPageOpen={onPageOpen}
            />
          ))}
        </div>
      </div>

      <nav className="secondary-nav">
        <button onClick={onImport}>
          <Upload size={16} />
          <span>导入工作区</span>
        </button>
        <button onClick={onArchive}>
          <Archive size={16} />
          <span>归档与回收站</span>
        </button>
        <button onClick={onSettings}>
          <Settings size={16} />
          <span>设置</span>
        </button>
        <button>
          <CircleHelp size={16} />
          <span>帮助与快捷键</span>
        </button>
      </nav>
    </aside>
  )
}
