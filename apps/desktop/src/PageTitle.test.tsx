import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageTitle } from './PageTitle'

afterEach(cleanup)

describe('page title', () => {
  it('supports an empty title and forwards edits within the persistence limit', () => {
    const onChange = vi.fn()
    render(<PageTitle value="" onChange={onChange} onSubmit={vi.fn()} />)
    const title = screen.getByRole('textbox', { name: '页面标题' })

    expect(title).toHaveAttribute('placeholder', '无标题')
    expect(title).toHaveAttribute('maxlength', '1000')
    fireEvent.change(title, { target: { value: '一段可以\n换行的标题' } })
    expect(onChange).toHaveBeenCalledWith('一段可以 换行的标题')
  })

  it('grows to match wrapped title content', () => {
    const scrollHeight = vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(92)
    const { rerender } = render(<PageTitle value="短标题" onChange={vi.fn()} onSubmit={vi.fn()} />)

    rerender(<PageTitle value="换行后占据更多空间的长标题" onChange={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: '页面标题' })).toHaveStyle({ height: '92px' })
    scrollHeight.mockRestore()
  })

  it('moves to page content on Enter without interrupting IME composition', () => {
    const onSubmit = vi.fn()
    render(<PageTitle value="标题" onChange={vi.fn()} onSubmit={onSubmit} />)
    const title = screen.getByRole('textbox', { name: '页面标题' })

    fireEvent.keyDown(title, { key: 'Enter', keyCode: 229 })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(title, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledOnce()
  })
})
