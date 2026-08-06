import { describe, expect, it, vi } from 'vitest'
import { SaveScheduler } from './save-scheduler'

describe('SaveScheduler', () => {
  it('coalesces rapid changes to the same page', async () => {
    vi.useFakeTimers()
    const writer = vi.fn(async () => undefined)
    const scheduler = new SaveScheduler<{ id: string; content: string }>(writer, 100)

    for (let index = 0; index < 100; index += 1) {
      scheduler.schedule({ id: 'page-1', content: `version-${index}` })
    }

    expect(scheduler.pendingCount).toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(writer).toHaveBeenCalledTimes(1)
    expect(writer).toHaveBeenCalledWith({ id: 'page-1', content: 'version-99' })
    vi.useRealTimers()
  })

  it('keeps writes for different pages independent', async () => {
    const values: string[] = []
    const scheduler = new SaveScheduler<{ id: string }>(async (value) => { values.push(value.id) })
    scheduler.schedule({ id: 'alpha' })
    scheduler.schedule({ id: 'beta' })
    await scheduler.flush()
    expect(values.sort()).toEqual(['alpha', 'beta'])
  })
})
