import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seedWorkspace from '../shared/seed-workspace.json'
import type { WorkspaceSnapshot } from './domain'
import { useWorkspace } from './store'
import { WorkspaceSearchPalette } from './WorkspaceSearchPalette'

beforeEach(() => {
  useWorkspace.setState({
    ...(structuredClone(seedWorkspace) as WorkspaceSnapshot),
    hydrated: true,
    searchResults: [],
  })
})

afterEach(cleanup)

describe('WorkspaceSearchPalette', () => {
  it('shows recently visited pages before a query is entered', () => {
    render(<WorkspaceSearchPalette onClose={vi.fn()} onOpenPage={vi.fn()} />)

    expect(screen.getByText('最近访问')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开搜索结果：从这里开始' })).toBeInTheDocument()
  })

  it('opens the active result with keyboard navigation', () => {
    const onClose = vi.fn()
    const onOpenPage = vi.fn()
    render(<WorkspaceSearchPalette onClose={onClose} onOpenPage={onOpenPage} />)
    const input = screen.getByRole('textbox', { name: '搜索页面与内容' })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onOpenPage).toHaveBeenCalledWith('projects')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens a clicked result through the application navigation callback', () => {
    const onOpenPage = vi.fn()
    render(<WorkspaceSearchPalette onClose={vi.fn()} onOpenPage={onOpenPage} />)

    fireEvent.click(screen.getByRole('button', { name: '打开搜索结果：知识库' }))
    expect(onOpenPage).toHaveBeenCalledWith('knowledge')
  })
})
