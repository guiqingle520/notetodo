import { useMemo, useState } from 'react'
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
type PageGroupId = 'workspace' | 'shared' | 'private'

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
      <button className="page-list-group-heading" onClick={onToggle}>
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
                <MoreHorizontal className="page-list-more" size={15} />
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
  const [openGroups, setOpenGroups] = useState<Set<PageGroupId>>(
    () => new Set(['workspace', 'shared', 'private']),
  )

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
    const shared = filteredPages.filter((page) => page.favorite)
    const workspace = filteredPages.filter((page) => page.parentId === null && !page.favorite)
    const privatePages = filteredPages.filter((page) => page.parentId !== null && !page.favorite)
    return [
      { id: 'workspace', label: '工作区', icon: Folder, pages: workspace },
      { id: 'shared', label: '共享', icon: Share2, pages: shared },
      { id: 'private', label: '私人', icon: Star, pages: privatePages },
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
        <button aria-label="页面操作">
          <MoreHorizontal size={16} />
        </button>
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
            <div className="page-list-filters" aria-label="页面筛选">
              {filters.map((item) => (
                <button
                  className={filter === item.id ? 'is-active' : ''}
                  key={item.id}
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
            {groups.map((group) => (
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
