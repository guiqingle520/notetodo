import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageDescription } from './PageDescription'

afterEach(cleanup)

describe('page description', () => {
  it('forwards edits and grows with multiline content', () => {
    const onChange = vi.fn()
    const scrollHeight = vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(76)
    const { rerender } = render(<PageDescription value="说明" focusRequest={0} onChange={onChange} onEmptyBlur={vi.fn()} onSubmit={vi.fn()} />)
    const description = screen.getByRole('textbox', { name: '页面说明' })

    expect(description).toHaveAttribute('maxlength', '2000')
    fireEvent.change(description, { target: { value: '第一行\n第二行' } })
    expect(onChange).toHaveBeenCalledWith('第一行\n第二行')
    rerender(<PageDescription value={'第一行\n第二行'} focusRequest={0} onChange={onChange} onEmptyBlur={vi.fn()} onSubmit={vi.fn()} />)
    expect(description).toHaveStyle({ height: '76px' })
    scrollHeight.mockRestore()
  })

  it('focuses on request and collapses only an empty description on blur', () => {
    const onEmptyBlur = vi.fn()
    const { rerender } = render(<PageDescription value="" focusRequest={0} onChange={vi.fn()} onEmptyBlur={onEmptyBlur} onSubmit={vi.fn()} />)
    const description = screen.getByRole('textbox', { name: '页面说明' })

    rerender(<PageDescription value="" focusRequest={1} onChange={vi.fn()} onEmptyBlur={onEmptyBlur} onSubmit={vi.fn()} />)
    expect(description).toHaveFocus()
    fireEvent.blur(description)
    expect(onEmptyBlur).toHaveBeenCalledOnce()
  })

  it('moves to page content with the platform submit shortcut', () => {
    const onSubmit = vi.fn()
    render(<PageDescription value="页面背景" focusRequest={0} onChange={vi.fn()} onEmptyBlur={vi.fn()} onSubmit={onSubmit} />)
    const description = screen.getByRole('textbox', { name: '页面说明' })

    fireEvent.keyDown(description, { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledOnce()
    fireEvent.keyDown(description, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
