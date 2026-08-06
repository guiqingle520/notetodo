export type CollaborationState = 'idle' | 'connecting' | 'authenticating' | 'online' | 'offline'

export interface CollaborationSocket {
  readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  send(data: string): void
  close(): void
}

export interface CollaborationClientOptions {
  pageId: string
  clientId: string
  token: string
  refreshToken?: () => Promise<string>
  name: string
  color: string
  createSocket: () => CollaborationSocket
  onUpdate: (update: string) => void
  onInitialState: (update: string) => void
  onSeedRequired?: () => void
  onPresence?: (message: Record<string, unknown>) => void
  onState?: (state: CollaborationState) => void
}

/**
 * Resilient room transport. Local SQLite remains the durable source of truth;
 * this queue only bridges the interval between socket loss and re-authentication.
 */
export class CollaborationClient {
  private socket?: CollaborationSocket
  private retryTimer?: ReturnType<typeof setTimeout>
  private retryAttempt = 0
  private running = false
  private state: CollaborationState = 'idle'
  private readonly pending: string[] = []
  private pendingBytes = 0

  constructor(private readonly options: CollaborationClientOptions) {}

  start() {
    if (this.running) return
    this.running = true
    this.connect()
  }

  stop() {
    this.running = false
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.socket?.close()
    this.setState('idle')
  }

  sendUpdate(update: string) {
    const message = JSON.stringify({ type: 'sync-update', update })
    if (this.state === 'online' && this.socket?.readyState === 1) return this.socket.send(message)
    this.pending.push(message)
    this.pendingBytes += message.length
    // The CRDT is still safely stored in SQLite. Refuse unbounded RAM growth;
    // the caller can reconnect with a full state vector after this soft limit.
    if (this.pendingBytes > 16 * 1024 * 1024) {
      this.pending.length = 0
      this.pendingBytes = 0
    }
  }

  sendPresence(cursor?: { anchor: number; head: number }) {
    if (this.state === 'online' && this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify({ type: 'presence', ...(cursor ? { cursor } : {}) }))
    }
  }

  private connect() {
    if (!this.running) return
    this.setState('connecting')
    const socket = this.options.createSocket()
    this.socket = socket
    socket.onopen = async () => {
      this.setState('authenticating')
      let token = this.options.token
      try {
        if (this.retryAttempt > 0 && this.options.refreshToken) token = await this.options.refreshToken()
      } catch {
        if (socket === this.socket) socket.close()
        return
      }
      if (!this.running || socket !== this.socket || socket.readyState !== 1) return
      socket.send(JSON.stringify({
        type: 'auth', token, pageId: this.options.pageId,
        clientId: this.options.clientId, name: this.options.name, color: this.options.color,
      }))
    }
    socket.onmessage = (event) => this.receive(event.data)
    socket.onerror = () => socket.close()
    socket.onclose = () => {
      if (!this.running || socket !== this.socket) return
      this.setState('offline')
      const delay = Math.min(15_000, 500 * 2 ** this.retryAttempt++)
      this.retryTimer = setTimeout(() => this.connect(), delay)
    }
  }

  private receive(raw: string) {
    let message: Record<string, unknown>
    try { message = JSON.parse(raw) as Record<string, unknown> } catch { return }
    if (message.type === 'auth-ok') {
      this.retryAttempt = 0
      this.setState('online')
      this.pending.splice(0).forEach((item) => this.socket?.send(item))
      this.pendingBytes = 0
    } else if (message.type === 'sync-state' && typeof message.update === 'string') {
      this.options.onInitialState(message.update)
    } else if (message.type === 'sync-update' && typeof message.update === 'string') {
      this.options.onUpdate(message.update)
    } else if (message.type === 'seed-required') {
      this.options.onSeedRequired?.()
    } else if (message.type === 'presence' || message.type === 'presence-left') {
      this.options.onPresence?.(message)
    }
  }

  private setState(state: CollaborationState) {
    this.state = state
    this.options.onState?.(state)
  }
}
