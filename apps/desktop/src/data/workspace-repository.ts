import seedWorkspace from '../../shared/seed-workspace.json'
import type { WorkspacePage, WorkspaceSnapshot } from '../domain'

export interface WorkspaceRepository {
  load(): Promise<WorkspaceSnapshot>
  upsertPage(page: WorkspacePage): Promise<WorkspacePage>
  setActivePage(id: string): Promise<void>
  archivePage(id: string): Promise<void>
  restorePage(id: string): Promise<void>
  search(query: string): Promise<WorkspacePage[]>
}

/**
 * Browser storage is intentionally only a development adapter. Production
 * Electron builds use the IPC repository below so documents live in SQLite.
 */
class BrowserWorkspaceRepository implements WorkspaceRepository {
  private readonly storageKey = 'notetodo-browser-workspace-v1'

  async load(): Promise<WorkspaceSnapshot> {
    const stored = localStorage.getItem(this.storageKey)
    if (stored) return JSON.parse(stored) as WorkspaceSnapshot
    const snapshot = structuredClone(seedWorkspace) as WorkspaceSnapshot
    this.write(snapshot)
    return snapshot
  }

  async upsertPage(page: WorkspacePage): Promise<WorkspacePage> {
    const snapshot = await this.load()
    const index = snapshot.pages.findIndex((candidate) => candidate.id === page.id)
    if (index >= 0) snapshot.pages[index] = page
    else snapshot.pages.push(page)
    this.write(snapshot)
    return page
  }

  async setActivePage(id: string): Promise<void> {
    const snapshot = await this.load()
    snapshot.activePageId = id
    const page = snapshot.pages.find((candidate) => candidate.id === id)
    if (page) page.lastVisitedAt = new Date().toISOString()
    this.write(snapshot)
  }

  async archivePage(id: string): Promise<void> {
    await this.patchArchive(id, new Date().toISOString())
  }

  async restorePage(id: string): Promise<void> {
    await this.patchArchive(id, null)
  }

  async search(query: string): Promise<WorkspacePage[]> {
    const normalized = query.trim().toLocaleLowerCase()
    const { pages } = await this.load()
    const activePages = pages.filter((page) => !page.archivedAt)
    if (!normalized) {
      return activePages.sort((left, right) => right.lastVisitedAt.localeCompare(left.lastVisitedAt)).slice(0, 30)
    }
    return activePages
      .filter((page) => `${page.title} ${stripHtml(page.content)}`.toLocaleLowerCase().includes(normalized))
      .slice(0, 30)
  }

  private async patchArchive(id: string, archivedAt: string | null) {
    const snapshot = await this.load()
    const page = snapshot.pages.find((candidate) => candidate.id === id)
    if (page) {
      page.archivedAt = archivedAt
      page.updatedAt = new Date().toISOString()
      this.write(snapshot)
    }
  }

  private write(snapshot: WorkspaceSnapshot) {
    localStorage.setItem(this.storageKey, JSON.stringify(snapshot))
  }
}

class ElectronWorkspaceRepository implements WorkspaceRepository {
  private get bridge() {
    if (!window.notetodo?.workspace) throw new Error('Electron workspace bridge is unavailable.')
    return window.notetodo.workspace
  }

  load = () => this.bridge.load()
  upsertPage = (page: WorkspacePage) => this.bridge.upsertPage(page)
  setActivePage = (id: string) => this.bridge.setActivePage(id)
  archivePage = (id: string) => this.bridge.archivePage(id)
  restorePage = (id: string) => this.bridge.restorePage(id)
  search = (query: string) => this.bridge.search(query)
}

function stripHtml(html: string) {
  const element = document.createElement('div')
  element.innerHTML = html
  return element.textContent ?? ''
}

export const workspaceRepository: WorkspaceRepository = window.notetodo?.workspace
  ? new ElectronWorkspaceRepository()
  : new BrowserWorkspaceRepository()

