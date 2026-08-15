import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspacePage } from './domain'
import { CommentsPanel, PageHistoryPanel } from './AppPanels'

afterEach(cleanup)

const page: WorkspacePage = {
  id: 'page-prototype',
  title: '产品路线图',
  icon: 'note',
  parentId: null,
  updatedAt: '2026-08-12T00:00:00.000Z',
  lastVisitedAt: '2026-08-12T00:00:00.000Z',
  archivedAt: null,
  content: '<p>当前正文</p>',
}

describe('editor interaction surfaces', () => {
  it('exposes the comments drawer as a labelled dialog with a labelled composer', () => {
    const onClose = vi.fn()
    render(<CommentsPanel pageId={page.id} editor={null} onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: '页面讨论' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '评论内容' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('还没有讨论')
    expect(screen.getByRole('button', { name: '发布评论' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '关闭页面讨论' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps page history as a modal dialog with an explicit close action', () => {
    const onClose = vi.fn()
    render(
      <PageHistoryPanel page={page} canRestore={false} onRestored={vi.fn()} onClose={onClose} />,
    )

    expect(screen.getByRole('dialog', { name: '页面历史' })).toBeInTheDocument()
    expect(screen.getByText('页面历史')).toBeInTheDocument()
    expect(screen.getByText('产品路线图 · 最多保留 200 版')).toBeInTheDocument()
    expect(screen.getByText(/正在加载历史版本|还没有历史版本/u)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭页面历史' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
