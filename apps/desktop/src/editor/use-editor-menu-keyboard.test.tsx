import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEditorMenuKeyboard } from './use-editor-menu-keyboard'

describe('useEditorMenuKeyboard', () => {
  it('routes navigation, selection and closing through one keyboard controller', async () => {
    const onMove = vi.fn()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    renderHook(() => useEditorMenuKeyboard({ open: true, itemCount: 3, selectedIndex: 2, onMove, onSelect, onClose }))

    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })))
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })))
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

    expect(onMove).toHaveBeenCalledWith(-1)
    expect(onSelect).toHaveBeenCalledWith(2)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores composition and unavailable menu items', async () => {
    const onMove = vi.fn()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    renderHook(() => useEditorMenuKeyboard({ open: true, itemCount: 0, selectedIndex: 0, onMove, onSelect, onClose }))

    const composing = new KeyboardEvent('keydown', { key: 'Escape' })
    Object.defineProperty(composing, 'isComposing', { value: true })
    await act(() => window.dispatchEvent(composing))
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })))
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })))

    expect(onClose).not.toHaveBeenCalled()
    expect(onMove).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
