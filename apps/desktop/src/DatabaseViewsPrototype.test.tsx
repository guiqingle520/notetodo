import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseRecord, DatabaseSchema } from '@notetodo/database-core'
import { GalleryView, RecordDetailPanel } from './DatabaseBlock'

const schema: DatabaseSchema = {
  id: 'work-db',
  name: '工作项目',
  properties: [
    { id: 'title', name: '名称', type: 'title' },
    { id: 'status', name: '状态', type: 'select', options: [] },
  ],
}

const record: DatabaseRecord = {
  id: 'record-1',
  values: { title: '桌面端体验', status: 'todo' },
  content: '<p>记录正文</p>',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
}

describe('database prototype views', () => {
  it('uses direct gallery language instead of the legacy editorial theme', () => {
    render(<GalleryView records={[record]} schema={schema} updateCell={vi.fn()} />)

    expect(screen.getByText('画廊')).toBeInTheDocument()
    expect(screen.getByText('1 张卡片')).toBeInTheDocument()
    expect(screen.getByText('桌面端体验')).toBeInTheDocument()
  })

  it('keeps record details page-like and accessible', () => {
    render(
      <RecordDetailPanel
        record={record}
        schema={schema}
        onClose={vi.fn()}
        onUpdateCell={vi.fn()}
        onUpdateContent={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: '记录详情：桌面端体验' })).toBeInTheDocument()
    expect(screen.getByText('数据库记录')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '记录标题' })).toHaveValue('桌面端体验')
  })
})
