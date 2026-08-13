import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEditorMenuDismissal } from './use-editor-menu-dismissal'

describe('useEditorMenuDismissal', () => {
  it('dismisses an open menu on resize and removes the listener when closed', async () => {
    const onDismiss = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ open }) => useEditorMenuDismissal(open, onDismiss),
      { initialProps: { open: true } },
    )

    await act(() => window.dispatchEvent(new Event('resize')))
    expect(onDismiss).toHaveBeenCalledOnce()

    rerender({ open: false })
    await act(() => window.dispatchEvent(new Event('resize')))
    expect(onDismiss).toHaveBeenCalledOnce()
    unmount()
  })

  it('dismisses external interactions but preserves pointer activity inside the menu', async () => {
    const onDismiss = vi.fn()
    const menu = document.createElement('div')
    const item = document.createElement('button')
    menu.className = 'slash-menu'
    menu.append(item)
    document.body.append(menu)
    const { unmount } = renderHook(() => useEditorMenuDismissal(true, onDismiss))

    await act(() => item.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(onDismiss).not.toHaveBeenCalled()

    await act(() => document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(onDismiss).toHaveBeenCalledOnce()
    await act(() => window.dispatchEvent(new Event('blur')))
    expect(onDismiss).toHaveBeenCalledTimes(2)

    unmount()
    menu.remove()
  })
})
