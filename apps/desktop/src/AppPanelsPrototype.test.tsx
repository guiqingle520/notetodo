import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seedWorkspace from '../shared/seed-workspace.json'
import type { WorkspaceSnapshot } from './domain'
import { ArchivePanel, ImportPanel, NotificationPanel, SharePanel } from './AppPanels'
import { useWorkspace } from './store'

beforeEach(() => {
  useWorkspace.setState({
    ...(structuredClone(seedWorkspace) as WorkspaceSnapshot),
    hydrated: true,
    searchResults: [],
  })
})

afterEach(cleanup)

describe('prototype modal surfaces', () => {
  it('exposes the archive as a labelled modal and closes from its header', () => {
    const onClose = vi.fn()
    render(<ArchivePanel onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: '归档与回收站' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭归档与回收站' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('uses the same dialog semantics for updates and sharing', () => {
    const { unmount } = render(<NotificationPanel onClose={vi.fn()} onCountChange={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '更新' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭更新' })).toBeInTheDocument()

    unmount()
    render(<SharePanel id="share-dialog" pageId="welcome" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '共享此页面' })).toHaveAttribute('id', 'share-dialog')
    expect(screen.getByRole('button', { name: '关闭共享' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '受邀成员' })).toHaveFocus()
    expect(screen.getByRole('combobox', { name: '访问权限' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '邀请' })).toBeDisabled()
  })

  it('presents workspace import as a local preflight dialog', () => {
    const onClose = vi.fn()
    render(<ImportPanel onClose={onClose} onImported={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: '导入工作区' })).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '导入工作区' })).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByText('Notion 导出包 · 本地安全预检')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择 Notion 导出包' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择 Notion 导出包' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: '关闭导入工作区' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
