import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileStack,
  Folder,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Star,
} from 'lucide-react'
import type { WorkspacePage } from './domain'
import { iconMap } from './AppSidebar'
import { useWorkspace } from './store'

type PageListFilter = 'all' | 'mine' | 'recent'
type PageGroupId = 'workspace' | 'favorites' | 'nested'

interface WorkspacePageListProps {
  onOpenPage: (pageId: string) => void
  onCreatePage: () => void
}

interface PageGroup {
  id: PageGroupId
  label: string
  icon: typeof Folder
  pages: WorkspacePage[]
}

const filters: Array<{ id: PageListFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'mine', label: '我创建的' },
  { id: 'recent', label: '最近编辑' },
]

function formatEditedAt(value: string) {
  const date = new Date(value)
  const elapsed = Date.now() - date.getTime()
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) {
    return `今天 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)}`
  }
  if (elapsed < 172_800_000) return '昨天'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function PageTableGroup({
  group,
  open,
  onToggle,
  onOpenPage,
}: {
  group: PageGroup
  open: boolean
  onToggle: () => void
  onOpenPage: (pageId: string) => void
}) {
  const GroupIcon = group.icon
  return (
    <section className="page-list-group">
      <button className="page-list-group-heading" aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <GroupIcon size={15} />
        <strong>{group.label}</strong>
        <span>{group.pages.length}</span>
      </button>
      {open && (
        <div className="page-list-rows">
          {group.pages.map((page) => {
            const Icon = iconMap[page.icon]
            return (
              <button
                className="page-list-row"
                aria-label={`打开页面：${page.title}`}
                key={page.id}
                onClick={() => onOpenPage(page.id)}
              >
                <span className="page-list-name">
                  <Icon size={17} />
                  <strong>{page.title}</strong>
                </span>
                <span className="page-list-edited">
                  <Clock3 size={13} />
                  {formatEditedAt(page.updatedAt)}
                </span>
                <span className="page-list-author">
                  <i>我</i>
                  <span>Ming</span>
                </span>
                <ChevronRight className="page-list-more" size={15} />
              </button>
            )
          })}
          {!group.pages.length && <p className="page-list-empty">此分类中没有页面。</p>}
        </div>
      )}
    </section>
  )
}

export function WorkspacePageList({ onOpenPage, onCreatePage }: WorkspacePageListProps) {
  const pages = useWorkspace((state) => state.pages)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PageListFilter>('all')
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const pageMenuRef = useRef<HTMLDivElement>(null)
  const [openGroups, setOpenGroups] = useState<Set<PageGroupId>>(
    () => new Set(['workspace', 'favorites', 'nested']),
  )

  useEffect(() => {
    if (!pageMenuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPageMenuOpen(false)
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !pageMenuRef.current?.contains(event.target)) {
        setPageMenuOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [pageMenuOpen])

  const filteredPages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const visible = pages.filter((page) => !page.archivedAt)
    const searched = normalizedQuery
      ? visible.filter((page) => page.title.toLocaleLowerCase().includes(normalizedQuery))
      : visible
    if (filter === 'recent') {
      return [...searched].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10)
    }
    return searched
  }, [filter, pages, query])

  const groups = useMemo<PageGroup[]>(() => {
    const favorites = filteredPages.filter((page) => page.favorite)
    const workspace = filteredPages.filter((page) => page.parentId === null && !page.favorite)
    const nested = filteredPages.filter((page) => page.parentId !== null && !page.favorite)
    return [
      { id: 'workspace', label: '工作区', icon: Folder, pages: workspace },
      { id: 'favorites', label: '收藏', icon: Star, pages: favorites },
      { id: 'nested', label: '子页面', icon: Share2, pages: nested },
    ]
  }, [filteredPages])

  const toggleGroup = (groupId: PageGroupId) => {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  return (
    <main className="workspace-page-list">
      <header className="page-list-topbar">
        <div>
          <span>工作区</span>
          <ChevronRight size={13} />
          <span>页面</span>
        </div>
        <div className="page-list-menu-wrap" ref={pageMenuRef}>
          <button
            aria-label="页面列表操作"
            aria-haspopup="menu"
            aria-expanded={pageMenuOpen}
            onClick={() => setPageMenuOpen((current) => !current)}
          >
            <MoreHorizontal size={16} />
          </button>
          {pageMenuOpen && (
            <div className="page-list-menu" role="menu" aria-label="页面列表操作">
              <button
                autoFocus
                role="menuitem"
                onClick={() => {
                  setPageMenuOpen(false)
                  onCreatePage()
                }}
              >
                <Plus size={14} />
                新建页面
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setFilter('all')
                  setPageMenuOpen(false)
                }}
              >
                <FileStack size={14} />
                显示全部页面
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setFilter('recent')
                  setPageMenuOpen(false)
                }}
              >
                <Clock3 size={14} />
                按最近编辑筛选
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="page-list-scroll">
        <div className="page-list-canvas">
          <div className="page-list-title-row">
            <span className="page-list-title-icon">
              <FileStack size={22} />
            </span>
            <div>
              <h1>所有页面</h1>
              <p>浏览和管理工作区中的全部内容。</p>
            </div>
            <button className="page-list-new" onClick={onCreatePage}>
              <Plus size={16} />
              新建页面
            </button>
          </div>

          <div className="page-list-toolbar">
            <label>
              <Search size={15} />
              <input
                aria-label="搜索所有页面"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索页面"
              />
            </label>
            <div className="page-list-filters" aria-label="页面筛选" role="tablist">
              {filters.map((item) => (
                <button
                  className={filter === item.id ? 'is-active' : ''}
                  aria-selected={filter === item.id}
                  key={item.id}
                  role="tab"
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="page-list-table-heading">
            <span>名称</span>
            <span>最后编辑</span>
            <span>作者</span>
            <span />
          </div>
          <div className="page-list-groups">
            {!filteredPages.length ? (
              <div className="page-list-no-results" role="status">
                <Search size={19} />
                <span>
                  <strong>{query.trim() ? '没有匹配的页面' : '工作区还没有页面'}</strong>
                  <small>{query.trim() ? '换一个关键词，或清除当前筛选。' : '新建页面后会显示在这里。'}</small>
                </span>
              </div>
            ) : groups.map((group) => (
              <PageTableGroup
                key={group.id}
                group={group}
                open={openGroups.has(group.id)}
                onToggle={() => toggleGroup(group.id)}
                onOpenPage={onOpenPage}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
