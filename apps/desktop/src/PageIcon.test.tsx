import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageIcon } from './PageIcon'

afterEach(cleanup)

describe('page icon', () => {
  it('shows the active icon and changes it from the picker', () => {
    const onChange = vi.fn()
    render(<PageIcon icon="note" onChange={onChange} />)

    const trigger = screen.getByRole('button', { name: '更改页面图标，当前为文档' })
    fireEvent.click(trigger)
    expect(screen.getByRole('menu', { name: '选择页面图标' })).toHaveAttribute(
      'id',
      trigger.getAttribute('aria-controls'),
    )
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
    const trigger = screen.getByRole('button', { name: '更改页面图标，当前为灵感' })

    fireEvent.click(trigger)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '选择页面图标' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: '图标外部' }))
    expect(screen.queryByRole('menu', { name: '选择页面图标' })).not.toBeInTheDocument()
  })

  it('cycles through icon choices and restores trigger focus', () => {
    render(<PageIcon icon="note" onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '更改页面图标，当前为文档' })
    fireEvent.click(trigger)
    const choices = screen.getAllByRole('menuitemradio')

    expect(choices[0]).toHaveFocus()
    fireEvent.keyDown(choices[0]!, { key: 'ArrowUp' })
    expect(choices.at(-1)).toHaveFocus()
    fireEvent.keyDown(choices.at(-1)!, { key: 'Home' })
    expect(choices[0]).toHaveFocus()
    fireEvent.keyDown(choices[0]!, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: '选择页面图标' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('restores trigger focus after choosing an icon', async () => {
    render(<PageIcon icon="note" onChange={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '更改页面图标，当前为文档' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitemradio', { name: '任务图标' }))

    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(trigger).toHaveFocus()
  })

  it('opens the icon menu from the trigger with ArrowDown', () => {
    render(<PageIcon icon="book" onChange={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '更改页面图标，当前为知识库' }), {
      key: 'ArrowDown',
    })
    expect(screen.getByRole('menuitemradio', { name: '知识库图标' })).toHaveFocus()
  })
})
