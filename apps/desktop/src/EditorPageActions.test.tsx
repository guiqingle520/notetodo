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

  it('changes the page icon and exposes page metadata actions', () => {
    const onIconChange = vi.fn()
    const onCoverRequest = vi.fn()
    const onDescriptionRequest = vi.fn()
    render(
      <PageMetaActions
        icon="note"
        hasCover={false}
        hasDescription={false}
        onIconChange={onIconChange}
        onCoverRequest={onCoverRequest}
        onCoverRemove={vi.fn()}
        onDescriptionRequest={onDescriptionRequest}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '更改图标' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '知识库图标' }))

    expect(onIconChange).toHaveBeenCalledWith('book')
    fireEvent.click(screen.getByRole('button', { name: '添加封面' }))
    expect(onCoverRequest).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '添加说明' }))
    expect(onDescriptionRequest).toHaveBeenCalledOnce()
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
          icon="note"
          hasCover={false}
          hasDescription={false}
          onIconChange={vi.fn()}
          onCoverRequest={vi.fn()}
          onCoverRemove={vi.fn()}
          onDescriptionRequest={vi.fn()}
        />
        <button>菜单外部</button>
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: '更多页面操作' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '更多页面操作' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '更改图标' }))
    expect(screen.getByRole('menu', { name: '选择页面图标' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: '菜单外部' }))
    expect(screen.queryByRole('menu', { name: '选择页面图标' })).not.toBeInTheDocument()
  })
})
