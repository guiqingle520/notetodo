import { useEffect } from 'react'

/** Close caret-anchored menus when a viewport change invalidates their fixed coordinates. */
export function useEditorMenuDismissal(open: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', onDismiss)
    return () => window.removeEventListener('resize', onDismiss)
  }, [open, onDismiss])
}
