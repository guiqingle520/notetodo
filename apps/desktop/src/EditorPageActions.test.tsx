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

  it('changes the page icon and marks unavailable actions as disabled', () => {
    const onIconChange = vi.fn()
    render(<PageMetaActions icon="note" onIconChange={onIconChange} />)

    fireEvent.click(screen.getByRole('button', { name: '更改图标' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '知识库图标' }))

    expect(onIconChange).toHaveBeenCalledWith('book')
    expect(screen.getByRole('button', { name: '添加封面' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '添加说明' })).toBeDisabled()
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
        <PageMetaActions icon="note" onIconChange={vi.fn()} />
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
