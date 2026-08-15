import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seedWorkspace from '../shared/seed-workspace.json'
import type { WorkspaceSnapshot } from './domain'
import { useWorkspace } from './store'
import { WorkspacePageList } from './WorkspacePageList'

beforeEach(() => {
  useWorkspace.setState({
    ...(structuredClone(seedWorkspace) as WorkspaceSnapshot),
    hydrated: true,
    searchResults: [],
  })
})

afterEach(cleanup)

describe('WorkspacePageList', () => {
  it('groups all visible pages using the prototype table structure', () => {
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '所有页面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /工作区/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /收藏/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /子页面/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开页面：产品路线' })).toBeInTheDocument()
  })

  it('searches pages and opens the matching result', () => {
    const onOpenPage = vi.fn()
    render(<WorkspacePageList onOpenPage={onOpenPage} onCreatePage={vi.fn()} />)

    fireEvent.change(screen.getByRole('textbox', { name: '搜索所有页面' }), {
      target: { value: '知识' },
    })
    expect(screen.queryByRole('button', { name: '打开页面：产品路线' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开页面：知识库' }))
    expect(onOpenPage).toHaveBeenCalledWith('knowledge')
  })

  it('creates a blank page from the primary action', () => {
    const onCreatePage = vi.fn()
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={onCreatePage} />)

    fireEvent.click(screen.getByRole('button', { name: '新建页面' }))
    expect(onCreatePage).toHaveBeenCalledOnce()
  })

  it('provides real list actions and selected filter states', () => {
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)

    expect(screen.getByRole('tab', { name: '全部' })).toHaveAttribute('aria-selected', 'true')
    const menuTrigger = screen.getByRole('button', { name: '页面列表操作' })
    fireEvent.click(menuTrigger)
    expect(screen.getByRole('menu', { name: '页面列表操作' })).toHaveAttribute(
      'id',
      menuTrigger.getAttribute('aria-controls'),
    )
    fireEvent.click(screen.getByRole('menuitem', { name: '按最近编辑筛选' }))

    expect(screen.getByRole('tab', { name: '最近编辑' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches filter tabs with standard keyboard navigation', () => {
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)
    const all = screen.getByRole('tab', { name: '全部' })
    const mine = screen.getByRole('tab', { name: '我创建的' })
    const recent = screen.getByRole('tab', { name: '最近编辑' })

    expect(all).toHaveAttribute('tabindex', '0')
    expect(mine).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(all, { key: 'ArrowRight' })
    expect(mine).toHaveFocus()
    expect(mine).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(mine, { key: 'End' })
    expect(recent).toHaveFocus()

    const results = screen.getByRole('tabpanel')
    expect(results).toHaveAttribute('id', recent.getAttribute('aria-controls'))
    expect(results).toHaveAttribute('aria-labelledby', recent.id)
  })

  it('connects each collapsible group heading to its rows', () => {
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)
    const workspace = screen.getByRole('button', { name: /工作区/u })
    const rowsId = workspace.getAttribute('aria-controls')

    expect(rowsId).toBeTruthy()
    expect(document.getElementById(rowsId!)).toHaveAttribute('aria-labelledby', workspace.id)
    fireEvent.click(workspace)
    expect(workspace).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(rowsId!)).not.toBeInTheDocument()
  })

  it('closes the action menu outside and renders one search empty state', () => {
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '页面列表操作' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索所有页面' }), {
      target: { value: '不存在的页面' },
    })
    expect(screen.getByRole('status')).toHaveTextContent('没有匹配的页面')
    expect(screen.queryAllByText('此分类中没有页面。')).toHaveLength(0)
  })

  it('opens and navigates the action menu from the keyboard', () => {
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '页面列表操作' })

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0]!, { key: 'End' })
    expect(items.at(-1)).toHaveFocus()
    fireEvent.keyDown(items.at(-1)!, { key: 'Escape' })

    expect(screen.queryByRole('menu', { name: '页面列表操作' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
