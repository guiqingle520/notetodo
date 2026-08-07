import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render } from '@testing-library/react'
import type { DatabaseRecord, DatabaseSchema } from '@notetodo/database-core'
import { GalleryView, TimelineView } from './DatabaseBlock'

const schema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [
  { id: 'title', name: 'Title', type: 'title' },
  { id: 'start', name: 'Start', type: 'date' },
  { id: 'end', name: 'End', type: 'date' },
] }
const record: DatabaseRecord = { id: 'task-1', values: { title: 'Timeline task', start: '2026-08-03', end: '2026-08-05' }, createdAt: '', updatedAt: '' }

afterEach(() => vi.useRealTimers())

describe('TimelineView', () => {
  it('moves both dates while preserving duration when a bar is dropped', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-07T08:00:00Z'))
    const updateCell = vi.fn()
    const { container } = render(<TimelineView records={[record]} schema={schema} startDatePropertyId="start" endDatePropertyId="end" updateCell={updateCell} />)
    const bar = container.querySelector<HTMLElement>('.timeline-track article')!
    const track = container.querySelector<HTMLElement>('.timeline-track')!
    const values = new Map<string, string>()
    const dataTransfer = { effectAllowed: 'none', setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? '' }
    fireEvent.dragStart(bar, { dataTransfer })
    // Monday 2026-08-03 is index 0; x=73 lands on Wednesday, index 2.
    const drop = createEvent.drop(track, { dataTransfer })
    Object.defineProperty(drop, 'clientX', { value: 73 })
    fireEvent(track, drop)
    expect(updateCell).toHaveBeenNthCalledWith(1, 'task-1', 'start', '2026-08-05')
    expect(updateCell).toHaveBeenNthCalledWith(2, 'task-1', 'end', '2026-08-07')
  })
})

describe('GalleryView', () => {
  it('rejects remote covers and advances the card status', () => {
    const updateCell = vi.fn()
    const gallerySchema: DatabaseSchema = { id: 'gallery', name: 'Gallery', properties: [
      { id: 'title', name: 'Title', type: 'title' },
      { id: 'status', name: 'Status', type: 'select' },
      { id: 'owner', name: 'Owner', type: 'text' },
      { id: 'cover', name: 'Cover', type: 'url' },
    ] }
    const galleryRecord: DatabaseRecord = { id: 'card-1', values: { title: 'Editorial card', status: 'todo', owner: 'Lin', cover: 'https://tracker.example/image.png' }, createdAt: '', updatedAt: '' }
    const { container, getByRole } = render(<GalleryView records={[galleryRecord]} schema={gallerySchema} coverPropertyId="cover" visiblePropertyIds={['owner']} updateCell={updateCell} />)
    expect(container.querySelector('.gallery-generated')).not.toBeNull()
    expect(container.querySelector('.gallery-cover img')).toBeNull()
    fireEvent.click(getByRole('button', { name: /推进/ }))
    expect(updateCell).toHaveBeenCalledWith('card-1', 'status', 'doing')
  })
})
