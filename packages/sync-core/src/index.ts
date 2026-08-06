import * as Y from 'yjs'
export * from './collaboration-client.js'

export interface PresenceState {
  clientId: string
  name: string
  color: string
  pageId: string
  cursor?: { anchor: number; head: number }
}

export class SyncDocument {
  readonly document = new Y.Doc()
  readonly content = this.document.getText('content')

  apply(update: Uint8Array, origin: unknown = 'remote') {
    Y.applyUpdate(this.document, update, origin)
  }

  snapshot() {
    return Y.encodeStateAsUpdate(this.document)
  }

  stateVector() {
    return Y.encodeStateVector(this.document)
  }

  diff(remoteStateVector: Uint8Array) {
    return Y.encodeStateAsUpdate(this.document, remoteStateVector)
  }

  destroy() {
    this.document.destroy()
  }
}

/**
 * Coalesces high-frequency CRDT updates before persistence. Y.mergeUpdates
 * preserves causality while removing duplicate structs from the write batch.
 */
export class UpdateBatcher {
  private updates: Uint8Array[] = []
  private bytes = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly writer: (update: Uint8Array) => Promise<void>,
    private readonly delayMs = 100,
    private readonly maxBytes = 256 * 1024,
  ) {}

  add(update: Uint8Array) {
    this.updates.push(update)
    this.bytes += update.byteLength
    if (this.bytes >= this.maxBytes) return void this.flush()
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.delayMs)
  }

  async flush() {
    if (!this.updates.length) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const batch = this.updates
    this.updates = []
    this.bytes = 0
    await this.writer(Y.mergeUpdates(batch))
  }

  get pendingBytes() { return this.bytes }
}

export function mergeUpdates(updates: Uint8Array[]) {
  return updates.length ? Y.mergeUpdates(updates) : new Uint8Array()
}
