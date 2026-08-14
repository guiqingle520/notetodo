import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCompactShell } from './use-compact-shell'

afterEach(() => vi.unstubAllGlobals())

function installViewport(initiallyCompact: boolean) {
  let onChange: (() => void) | undefined
  const viewport = {
    matches: initiallyCompact,
    addEventListener: vi.fn((_type: string, listener: () => void) => { onChange = listener }),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => viewport))
  return {
    viewport,
    enterCompactWidth: () => {
      viewport.matches = true
      onChange?.()
    },
  }
}

describe('useCompactShell', () => {
  it('collapses side panels on an initially compact window', () => {
    installViewport(true)
    const setSidebarCollapsed = vi.fn()
    const setAiOpen = vi.fn()
    renderHook(() => useCompactShell(setSidebarCollapsed, setAiOpen))

    expect(setSidebarCollapsed).toHaveBeenCalledWith(true)
    expect(setAiOpen).toHaveBeenCalledWith(false)
  })

  it('reacts when a wide window enters compact width', () => {
    const viewport = installViewport(false)
    const setSidebarCollapsed = vi.fn()
    const setAiOpen = vi.fn()
    renderHook(() => useCompactShell(setSidebarCollapsed, setAiOpen))
    expect(setSidebarCollapsed).not.toHaveBeenCalled()

    viewport.enterCompactWidth()
    expect(setSidebarCollapsed).toHaveBeenCalledWith(true)
    expect(setAiOpen).toHaveBeenCalledWith(false)
  })
})
