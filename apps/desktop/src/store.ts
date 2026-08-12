import { create } from 'zustand'
import seedWorkspace from '../shared/seed-workspace.json'
import { createUntitledPage, type WorkspacePage, type WorkspaceSnapshot } from './domain'
import { SaveScheduler } from './data/save-scheduler'
import { workspaceRepository } from './data/workspace-repository'
import { createPageFromTemplate, type PageTemplate } from './data/page-templates'

interface WorkspaceActions {
  hydrated: boolean
  searchResults: WorkspacePage[]
  hydrate: () => Promise<void>
  setActivePage: (id: string) => void
  addPage: (parentId?: string | null, templateId?: PageTemplate['id']) => void
  updatePage: (
    id: string,
    patch: Partial<Pick<WorkspacePage, 'title' | 'description' | 'content' | 'favorite' | 'icon'>>,
  ) => void
  toggleFavorite: (id: string) => void
  archivePage: (id: string) => void
  restorePage: (id: string) => void
  search: (query: string) => Promise<void>
}

// The scheduler is outside React state: pending writes do not trigger renders.
const saveScheduler = new SaveScheduler<WorkspacePage>((page) =>
  workspaceRepository.upsertPage(page),
)

export const useWorkspace = create<WorkspaceSnapshot & WorkspaceActions>((set, get) => ({
  ...(structuredClone(seedWorkspace) as WorkspaceSnapshot),
  hydrated: false,
  searchResults: [],

  hydrate: async () => {
    const snapshot = await workspaceRepository.load()
    set({ ...snapshot, hydrated: true })
  },

  setActivePage: (activePageId) => {
    const now = new Date().toISOString()
    set({
      activePageId,
      pages: get().pages.map((page) =>
        page.id === activePageId ? { ...page, lastVisitedAt: now } : page,
      ),
    })
    void workspaceRepository.setActivePage(activePageId)
  },

  addPage: (parentId = null, templateId = 'blank') => {
    const page =
      templateId === 'blank'
        ? createUntitledPage(parentId)
        : createPageFromTemplate(parentId, templateId)
    set({ pages: [...get().pages, page], activePageId: page.id })
    void workspaceRepository.upsertPage(page)
    void workspaceRepository.setActivePage(page.id)
  },

  updatePage: (id, patch) => {
    const pages = get().pages.map((page) =>
      page.id === id ? { ...page, ...patch, updatedAt: new Date().toISOString() } : page,
    )
    set({ pages })
    const changedPage = pages.find((page) => page.id === id)
    if (changedPage) saveScheduler.schedule(changedPage)
  },

  toggleFavorite: (id) => {
    const page = get().pages.find((candidate) => candidate.id === id)
    if (page) get().updatePage(id, { favorite: !page.favorite })
  },

  archivePage: (id) => {
    const now = new Date().toISOString()
    const pages = get().pages.map((page) =>
      page.id === id ? { ...page, archivedAt: now, updatedAt: now } : page,
    )
    const nextPage = pages.find((page) => !page.archivedAt)
    set({ pages, activePageId: nextPage?.id ?? '' })
    void workspaceRepository.archivePage(id)
    if (nextPage) void workspaceRepository.setActivePage(nextPage.id)
  },

  restorePage: (id) => {
    const now = new Date().toISOString()
    set({
      pages: get().pages.map((page) =>
        page.id === id ? { ...page, archivedAt: null, updatedAt: now } : page,
      ),
    })
    void workspaceRepository.restorePage(id)
  },

  search: async (query) => set({ searchResults: await workspaceRepository.search(query) }),
}))

export { saveScheduler }
