import * as Y from 'yjs'

export interface RoomPeer {
  id: string
  send(message: ServerMessage): void
  close(code: number, reason: string): void
}

export type ServerMessage =
  | { type: 'auth-ok'; clientId: string }
  | { type: 'sync-state'; update: string }
  | { type: 'sync-update'; clientId: string; update: string }
  | { type: 'presence'; clientId: string; name: string; color: string; cursor?: { anchor: number; head: number } }
  | { type: 'presence-left'; clientId: string }
  | { type: 'error'; code: string; message: string }

type ClientMessage =
  | { type: 'auth'; token: string; pageId: string; clientId: string; name: string; color: string }
  | { type: 'sync-update'; update: string }
  | { type: 'presence'; cursor?: { anchor: number; head: number } }

interface Session {
  peer: RoomPeer
  pageId: string
  clientId: string
  name: string
  color: string
  cursor?: { anchor: number; head: number }
}

interface Room {
  document: Y.Doc
  sessions: Set<Session>
}

interface VerifiedIdentity { userId: string; name: string; color: string }

const MAX_MESSAGE_BYTES = 2 * 1024 * 1024
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/u
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/u

/**
 * Protocol core kept independent from WebSocket so authentication, fan-out and
 * disconnect cleanup can be tested without ports or timing-sensitive sockets.
 */
export class RoomHub {
  private readonly rooms = new Map<string, Room>()
  private readonly sessions = new Map<RoomPeer, Session>()

  constructor(private readonly verifyToken: (token: string, pageId: string) => boolean | VerifiedIdentity | Promise<boolean | VerifiedIdentity>) {}

  async receive(peer: RoomPeer, raw: string) {
    if (Buffer.byteLength(raw, 'utf8') > MAX_MESSAGE_BYTES) return peer.close(1009, 'Message too large')
    let message: ClientMessage
    try {
      message = JSON.parse(raw) as ClientMessage
    } catch {
      return peer.close(1003, 'Invalid JSON')
    }

    const session = this.sessions.get(peer)
    if (!session) return this.authenticate(peer, message)
    if (message.type === 'sync-update') return this.applyUpdate(session, message.update)
    if (message.type === 'presence') return this.broadcastPresence(session, message.cursor)
    peer.send({ type: 'error', code: 'INVALID_MESSAGE', message: 'Unsupported collaboration message.' })
  }

  disconnect(peer: RoomPeer) {
    const session = this.sessions.get(peer)
    if (!session) return
    const room = this.rooms.get(session.pageId)
    room?.sessions.delete(session)
    this.sessions.delete(peer)
    this.broadcast(room, { type: 'presence-left', clientId: session.clientId }, session)
    if (room && room.sessions.size === 0) {
      room.document.destroy()
      this.rooms.delete(session.pageId)
    }
  }

  private async authenticate(peer: RoomPeer, message: ClientMessage) {
    if (message.type !== 'auth') return peer.close(1008, 'Authenticate first')
    if (!ID_PATTERN.test(message.pageId) || !ID_PATTERN.test(message.clientId) || message.name.length > 80 || !COLOR_PATTERN.test(message.color)) {
      return peer.close(1008, 'Invalid identity')
    }
    const verified = await this.verifyToken(message.token, message.pageId)
    if (!verified) return peer.close(1008, 'Unauthorized')

    const room = this.rooms.get(message.pageId) ?? { document: new Y.Doc(), sessions: new Set<Session>() }
    this.rooms.set(message.pageId, room)
    // Signed identity wins over renderer-provided presentation fields. The
    // latter remain useful for tests and trusted local development only.
    const session = {
      peer,
      pageId: message.pageId,
      clientId: typeof verified === 'object' ? verified.userId : message.clientId,
      name: typeof verified === 'object' ? verified.name : message.name,
      color: typeof verified === 'object' ? verified.color : message.color,
    }
    room.sessions.add(session)
    this.sessions.set(peer, session)
    peer.send({ type: 'auth-ok', clientId: session.clientId })
    peer.send({ type: 'sync-state', update: Buffer.from(Y.encodeStateAsUpdate(room.document)).toString('base64') })
    room.sessions.forEach((existing) => {
      if (existing !== session) peer.send({ type: 'presence', clientId: existing.clientId, name: existing.name, color: existing.color, ...(existing.cursor ? { cursor: existing.cursor } : {}) })
    })
    this.broadcastPresence(session)
  }

  private applyUpdate(session: Session, encoded: string) {
    const room = this.rooms.get(session.pageId)
    if (!room || typeof encoded !== 'string') return
    try {
      const update = Buffer.from(encoded, 'base64')
      if (update.byteLength > MAX_MESSAGE_BYTES) return session.peer.close(1009, 'Update too large')
      Y.applyUpdate(room.document, update, session.clientId)
      this.broadcast(room, { type: 'sync-update', clientId: session.clientId, update: encoded }, session)
    } catch {
      session.peer.send({ type: 'error', code: 'INVALID_UPDATE', message: 'The CRDT update could not be applied.' })
    }
  }

  private broadcastPresence(session: Session, cursor?: { anchor: number; head: number }) {
    const room = this.rooms.get(session.pageId)
    if (cursor && (!Number.isSafeInteger(cursor.anchor) || !Number.isSafeInteger(cursor.head))) return
    session.cursor = cursor
    this.broadcast(room, { type: 'presence', clientId: session.clientId, name: session.name, color: session.color, ...(cursor ? { cursor } : {}) })
  }

  private broadcast(room: Room | undefined, message: ServerMessage, exclude?: Session) {
    room?.sessions.forEach((session) => {
      if (session !== exclude) session.peer.send(message)
    })
  }
}
