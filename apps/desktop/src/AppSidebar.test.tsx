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
    panels: {
      search: { id: 'search-dialog', open: true },
      notifications: { id: 'notifications-dialog', open: false },
      settings: { id: 'settings-dialog', open: false },
      ai: { id: 'ai-panel', open: true },
      import: { id: 'import-dialog', open: false },
      archive: { id: 'archive-dialog', open: false },
      help: { id: 'help-dialog', open: false },
    },
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
    expect(screen.getByRole('button', { name: /^搜索/u })).toHaveAttribute(
      'aria-controls',
      'search-dialog',
    )
    expect(screen.getByRole('button', { name: /^搜索/u })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /AI 工作台/ })).toHaveAttribute(
      'aria-controls',
      'ai-panel',
    )
    expect(screen.getByRole('button', { name: /导入工作区/ })).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    )
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
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: '选择页面模板' })).toHaveAttribute(
      'id',
      trigger.getAttribute('aria-controls'),
    )
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

  it('navigates the visible page tree with a single keyboard tab stop', () => {
    renderSidebar()
    const welcome = screen.getByRole('treeitem', { name: /从这里开始/u })
    const projects = screen.getByRole('treeitem', { name: /产品路线/u })

    expect(welcome).toHaveAttribute('tabindex', '0')
    expect(projects).toHaveAttribute('tabindex', '-1')
    projects.focus()
    expect(projects).toHaveAttribute('tabindex', '0')
    expect(welcome).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(projects, { key: 'ArrowLeft' })
    expect(screen.queryByRole('treeitem', { name: /本周计划/u })).not.toBeInTheDocument()
    fireEvent.keyDown(projects, { key: 'ArrowRight' })
    const weekly = screen.getByRole('treeitem', { name: /本周计划/u })
    fireEvent.keyDown(projects, { key: 'ArrowRight' })
    expect(weekly).toHaveFocus()

    fireEvent.keyDown(weekly, { key: 'ArrowLeft' })
    expect(projects).toHaveFocus()
    fireEvent.keyDown(projects, { key: 'End' })
    const knowledge = screen.getByRole('treeitem', { name: /知识库/u })
    expect(knowledge).toHaveFocus()
    fireEvent.keyDown(knowledge, { key: 'ArrowDown' })
    expect(knowledge).toHaveFocus()
    fireEvent.keyDown(knowledge, { key: 'Home' })
    expect(welcome).toHaveFocus()
    fireEvent.keyDown(welcome, { key: 'ArrowUp' })
    expect(welcome).toHaveFocus()
  })

  it('routes AI and help controls to real application actions', () => {
    const props = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: /AI 工作台/ }))
    fireEvent.click(screen.getByRole('button', { name: /帮助与快捷键/ }))

    expect(props.onAI).toHaveBeenCalledOnce()
    expect(props.onHelp).toHaveBeenCalledOnce()
  })
})
