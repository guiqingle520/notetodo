// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { PageSyncSession } from './page-sync'

describe('PageSyncSession', () => {
  it('hydrates updates, persists a minimal edit batch and compacts on close', async () => {
    const bridge = {
      loadDocument: vi.fn(async () => ({ snapshot: null, updates: [], latestUpdateId: 0 })),
      appendUpdate: vi.fn(async () => 7),
      compactDocument: vi.fn(async () => undefined),
    }
    const session = await PageSyncSession.open('page-1', '<p>初始</p>', bridge)
    session.setContent('<p>初始内容</p>')
    await session.dispose()

    expect(bridge.appendUpdate).toHaveBeenCalledTimes(1)
    expect(bridge.compactDocument).toHaveBeenCalledWith('page-1', expect.any(String), 7)
  })
})
