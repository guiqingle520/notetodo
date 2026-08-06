import { CollaborationClient, SyncDocument, UpdateBatcher, type CollaborationSocket, type CollaborationState, type PresenceState } from '@notetodo/sync-core'

type SyncBridge = NonNullable<Window['notetodo']>['sync']
type SyncState = 'loading' | 'ready' | 'saving' | 'error'

const HYDRATION_ORIGIN = Symbol('sqlite-hydration')
const NETWORK_ORIGIN = Symbol('collaboration-network')

export interface CollaborationTicket { endpoint: string; token: string; userId: string; name: string; color: string; role: 'viewer' | 'commenter' | 'editor' | 'owner' }

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
  private readonly stateListeners = new Set<(state: SyncState) => void>()
  private latestUpdateId = 0
  private persistedBatches = 0
  private state: SyncState = 'loading'
  private readonly batcher: UpdateBatcher
  private collaboration?: CollaborationClient

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
      if (origin !== HYDRATION_ORIGIN && origin !== NETWORK_ORIGIN) this.collaboration?.sendUpdate(encode(update))
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
    session.setState('ready')
    return session
  }

  /** Native Tiptap Collaboration binds to this document's `body` fragment. */
  get document() { return this.sync.document }

  get fragment() { return this.sync.document.getXmlFragment('body') }

  /**
   * Schema v3 stored HTML in Y.Text. During the v4 transition it remains a
   * read-only migration source until Tiptap writes the first native fragment.
   */
  initialContent(fallback: string) {
    if (this.fragment.length) return undefined
    return this.sync.content.toString() || fallback
  }

  subscribeState(listener: (state: SyncState) => void) {
    this.stateListeners.add(listener)
    listener(this.state)
    return () => this.stateListeners.delete(listener)
  }

  connectCollaboration(
    ticket: CollaborationTicket,
    handlers: {
      refreshTicket?: () => Promise<CollaborationTicket | null>
      onSeedRequired?: () => void
      onState?: (state: CollaborationState) => void
      onPresence?: (presence: PresenceState | { clientId: string; left: true }) => void
    } = {},
  ) {
    this.collaboration?.stop()
    const client = new CollaborationClient({
      pageId: this.pageId,
      clientId: ticket.userId,
      token: ticket.token,
      refreshToken: handlers.refreshTicket ? async () => {
        const refreshed = await handlers.refreshTicket?.()
        if (!refreshed) throw new Error('Collaboration ticket refresh failed.')
        return refreshed.token
      } : undefined,
      name: ticket.name,
      color: ticket.color,
      createSocket: () => new WebSocket(ticket.endpoint) as unknown as CollaborationSocket,
      onInitialState: (update) => this.sync.apply(decode(update), NETWORK_ORIGIN),
      onUpdate: (update) => this.sync.apply(decode(update), NETWORK_ORIGIN),
      onSeedRequired: handlers.onSeedRequired,
      onPresence: (message) => {
        if (message.type === 'presence-left' && typeof message.clientId === 'string') handlers.onPresence?.({ clientId: message.clientId, left: true })
        else if (message.type === 'presence' && typeof message.clientId === 'string' && typeof message.name === 'string' && typeof message.color === 'string') {
          const cursor = message.cursor && typeof message.cursor === 'object' && Number.isSafeInteger((message.cursor as { anchor?: number }).anchor) && Number.isSafeInteger((message.cursor as { head?: number }).head)
            ? message.cursor as { anchor: number; head: number }
            : undefined
          handlers.onPresence?.({ clientId: message.clientId, pageId: this.pageId, name: message.name, color: message.color, ...(cursor ? { cursor } : {}) })
        }
      },
      onState: (state) => {
        handlers.onState?.(state)
        // A full state update on every authenticated reconnect is idempotent
        // and repairs any network queue discarded by its bounded RAM limit.
        if (state === 'online' && ['editor', 'owner'].includes(ticket.role)) client.sendUpdate(encode(this.sync.snapshot()))
      },
    })
    this.collaboration = client
    client.start()
    return () => { if (this.collaboration === client) this.collaboration = undefined; client.stop() }
  }

  updatePresence(cursor: { anchor: number; head: number }) {
    this.collaboration?.sendPresence(cursor)
  }

  async dispose() {
    this.collaboration?.stop()
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
