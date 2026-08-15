import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSnapshot } from '@notetodo/database-core'
import { DatabaseBlock } from './DatabaseBlock'

afterEach(cleanup)

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

  it('switches views through a roving keyboard tab list', () => {
    const multipleViews: DatabaseSnapshot = {
      ...snapshot,
      views: [
        snapshot.views[0]!,
        { id: 'board-view', databaseId: 'prototype-db', name: '看板', type: 'board', config: {} },
        { id: 'list-view', databaseId: 'prototype-db', name: '列表', type: 'list', config: {} },
      ],
    }
    render(<DatabaseBlock pageId="projects" initialSnapshot={multipleViews} />)

    const tableTab = screen.getByRole('tab', { name: '表格' })
    expect(screen.getByRole('tablist', { name: '视图类型' })).toContainElement(tableTab)
    expect(tableTab).toHaveAttribute('aria-selected', 'true')
    expect(tableTab).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(tableTab, { key: 'ArrowRight' })
    const boardTab = screen.getByRole('tab', { name: '看板' })
    expect(boardTab).toHaveFocus()
    expect(boardTab).toHaveAttribute('aria-selected', 'true')
    expect(boardTab).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', boardTab.id)

    fireEvent.keyDown(boardTab, { key: 'End' })
    const listTab = screen.getByRole('tab', { name: '列表' })
    expect(listTab).toHaveFocus()
    fireEvent.keyDown(listTab, { key: 'ArrowRight' })
    expect(tableTab).toHaveFocus()
    expect(tableTab).toHaveAttribute('aria-selected', 'true')
  })

  it('connects anchored dialog triggers to their expanded panels', () => {
    render(<DatabaseBlock pageId="projects" initialSnapshot={snapshot} />)
    const cases = [
      ['新建数据库视图', '新建数据库视图', '关闭新建视图'],
      ['布局', '表格布局', '关闭表格布局'],
      ['快速', '快速筛选', '关闭快速筛选'],
      ['模板', '数据库模板', '关闭数据库模板'],
    ] as const

    for (const [triggerName, dialogName, closeName] of cases) {
      const trigger = screen.getByRole('button', { name: triggerName })
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      trigger.focus()
      fireEvent.click(trigger)

      const dialog = screen.getByRole('dialog', { name: dialogName })
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(trigger).toHaveAttribute('aria-controls', dialog.id)
      fireEvent.click(screen.getByRole('button', { name: closeName }))
      expect(trigger).toHaveFocus()
    }
  })

  it('connects modal tool triggers to their dialogs', async () => {
    render(<DatabaseBlock pageId="projects" initialSnapshot={snapshot} />)
    const cases = [
      [/^属性/u, '数据库属性管理', '关闭属性管理'],
      [/^筛选/u, '视图规则工作台', '关闭视图规则'],
      [/^排序/u, '视图规则工作台', '关闭视图规则'],
      [/^分组/u, '视图规则工作台', '关闭视图规则'],
      [/^导入$/u, '导入 CSV', '关闭 CSV 导入'],
      [/^回收站$/u, '数据库记录回收站', '关闭记录回收站'],
      [/^自动化/u, '数据库自动化', '关闭数据库自动化'],
    ] as const

    for (const [triggerName, dialogName, closeName] of cases) {
      const trigger = screen.getByRole('button', { name: triggerName })
      expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      trigger.focus()
      fireEvent.click(trigger)

      const dialog = await screen.findByRole('dialog', { name: dialogName })
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      expect(trigger).toHaveAttribute('aria-controls', dialog.id)
      fireEvent.click(screen.getByRole('button', { name: closeName }))
      expect(trigger).toHaveFocus()
    }
  })

  it('connects saved rule summaries to the shared rules dialog', async () => {
    const configured: DatabaseSnapshot = {
      ...snapshot,
      views: [
        {
          ...snapshot.views[0]!,
          config: { filters: [{ propertyId: 'date', operator: 'isNotEmpty', value: '' }] },
        },
      ],
    }
    render(<DatabaseBlock pageId="projects" initialSnapshot={configured} />)
    const trigger = screen.getByRole('button', { name: /1 条筛选/u })

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: '视图规则工作台' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', dialog.id)
    fireEvent.click(screen.getByRole('button', { name: '关闭视图规则' }))
    expect(trigger).toHaveFocus()
  })
})
