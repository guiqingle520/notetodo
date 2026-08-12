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

  it('provides real list actions and pressed filter states', () => {
    render(<WorkspacePageList onOpenPage={vi.fn()} onCreatePage={vi.fn()} />)

    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '页面列表操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '按最近编辑筛选' }))

    expect(screen.getByRole('button', { name: '最近编辑' })).toHaveAttribute('aria-pressed', 'true')
  })
})
