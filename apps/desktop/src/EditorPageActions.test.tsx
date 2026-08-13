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

    expect(screen.getByRole('toolbar', { name: '页面操作' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '同步状态：本机 CRDT 已同步' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '协作状态：当前为本机模式' })).toBeInTheDocument()
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

  it('cycles through the page menu with the keyboard and restores trigger focus', () => {
    render(
      <PageHeaderActions syncState="ready" collaborationState="local" collaborators={[]} favorite={false} onComments={vi.fn()} onHistory={vi.fn()} onShare={vi.fn()} onToggleFavorite={vi.fn()} onArchive={vi.fn()} />,
    )
    const trigger = screen.getByRole('button', { name: '更多页面操作' })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')

    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(items[1]!, { key: 'End' })
    expect(items.at(-1)).toHaveFocus()
    fireEvent.keyDown(items.at(-1)!, { key: 'ArrowDown' })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(items[0]!, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '更多页面操作' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('opens the page menu from the trigger with ArrowDown', () => {
    render(<PageHeaderActions syncState="ready" collaborationState="local" collaborators={[]} favorite={false} onComments={vi.fn()} onHistory={vi.fn()} onShare={vi.fn()} onToggleFavorite={vi.fn()} onArchive={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '更多页面操作' }), { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus()
  })
})
