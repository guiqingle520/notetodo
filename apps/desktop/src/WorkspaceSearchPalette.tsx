import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Database, FileText, Search } from 'lucide-react'
import { iconMap } from './AppSidebar'
import { pageBreadcrumbs, type WorkspacePage } from './domain'
import { useWorkspace } from './store'
import { useDialogFocus } from './use-dialog-focus'

interface WorkspaceSearchPaletteProps {
  id?: string
  onClose: () => void
  onOpenPage: (pageId: string) => void
}

function resultContext(page: WorkspacePage, pages: WorkspacePage[]) {
  const path = pageBreadcrumbs(pages, page.id)
  return path.length > 1
    ? path
        .slice(0, -1)
        .map((item) => item.title)
        .join('  ›  ')
    : '工作区'
}

function SearchResultRow({
  page,
  pages,
  active,
  optionId,
  onActivate,
  onOpen,
}: {
  page: WorkspacePage
  pages: WorkspacePage[]
  active: boolean
  optionId: string
  onActivate: () => void
  onOpen: () => void
}) {
  const Icon = iconMap[page.icon]
  return (
    <button
      id={optionId}
      role="option"
      aria-selected={active}
      className={`workspace-search-result ${active ? 'is-active' : ''}`}
      aria-label={`打开搜索结果：${page.title}`}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onActivate}
      onClick={onOpen}
    >
      <span className="workspace-search-result-icon">
        <Icon size={17} />
      </span>
      <span className="workspace-search-result-copy">
        <strong>{page.title || '无标题'}</strong>
        <small>{resultContext(page, pages)}</small>
      </span>
      <CornerDownLeft className="workspace-search-enter" size={14} />
    </button>
  )
}

export function WorkspaceSearchPalette({ id, onClose, onOpenPage }: WorkspaceSearchPaletteProps) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const pages = useWorkspace((state) => state.pages)
  const searchResults = useWorkspace((state) => state.searchResults)
  const search = useWorkspace((state) => state.search)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) return
    // Keep IME typing responsive while avoiding one SQLite request per composition update.
    const timer = window.setTimeout(() => void search(query), 90)
    return () => window.clearTimeout(timer)
  }, [query, search])

  const results = useMemo(() => {
    if (query.trim()) return searchResults
    return [...pages]
      .filter((page) => !page.archivedAt)
      .sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt))
      .slice(0, 6)
  }, [pages, query, searchResults])

  useEffect(() => setActiveIndex(0), [query, results.length])

  useEffect(() => {
    // Keep keyboard navigation visible without moving focus away from the search input.
    const activeOption = resultsRef.current?.children.item(activeIndex) as HTMLElement | null
    activeOption?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, results])

  const openResult = (page: WorkspacePage | undefined) => {
    if (!page) return
    onOpenPage(page.id)
    onClose()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (results.length ? (current + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        results.length ? (current - 1 + results.length) % results.length : 0,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      openResult(results[activeIndex])
    }
  }

  return (
    <div
      className="modal-backdrop workspace-search-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        id={id}
        ref={dialogRef}
        className="workspace-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="搜索工作区"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="workspace-search-input">
          <Search size={20} />
          <input
            ref={inputRef}
            autoFocus
            aria-label="搜索页面与内容"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="workspace-search-results"
            aria-activedescendant={
              results[activeIndex]
                ? `workspace-search-option-${results[activeIndex].id}`
                : undefined
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索页面与内容…"
          />
          <kbd>Esc</kbd>
        </div>

        <div className="workspace-search-caption">
          <span>{query.trim() ? '搜索结果' : '最近访问'}</span>
          <span>{results.length} 项</span>
        </div>

        <div
          ref={resultsRef}
          id="workspace-search-results"
          className="workspace-search-results"
          role="listbox"
          aria-label={query.trim() ? '搜索结果' : '最近访问'}
        >
          {results.map((page, index) => (
            <SearchResultRow
              key={page.id}
              page={page}
              pages={pages}
              active={index === activeIndex}
              optionId={`workspace-search-option-${page.id}`}
              onActivate={() => setActiveIndex(index)}
              onOpen={() => openResult(page)}
            />
          ))}
          {!results.length && (
            <div className="workspace-search-empty">
              <Search size={23} />
              <strong>没有找到相关内容</strong>
              <span>换一个关键词，或检查页面是否已归档。</span>
            </div>
          )}
        </div>

        <footer className="workspace-search-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 导航
          </span>
          <span>
            <kbd>↵</kbd> 打开
          </span>
          <span>
            <FileText size={12} /> 页面
          </span>
          <span>
            <Database size={12} /> 数据库
          </span>
          <span className="workspace-search-index">本机全文索引</span>
        </footer>
      </section>
    </div>
  )
}
