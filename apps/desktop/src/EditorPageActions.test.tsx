import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageHeaderActions, PageMetaActions } from './EditorPageActions'

afterEach(cleanup)

describe('editor page actions', () => {
  it('exposes real page actions from the more menu', () => {
    const onToggleFavorite = vi.fn()
    const onHistory = vi.fn()
    render(
      <PageHeaderActions
        syncState="ready"
        collaborationState="local"
        collaborators={[]}
        favorite={false}
        onComments={vi.fn()}
        onHistory={onHistory}
        onShare={vi.fn()}
        onToggleFavorite={onToggleFavorite}
        onArchive={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '更多页面操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '添加到收藏' }))
    expect(onToggleFavorite).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '更多页面操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '查看页面历史' }))
    expect(onHistory).toHaveBeenCalledOnce()
  })

  it('exposes page metadata actions', () => {
    const onCoverRequest = vi.fn()
    const onDescriptionRequest = vi.fn()
    render(
      <PageMetaActions
        hasCover={false}
        hasDescription={false}
        onCoverRequest={onCoverRequest}
        onDescriptionRequest={onDescriptionRequest}
      />,
    )

    expect(screen.getByRole('toolbar', { name: '页面外观' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '添加封面' }))
    expect(onCoverRequest).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '添加说明' }))
    expect(onDescriptionRequest).toHaveBeenCalledOnce()
  })

  it('keeps the appearance toolbar discoverable from keyboard focus', () => {
    render(<PageMetaActions hasCover={false} hasDescription onCoverRequest={vi.fn()} onDescriptionRequest={vi.fn()} />)

    const editDescription = screen.getByRole('button', { name: '编辑说明' })
    editDescription.focus()
    expect(editDescription).toHaveFocus()
    expect(screen.getByRole('toolbar', { name: '页面外观' })).toContainElement(editDescription)
  })

  it('dismisses page menus with Escape and an outside pointer press', () => {
    render(
      <div>
        <PageHeaderActions
          syncState="ready"
          collaborationState="local"
          collaborators={[]}
          favorite={false}
          onComments={vi.fn()}
          onHistory={vi.fn()}
          onShare={vi.fn()}
          onToggleFavorite={vi.fn()}
          onArchive={vi.fn()}
        />
        <PageMetaActions
          hasCover={false}
          hasDescription={false}
          onCoverRequest={vi.fn()}
          onDescriptionRequest={vi.fn()}
        />
        <button>菜单外部</button>
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: '更多页面操作' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '更多页面操作' })).not.toBeInTheDocument()
  })
})
