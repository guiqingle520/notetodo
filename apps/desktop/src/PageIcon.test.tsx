import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageIcon } from './PageIcon'

afterEach(cleanup)

describe('page icon', () => {
  it('shows the active icon and changes it from the picker', () => {
    const onChange = vi.fn()
    render(<PageIcon icon="note" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '更改页面图标' }))
    expect(screen.getByRole('menuitemradio', { name: '文档图标' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: '知识库图标' }))

    expect(onChange).toHaveBeenCalledWith('book')
    expect(screen.queryByRole('menu', { name: '选择页面图标' })).not.toBeInTheDocument()
  })

  it('dismisses the picker with Escape and an outside pointer press', () => {
    render(
      <div>
        <PageIcon icon="spark" onChange={vi.fn()} />
        <button>图标外部</button>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: '更改页面图标' })

    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '选择页面图标' })).not.toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: '图标外部' }))
    expect(screen.queryByRole('menu', { name: '选择页面图标' })).not.toBeInTheDocument()
  })
})
