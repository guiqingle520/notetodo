import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HelpPanel } from './AppHelpPanel'

afterEach(cleanup)

describe('HelpPanel', () => {
  it('shows only supported shortcuts and closes explicitly', () => {
    const onClose = vi.fn()
    render(<HelpPanel onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: '帮助与快捷键' })).toBeInTheDocument()
    expect(screen.getByText('搜索工作区')).toBeInTheDocument()
    expect(screen.getByText('Ctrl + K')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭帮助' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: '关闭帮助' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes with Escape', () => {
    const onClose = vi.fn()
    render(<HelpPanel onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
