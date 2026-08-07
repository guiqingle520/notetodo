import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render } from '@testing-library/react'
import type { DatabaseRecord, DatabaseSchema } from '@notetodo/database-core'
import { BoardView, GalleryView, ListView, TimelineView, ViewRulesPanel, VirtualTable } from './DatabaseBlock'

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

describe('ViewRulesPanel', () => {
  it('composes OR filters and returns the saved view configuration', () => {
    const onSave = vi.fn()
    const ruleSchema: DatabaseSchema = { id: 'rules', name: 'Rules', properties: [
      { id: 'title', name: '任务', type: 'title' },
      { id: 'status', name: '状态', type: 'select', options: [{ id: 'todo', name: '待开始', color: 'slate' }, { id: 'doing', name: '进行中', color: 'amber' }] },
      { id: 'score', name: '优先级', type: 'number' },
    ] }
    const { getByRole } = render(<ViewRulesPanel schema={ruleSchema} config={{ filters: [{ propertyId: 'status', operator: 'equals', value: 'todo' }] }} initialTab="filters" onClose={vi.fn()} onSave={onSave} />)
    fireEvent.click(getByRole('button', { name: '任一条件' }))
    fireEvent.click(getByRole('button', { name: /添加条件/ }))
    fireEvent.click(getByRole('button', { name: '保存到当前视图' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ filterMode: 'or', filters: expect.arrayContaining([expect.objectContaining({ propertyId: 'status', value: 'todo' })]) }))
    expect(onSave.mock.calls[0]?.[0].filters).toHaveLength(2)
  })
})

describe('large database DOM budgets', () => {
  const manyRecords = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({
    id: `task-${index}`,
    values: { 'task-title': `Task ${index}`, 'task-status': ['todo', 'doing', 'done'][index % 3]!, 'task-owner': 'Lin', 'task-due': '2026-08-07' },
    createdAt: '', updatedAt: '',
  }))

  it('windows List rows instead of mounting all records', () => {
    const { container } = render(<ListView records={manyRecords} updateCell={vi.fn()} />)
    expect(container.querySelectorAll('.database-list-row').length).toBeLessThanOrEqual(14)
    expect(container.querySelector<HTMLElement>('.database-list-space')?.style.height).toBe('430000px')
  })

  it('windows each Board column independently', () => {
    const { container } = render(<BoardView records={manyRecords} updateCell={vi.fn()} />)
    expect(container.querySelectorAll('.board-column')).toHaveLength(3)
    expect(container.querySelectorAll('.board-column article').length).toBeLessThanOrEqual(18)
    expect(container.querySelectorAll('.board-card-space')).toHaveLength(3)
  })

  it('bounds Table rows and relation options together', () => {
    const { container } = render(<VirtualTable records={manyRecords} allRecords={manyRecords} updateCell={vi.fn()} />)
    expect(container.querySelectorAll('.database-grid-row').length).toBeLessThanOrEqual(14)
    expect(container.querySelectorAll('.relation-cell option').length).toBeLessThanOrEqual(1_430)
  })
})
