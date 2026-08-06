import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { RoomHub, type RoomPeer, type ServerMessage } from './room-hub.js'

function peer(id: string) {
  const messages: ServerMessage[] = []
  const closes: Array<[number, string]> = []
  return { messages, closes, connection: { id, send: (message) => messages.push(message), close: (code, reason) => closes.push([code, reason]) } satisfies RoomPeer }
}

const auth = (clientId: string, token = 'valid') => JSON.stringify({ type: 'auth', token, pageId: 'page-1', clientId, name: clientId, color: '#c45134' })

describe('RoomHub', () => {
  it('rejects unauthenticated and invalid-token clients before joining a room', async () => {
    const hub = new RoomHub((token) => token === 'valid')
    const first = peer('first')
    await hub.receive(first.connection, JSON.stringify({ type: 'presence' }))
    expect(first.closes[0]?.[0]).toBe(1008)

    const second = peer('second')
    await hub.receive(second.connection, auth('client-b', 'wrong'))
    expect(second.closes[0]).toEqual([1008, 'Unauthorized'])
  })

  it('broadcasts CRDT updates and removes presence on disconnect', async () => {
    const hub = new RoomHub(() => true)
    const first = peer('first')
    const second = peer('second')
    await hub.receive(first.connection, auth('client-a'))
    await hub.receive(second.connection, auth('client-b'))

    const document = new Y.Doc()
    document.getText('content').insert(0, '协作内容')
    const update = Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64')
    await hub.receive(first.connection, JSON.stringify({ type: 'sync-update', update }))
    expect(second.messages).toContainEqual({ type: 'sync-update', clientId: 'client-a', update })

    hub.disconnect(first.connection)
    expect(second.messages).toContainEqual({ type: 'presence-left', clientId: 'client-a' })
  })
})
