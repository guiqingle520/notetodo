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
})
