import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import seedWorkspace from '../shared/seed-workspace.json'
import type { WorkspaceSnapshot } from './domain'
import { ArchivePanel, NotificationPanel, SharePanel } from './AppPanels'
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
    fireEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('uses the same dialog semantics for updates and sharing', () => {
    const { unmount } = render(<NotificationPanel onClose={vi.fn()} onCountChange={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '更新' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭更新' })).toBeInTheDocument()

    unmount()
    render(<SharePanel pageId="welcome" onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: '共享此页面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭共享' })).toBeInTheDocument()
  })
})
