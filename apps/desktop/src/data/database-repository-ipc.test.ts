import { afterEach, describe, expect, it, vi } from 'vitest'
import { databaseRepository } from './database-repository'

afterEach(() => {
  Reflect.deleteProperty(window, 'notetodo')
})

describe('database repository IPC projection', () => {
  it('sends only client-authoritative comment and reminder fields', async () => {
    const createRecordComment = vi.fn(async (_request: Record<string, unknown>) => [])
    const saveRecordReminder = vi.fn(async (_request: Record<string, unknown>) => [])
    Object.defineProperty(window, 'notetodo', {
      configurable: true,
      value: { database: { createRecordComment, saveRecordReminder } },
    })

    await databaseRepository.createRecordComment(
      'record-1',
      'property-1',
      '服务端属性名',
      '  第一行\n第二行  ',
    )
    expect(createRecordComment).toHaveBeenCalledWith({
      id: expect.any(String),
      recordId: 'record-1',
      propertyId: 'property-1',
      authorName: '本机用户',
      body: '第一行\n第二行',
    })
    expect(createRecordComment.mock.calls[0]?.[0]).not.toHaveProperty('propertyName')
    expect(createRecordComment.mock.calls[0]?.[0]).not.toHaveProperty('resolvedAt')
    expect(createRecordComment.mock.calls[0]?.[0]).not.toHaveProperty('createdAt')

    await databaseRepository.saveRecordReminder(
      'record-1',
      'property-date',
      '截止日期',
      '2026-08-10T09:00:00+08:00',
      '  提醒正文  ',
    )
    expect(saveRecordReminder).toHaveBeenCalledWith({
      id: expect.any(String),
      recordId: 'record-1',
      propertyId: 'property-date',
      dueAt: '2026-08-10T01:00:00.000Z',
      note: '提醒正文',
    })
    expect(saveRecordReminder.mock.calls[0]?.[0]).not.toHaveProperty('propertyName')
    expect(saveRecordReminder.mock.calls[0]?.[0]).not.toHaveProperty('completedAt')
    expect(saveRecordReminder.mock.calls[0]?.[0]).not.toHaveProperty('overdue')
  })
})
