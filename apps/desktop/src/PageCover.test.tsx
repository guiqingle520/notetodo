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
    fireEvent.click(screen.getByRole('button', { name: '移除' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledOnce()
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
    expect(screen.getByRole('group', { name: '封面操作' })).toBeInTheDocument()
  })
})
