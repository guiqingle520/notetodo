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
    onAI: vi.fn(),
    onHelp: vi.fn(),
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

  it('opens templates as an anchored dialog and closes it with Escape', () => {
    renderSidebar()
    const trigger = screen.getByRole('button', { name: '从模板新建页面' })

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: '选择页面模板' })).toBeInTheDocument()
    expect(screen.getByText('本地模板')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /空白页/ })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '选择页面模板' })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('opens page-tree items from the keyboard and closes templates outside', () => {
    const props = renderSidebar()
    const page = screen.getByRole('treeitem', { name: /本周计划/ })
    page.focus()
    fireEvent.keyDown(page, { key: 'Enter' })
    expect(useWorkspace.getState().activePageId).toBe('weekly')
    expect(props.onPageOpen).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '从模板新建页面' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog', { name: '选择页面模板' })).not.toBeInTheDocument()
  })

  it('routes AI and help controls to real application actions', () => {
    const props = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: /AI 工作台/ }))
    fireEvent.click(screen.getByRole('button', { name: /帮助与快捷键/ }))

    expect(props.onAI).toHaveBeenCalledOnce()
    expect(props.onHelp).toHaveBeenCalledOnce()
  })
})
