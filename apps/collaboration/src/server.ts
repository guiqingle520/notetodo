import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { RoomHub, type RoomPeer } from './room-hub.js'
import { verifyRoomTicket } from '@notetodo/auth-core'

const port = Number(process.env.NOTETODO_COLLAB_PORT ?? 4789)
const sharedToken = process.env.NOTETODO_COLLAB_TOKEN
if (!sharedToken) throw new Error('NOTETODO_COLLAB_TOKEN is required.')

const hub = new RoomHub((token, pageId) => verifyRoomTicket(token, pageId, sharedToken) ?? false)

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ service: 'notetodo-collaboration', status: 'ok' }))
})
const sockets = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 })

sockets.on('connection', (socket) => {
  const peer: RoomPeer = {
    id: crypto.randomUUID(),
    send: (message) => socket.send(JSON.stringify(message)),
    close: (code, reason) => socket.close(code, reason),
  }
  socket.on('message', (data, isBinary) => {
    if (isBinary) return socket.close(1003, 'Text messages only')
    void hub.receive(peer, data.toString())
  })
  socket.on('close', () => hub.disconnect(peer))
})

server.listen(port, '127.0.0.1', () => {
  console.log(`NoteTodo collaboration service listening on ws://127.0.0.1:${port}`)
})
