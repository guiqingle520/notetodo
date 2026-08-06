import { describe, expect, it, vi } from 'vitest'
import { createUntitledPage, pageBreadcrumbs, type WorkspacePage } from './domain'

const pages: WorkspacePage[] = [
  { id: 'root', title: 'Root', icon: 'note', parentId: null, updatedAt: '', lastVisitedAt: '', archivedAt: null, content: '' },
  { id: 'child', title: 'Child', icon: 'note', parentId: 'root', updatedAt: '', lastVisitedAt: '', archivedAt: null, content: '' },
  { id: 'leaf', title: 'Leaf', icon: 'note', parentId: 'child', updatedAt: '', lastVisitedAt: '', archivedAt: null, content: '' },
]

describe('pageBreadcrumbs', () => {
  it('returns a root-to-leaf path', () => {
    expect(pageBreadcrumbs(pages, 'leaf').map((page) => page.id)).toEqual(['root', 'child', 'leaf'])
  })

  it('stops safely when a cycle exists', () => {
    const cyclic = pages.map((page) => page.id === 'root' ? { ...page, parentId: 'leaf' } : page)
    expect(pageBreadcrumbs(cyclic, 'leaf')).toHaveLength(3)
  })
})

describe('createUntitledPage', () => {
  it('creates an editable page under the requested parent', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'new-id' })
    const page = createUntitledPage('root')
    expect(page).toMatchObject({ id: 'new-id', parentId: 'root', title: '无标题' })
    expect(page.content).toContain('<p>')
    vi.unstubAllGlobals()
  })
})
