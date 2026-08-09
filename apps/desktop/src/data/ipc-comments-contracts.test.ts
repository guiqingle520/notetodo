// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { commentsIpcContracts } = require('../../electron/ipc-comments-contracts.cjs') as {
  commentsIpcContracts: Record<
    'list' | 'create' | 'resolve' | 'listNotifications' | 'markNotificationRead',
    IpcContract
  >
}

const createdAt = '2026-08-09T12:00:00.000Z'

describe('comments and notifications IPC contracts', () => {
  it('accepts a bounded anchored comment with unique-shaped mentions', () => {
    expect(() =>
      commentsIpcContracts.create.assertRequest([
        'page-1',
        '请确认这里',
        { from: 2, to: 6, quote: '关键内容' },
        ['member-1'],
      ]),
    ).not.toThrow()
  })

  it('rejects malformed anchors and oversized mention lists', () => {
    expect(() =>
      commentsIpcContracts.create.assertRequest([
        'page-1',
        '请确认这里',
        { from: 6, to: 2, quote: '关键内容' },
        [],
      ]),
    ).toThrow(/anchor/)
    expect(() =>
      commentsIpcContracts.create.assertRequest([
        'page-1',
        '请确认这里',
        null,
        Array.from({ length: 21 }, (_, index) => `member-${index}`),
      ]),
    ).toThrow(/mentions/)
  })

  it('validates the persisted mentions field in comment responses', () => {
    expect(() =>
      commentsIpcContracts.list.assertResponse([
        {
          id: 'comment-1',
          authorName: '本机用户',
          body: '请确认这里',
          anchor: null,
          mentions: ['member-1'],
          resolvedAt: null,
          createdAt,
        },
      ]),
    ).not.toThrow()
  })

  it('rejects notification over-posting and non-void mutation results', () => {
    expect(() =>
      commentsIpcContracts.listNotifications.assertResponse([
        {
          id: 'notification-1',
          type: 'mention',
          readAt: null,
          createdAt,
          pageId: 'page-1',
          pageTitle: '本周计划',
          authorName: '本机用户',
          body: '请确认这里',
          secret: 'unexpected',
        },
      ]),
    ).toThrow(/response fields/)
    expect(() => commentsIpcContracts.resolve.assertResponse(true)).toThrow(/unexpected data/)
  })
})
