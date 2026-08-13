import { useEffect } from 'react'

/** Close caret-anchored menus when a viewport change invalidates their fixed coordinates. */
export function useEditorMenuDismissal(open: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.slash-menu, .page-mention-menu')) return
      onDismiss()
    }
    window.addEventListener('resize', onDismiss)
    window.addEventListener('blur', onDismiss)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('blur', onDismiss)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open, onDismiss])
}
