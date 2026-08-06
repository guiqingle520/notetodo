import { SyncDocument, UpdateBatcher } from '@notetodo/sync-core'

type SyncBridge = NonNullable<Window['notetodo']>['sync']
type SyncState = 'loading' | 'ready' | 'saving' | 'error'

const HYDRATION_ORIGIN = Symbol('sqlite-hydration')
const EDITOR_ORIGIN = Symbol('editor-input')

function encode(data: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < data.length; offset += 0x8000) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function decode(data: string) {
  const binary = atob(data)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

/**
 * Owns one page's local CRDT lifecycle. SQLite stores merged update batches,
 * while periodic snapshots cap replay time regardless of editing history.
 */
export class PageSyncSession {
  private readonly sync = new SyncDocument()
  private readonly clientId = crypto.randomUUID()
  private readonly listeners = new Set<(content: string) => void>()
  private readonly stateListeners = new Set<(state: SyncState) => void>()
  private latestUpdateId = 0
  private persistedBatches = 0
  private state: SyncState = 'loading'
  private readonly batcher: UpdateBatcher

  private constructor(private readonly pageId: string, private readonly bridge?: SyncBridge) {
    this.batcher = new UpdateBatcher(async (update) => {
      if (!this.bridge) return
      this.setState('saving')
      try {
        this.latestUpdateId = await this.bridge.appendUpdate(this.pageId, this.clientId, encode(update))
        this.persistedBatches += 1
        if (this.persistedBatches >= 50) await this.compact()
        this.setState('ready')
      } catch {
        this.setState('error')
      }
    }, 120)

    this.sync.document.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== HYDRATION_ORIGIN) this.batcher.add(update)
    })
    this.sync.content.observe(() => {
      const content = this.sync.content.toString()
      this.listeners.forEach((listener) => listener(content))
    })
  }

  static async open(pageId: string, initialContent: string, bridge = window.notetodo?.sync) {
    const session = new PageSyncSession(pageId, bridge)
    if (bridge) {
      const stored = await bridge.loadDocument(pageId)
      session.latestUpdateId = stored.latestUpdateId
      if (stored.snapshot) session.sync.apply(decode(stored.snapshot), HYDRATION_ORIGIN)
      stored.updates.forEach((update) => session.sync.apply(decode(update.data), HYDRATION_ORIGIN))
    }
    if (!session.sync.content.length && initialContent) session.setContent(initialContent)
    session.setState('ready')
    return session
  }

  getContent() { return this.sync.content.toString() }

  setContent(next: string) {
    const current = this.sync.content.toString()
    if (current === next) return

    // Restrict the CRDT operation to the changed middle range. Tiptap emits
    // complete HTML, but a prefix/suffix diff prevents rewriting whole pages.
    let prefix = 0
    while (prefix < current.length && prefix < next.length && current[prefix] === next[prefix]) prefix += 1
    let suffix = 0
    while (suffix < current.length - prefix && suffix < next.length - prefix && current[current.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix += 1
    this.sync.document.transact(() => {
      const deleteLength = current.length - prefix - suffix
      if (deleteLength) this.sync.content.delete(prefix, deleteLength)
      const insertion = next.slice(prefix, next.length - suffix)
      if (insertion) this.sync.content.insert(prefix, insertion)
    }, EDITOR_ORIGIN)
  }

  subscribe(listener: (content: string) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeState(listener: (state: SyncState) => void) {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }

  async dispose() {
    await this.batcher.flush()
    if (this.persistedBatches) await this.compact()
    this.sync.destroy()
  }

  private async compact() {
    if (!this.bridge || !this.latestUpdateId) return
    await this.bridge.compactDocument(this.pageId, encode(this.sync.snapshot()), this.latestUpdateId)
    this.persistedBatches = 0
  }

  private setState(state: SyncState) {
    this.state = state
    this.stateListeners.forEach((listener) => listener(state))
  }
}
