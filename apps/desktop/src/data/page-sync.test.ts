// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { PageSyncSession } from './page-sync'
import * as Y from 'yjs'

describe('PageSyncSession', () => {
  it('hydrates updates, persists a minimal edit batch and compacts on close', async () => {
    const bridge = {
      loadDocument: vi.fn(async () => ({ snapshot: null, updates: [], latestUpdateId: 0 })),
      appendUpdate: vi.fn(async () => 7),
      compactDocument: vi.fn(async () => undefined),
    }
    const session = await PageSyncSession.open('page-1', '<p>初始</p>', bridge)
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('初始内容')])
    session.fragment.insert(0, [paragraph])
    await session.dispose()

    expect(bridge.appendUpdate).toHaveBeenCalledTimes(1)
    expect(bridge.compactDocument).toHaveBeenCalledWith('page-1', expect.any(String), 7)
  })
})
