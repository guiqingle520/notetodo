import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { CollaborationClient, SyncDocument, UpdateBatcher, type CollaborationSocket } from './index'

describe('sync core', () => {
  it('converges twenty clients after independent offline edits', () => {
    const clients = Array.from({ length: 20 }, () => new SyncDocument())
    clients.forEach((client, index) => client.content.insert(0, `[${index}]`))
    const merged = Y.mergeUpdates(clients.map((client) => client.snapshot()))
    clients.forEach((client) => client.apply(merged))
    const values = new Set(clients.map((client) => client.content.toString()))
    expect(values.size).toBe(1)
    expect([...values][0]).toHaveLength(70)
    clients.forEach((client) => client.destroy())
  })

  it('sends only state missing from a remote client', () => {
    const source = new SyncDocument()
    const remote = new SyncDocument()
    source.content.insert(0, '共同前缀')
    remote.apply(source.snapshot())
    source.content.insert(source.content.length, ' + 新内容')
    remote.apply(source.diff(remote.stateVector()))
    expect(remote.content.toString()).toBe(source.content.toString())
  })

  it('batches rapid updates into one persistence write', async () => {
    vi.useFakeTimers()
    const writes: Uint8Array[] = []
    const batcher = new UpdateBatcher(async (update) => { writes.push(update) }, 100)
    const document = new Y.Doc()
    document.on('update', (update) => batcher.add(update))
    const text = document.getText('content')
    for (let index = 0; index < 100; index += 1) text.insert(text.length, 'x')
    await vi.advanceTimersByTimeAsync(100)
    expect(writes).toHaveLength(1)
    const restored = new Y.Doc()
    Y.applyUpdate(restored, writes[0])
    expect(restored.getText('content').length).toBe(100)
    vi.useRealTimers()
  })

  it('authenticates, flushes offline updates and reconnects with backoff', async () => {
    vi.useFakeTimers()
    const sockets: FakeSocket[] = []
    const states: string[] = []
    const client = new CollaborationClient({
      pageId: 'page-1', clientId: 'client-1', token: 'secret', name: 'Lin', color: '#c45134',
      createSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket },
      onUpdate: vi.fn(), onInitialState: vi.fn(), onState: (state) => states.push(state),
    })
    client.start()
    client.sendUpdate('offline-update')
    sockets[0].open()
    expect(JSON.parse(sockets[0].sent[0]).token).toBe('secret')
    sockets[0].message({ type: 'auth-ok', clientId: 'client-1' })
    expect(sockets[0].sent.some((item) => item.includes('offline-update'))).toBe(true)

    sockets[0].serverClose()
    await vi.advanceTimersByTimeAsync(500)
    expect(sockets).toHaveLength(2)
    expect(states).toContain('offline')
    client.stop()
    vi.useRealTimers()
  })
})

class FakeSocket implements CollaborationSocket {
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sent: string[] = []
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
  open() { this.readyState = 1; this.onopen?.() }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }) }
  serverClose() { this.readyState = 3; this.onclose?.() }
}
