import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAppDialogState } from './use-app-dialog-state'

describe('useAppDialogState', () => {
  it('replaces the active modal instead of stacking dialogs', () => {
    const { result } = renderHook(() => useAppDialogState())

    act(() => result.current.openDialog('settings'))
    expect(result.current.activeDialog).toBe('settings')

    act(() => result.current.openDialog('search'))
    expect(result.current.activeDialog).toBe('search')

    act(() => result.current.closeDialog())
    expect(result.current.activeDialog).toBeNull()
  })
})
