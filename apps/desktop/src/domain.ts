export type PageIcon = 'spark' | 'note' | 'check' | 'grid' | 'book'

export interface WorkspacePage {
  id: string
  title: string
  description?: string
  cover?: string
  icon: PageIcon
  parentId: string | null
  favorite?: boolean
  updatedAt: string
  lastVisitedAt: string
  archivedAt: string | null
  content: string
}

export interface WorkspaceSnapshot {
  pages: WorkspacePage[]
  activePageId: string
}

export function pageBreadcrumbs(pages: WorkspacePage[], pageId: string): WorkspacePage[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const path: WorkspacePage[] = []
  const visited = new Set<string>()
  let current = byId.get(pageId)

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path
}

export function createUntitledPage(parentId: string | null): WorkspacePage {
  return {
    id: crypto.randomUUID(),
    title: '无标题',
    description: '',
    cover: '',
    icon: 'note',
    parentId,
    updatedAt: new Date().toISOString(),
    lastVisitedAt: new Date().toISOString(),
    archivedAt: null,
    content: '<p></p>',
  }
}
