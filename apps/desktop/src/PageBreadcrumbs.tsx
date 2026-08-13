import { ChevronRight } from 'lucide-react'
import type { WorkspacePage } from './domain'

/** The page path is navigation chrome, so ancestors remain keyboard-operable. */
export function PageBreadcrumbs({ pages, onNavigate }: { pages: WorkspacePage[]; onNavigate: (pageId: string) => void }) {
  return (
    <nav className="breadcrumbs" aria-label="页面路径">
      {pages.map((page, index) => {
        const label = page.title.trim() || '无标题'
        const current = index === pages.length - 1
        return (
          <span className="breadcrumb-item" key={page.id}>
            {index > 0 && <ChevronRight className="breadcrumb-separator" size={13} aria-hidden="true" />}
            {current ? (
              <span className="breadcrumb-current" aria-current="page" title={label}>{label}</span>
            ) : (
              <button title={label} onClick={() => onNavigate(page.id)}>{label}</button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
