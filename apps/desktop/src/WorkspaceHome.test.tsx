import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seedWorkspace from '../shared/seed-workspace.json'
import type { WorkspaceSnapshot } from './domain'
import { useWorkspace } from './store'
import { WorkspaceHome } from './WorkspaceHome'

beforeEach(() => {
  useWorkspace.setState({
    ...(structuredClone(seedWorkspace) as WorkspaceSnapshot),
    hydrated: true,
    searchResults: [],
  })
})

afterEach(cleanup)

describe('WorkspaceHome', () => {
  it('renders the prototype dashboard from workspace data', () => {
    render(<WorkspaceHome onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '早上好，Ming' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最近访问' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日待办' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '快捷入口' })).toBeInTheDocument()
    expect(screen.getAllByText('从这里开始').length).toBeGreaterThan(0)
  })

  it('opens recent pages and creates pages from shortcuts', () => {
    const onOpenPage = vi.fn()
    const onCreatePage = vi.fn()
    render(<WorkspaceHome onOpenPage={onOpenPage} onCreatePage={onCreatePage} />)

    fireEvent.click(screen.getByRole('button', { name: '打开页面：本周计划' }))
    expect(onOpenPage).toHaveBeenCalledWith('weekly')

    fireEvent.click(screen.getByRole('button', { name: '从模板创建：会议纪要' }))
    expect(onCreatePage).toHaveBeenCalledWith('meeting')
  })

  it('updates a task without leaving the home page', () => {
    render(<WorkspaceHome onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)
    const task = screen.getByRole('button', { name: '切换待办：审核发布前的最终素材' })

    expect(task).not.toHaveClass('is-done')
    fireEvent.click(task)
    expect(task).toHaveClass('is-done')
  })

  it('shows a formal empty state when the workspace has no pages', () => {
    useWorkspace.setState({ pages: [] })
    render(<WorkspaceHome onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('还没有最近页面')
    expect(screen.getByText('收藏页面后会显示在这里。')).toBeInTheDocument()
  })
})
