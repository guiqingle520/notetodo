import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageCover } from './PageCover'

afterEach(cleanup)

describe('PageCover', () => {
  it('exposes change and remove actions next to the cover', () => {
    const onChange = vi.fn()
    const onRemove = vi.fn()
    render(
      <PageCover
        source={`notetodo-asset://${'a'.repeat(64)}/cover.png`}
        onChange={onChange}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '更改封面' }))
    fireEvent.click(screen.getByRole('button', { name: '移除页面封面' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.getByRole('toolbar', { name: '封面操作' })).toBeInTheDocument()
  })

  it('keeps recovery actions available when the image cannot load', () => {
    const { container } = render(
      <PageCover
        source="notetodo-asset://broken/cover.png"
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    fireEvent.error(container.querySelector('img')!)

    expect(screen.getByRole('status')).toHaveTextContent('封面图片无法显示')
    expect(screen.getByRole('toolbar', { name: '封面操作' })).toBeInTheDocument()
  })

  it('keeps cover controls keyboard focusable', () => {
    render(<PageCover source="notetodo-asset://cover/image.png" onChange={vi.fn()} onRemove={vi.fn()} />)
    const change = screen.getByRole('button', { name: '更改封面' })
    change.focus()
    expect(change).toHaveFocus()
    expect(screen.getByRole('toolbar', { name: '封面操作' })).toContainElement(change)
  })
})
