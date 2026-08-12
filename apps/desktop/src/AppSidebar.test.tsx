import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seedWorkspace from '../shared/seed-workspace.json'
import type { WorkspaceSnapshot } from './domain'
import { Sidebar } from './AppSidebar'
import { useWorkspace } from './store'

beforeEach(() => {
  useWorkspace.setState({
    ...(structuredClone(seedWorkspace) as WorkspaceSnapshot),
    hydrated: true,
    searchResults: [],
  })
})

afterEach(cleanup)

const renderSidebar = (overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) => {
  const props: React.ComponentProps<typeof Sidebar> = {
    collapsed: false,
    onToggle: vi.fn(),
    onSearch: vi.fn(),
    onArchive: vi.fn(),
    onSettings: vi.fn(),
    onNotifications: vi.fn(),
    onImport: vi.fn(),
    notificationCount: 2,
    activeSurface: 'editor',
    onHome: vi.fn(),
    onAllPages: vi.fn(),
    onPageOpen: vi.fn(),
    ...overrides,
  }
  render(<Sidebar {...props} />)
  return props
}

describe('Sidebar', () => {
  it('matches the prototype navigation hierarchy without hiding existing tools', () => {
    renderSidebar()

    expect(screen.getByText('私有')).toBeInTheDocument()
    expect(screen.getByText('共享')).toBeInTheDocument()
    expect(screen.getByText('工作区')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /更新/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /归档与回收站/ })).toBeInTheDocument()
  })

  it('keeps collapsed navigation accessible to keyboard and screen readers', () => {
    const props = renderSidebar({ collapsed: true })

    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    expect(props.onSearch).toHaveBeenCalledOnce()
    expect(props.onNotifications).toHaveBeenCalledOnce()
  })
})
