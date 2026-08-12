import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DatabaseSnapshot } from '@notetodo/database-core'
import { DatabaseBlock } from './DatabaseBlock'

const snapshot: DatabaseSnapshot = {
  schema: {
    id: 'prototype-db',
    name: '产品路线',
    properties: [
      { id: 'title', name: '任务', type: 'title' },
      { id: 'date', name: '日期', type: 'date' },
    ],
  },
  records: [
    {
      id: 'task-1',
      values: { title: '完善桌面端', date: '2026-08-12' },
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    },
  ],
  views: [
    {
      id: 'table-view',
      databaseId: 'prototype-db',
      name: '表格',
      type: 'table',
      config: {},
    },
  ],
  activeViewId: 'table-view',
  templates: [],
}

describe('database prototype chrome', () => {
  it('places the title before labelled view and tool navigation', () => {
    render(<DatabaseBlock pageId="projects" initialSnapshot={snapshot} />)

    const title = screen.getByText('产品路线')
    const views = screen.getByRole('navigation', { name: '数据库视图' })
    expect(title.compareDocumentPosition(views) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: '数据库工具' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument()
  })
})
