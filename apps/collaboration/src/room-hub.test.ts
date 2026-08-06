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

  it('converges a twenty-client edit burst into the room snapshot', async () => {
    const hub = new RoomHub(() => true)
    const clients = Array.from({ length: 20 }, (_, index) => peer(`peer-${index}`))
    for (let index = 0; index < clients.length; index += 1) {
      const client = clients[index]!
      await hub.receive(client.connection, auth(`client-${index}`))
      const document = new Y.Doc()
      document.getText('content').insert(0, `[${index}]`)
      const update = Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64')
      await hub.receive(client.connection, JSON.stringify({ type: 'sync-update', update }))
      document.destroy()
    }

    const observer = peer('observer')
    await hub.receive(observer.connection, auth('observer'))
    const state = observer.messages.find((message) => message.type === 'sync-state')
    const restored = new Y.Doc()
    if (state?.type === 'sync-state') Y.applyUpdate(restored, Buffer.from(state.update, 'base64'))
    const content = restored.getText('content').toString()
    for (let index = 0; index < 20; index += 1) expect(content).toContain(`[${index}]`)
    restored.destroy()
  })

  it('assigns only one legacy-content seeder for an empty room', async () => {
    const hub = new RoomHub(() => true)
    const first = peer('first-seeder')
    const second = peer('second-waits')
    await hub.receive(first.connection, auth('client-a'))
    await hub.receive(second.connection, auth('client-b'))
    expect(first.messages.filter((message) => message.type === 'seed-required')).toHaveLength(1)
    expect(second.messages.filter((message) => message.type === 'seed-required')).toHaveLength(0)

    const seeded = new Y.Doc()
    seeded.getXmlFragment('body').insert(0, [new Y.XmlElement('paragraph')])
    const update = Buffer.from(Y.encodeStateAsUpdate(seeded)).toString('base64')
    await hub.receive(first.connection, JSON.stringify({ type: 'sync-update', update }))
    expect(second.messages).toContainEqual({ type: 'sync-update', clientId: 'client-a', update })
    seeded.destroy()
  })

  it('enforces signed read-only roles at the room boundary', async () => {
    const hub = new RoomHub(() => ({ userId: 'viewer', name: '只读成员', color: '#247a68', role: 'viewer' }))
    const viewer = peer('viewer')
    await hub.receive(viewer.connection, auth('spoofed-editor'))
    const document = new Y.Doc()
    document.getText('content').insert(0, '不允许写入')
    await hub.receive(viewer.connection, JSON.stringify({ type: 'sync-update', update: Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64') }))
    expect(viewer.messages).toContainEqual({ type: 'error', code: 'READ_ONLY', message: 'This page is read-only for the current member.' })
    document.destroy()
  })
})
