import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import * as Y from 'yjs'
import { CollaborationClient, type CollaborationSocket } from '@notetodo/sync-core'
import { RoomHub, type RoomPeer } from './room-hub.js'

const resources: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const dispose of resources.splice(0).reverse()) await dispose() })

async function waitFor(predicate: () => boolean, timeout = 3000) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for collaboration state.')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('WebSocket collaboration resilience', () => {
  it('refreshes tickets and delivers an edit made while sockets are offline', async () => {
    const hub = new RoomHub(() => true)
    const server = createServer()
    const sockets = new WebSocketServer({ server })
    sockets.on('connection', (socket) => {
      const peer: RoomPeer = { id: crypto.randomUUID(), send: (message) => socket.send(JSON.stringify(message)), close: (code, reason) => socket.close(code, reason) }
      socket.on('message', (data) => void hub.receive(peer, data.toString()))
      socket.on('close', () => hub.disconnect(peer))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing test server address.')
    const endpoint = `ws://127.0.0.1:${address.port}`
    resources.push(() => new Promise<void>((resolve) => sockets.close(() => server.close(() => resolve()))))

    const firstDocument = new Y.Doc()
    const secondDocument = new Y.Doc()
    const firstRefresh = vi.fn(async () => 'first-refreshed-ticket')
    const secondRefresh = vi.fn(async () => 'second-refreshed-ticket')
    const remoteOrigin = Symbol('remote')
    const createClient = (clientId: string, document: Y.Doc, refreshToken: () => Promise<string>, seed: boolean) => new CollaborationClient({
      pageId: 'resilience-page', clientId, token: `${clientId}-initial`, refreshToken,
      name: clientId, color: clientId === 'first' ? '#c45134' : '#247a68',
      createSocket: () => new WebSocket(endpoint) as unknown as CollaborationSocket,
      onInitialState: (update) => Y.applyUpdate(document, Buffer.from(update, 'base64'), remoteOrigin),
      onUpdate: (update) => Y.applyUpdate(document, Buffer.from(update, 'base64'), remoteOrigin),
      onSeedRequired: () => { if (seed && !document.getText('content').length) document.getText('content').insert(0, '基础内容') },
      onState: (state) => {
        if (state !== 'online') return
        const client = clientId === 'first' ? firstClient : secondClient
        queueMicrotask(() => client.sendUpdate(Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64')))
      },
    })
    const firstClient = createClient('first', firstDocument, firstRefresh, true)
    const secondClient = createClient('second', secondDocument, secondRefresh, false)
    firstDocument.on('update', (update, origin) => { if (origin !== remoteOrigin) firstClient.sendUpdate(Buffer.from(update).toString('base64')) })
    secondDocument.on('update', (update, origin) => { if (origin !== remoteOrigin) secondClient.sendUpdate(Buffer.from(update).toString('base64')) })
    firstClient.start(); secondClient.start()
    resources.push(() => { firstClient.stop(); secondClient.stop(); firstDocument.destroy(); secondDocument.destroy() })
    await waitFor(() => secondDocument.getText('content').toString() === '基础内容')

    sockets.clients.forEach((socket) => socket.terminate())
    firstDocument.getText('content').insert(firstDocument.getText('content').length, ' · 离线编辑')
    await waitFor(() => secondDocument.getText('content').toString().includes('离线编辑'))
    expect(firstRefresh).toHaveBeenCalled()
    expect(secondRefresh).toHaveBeenCalled()
    expect(secondDocument.getText('content').toString()).toBe(firstDocument.getText('content').toString())
  })
})
