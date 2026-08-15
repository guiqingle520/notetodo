import { useEffect, useRef } from 'react'

/** Centralizes outside-press and global Escape dismissal for anchored menus. */
export function useDismissibleMenu(
  open: boolean,
  close: () => void,
  restoreTriggerFocus?: () => void,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
      // Escape represents cancellation, so focus returns to the control that
      // opened the menu. Outside presses intentionally keep pointer focus.
      restoreTriggerFocus?.()
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [close, open, restoreTriggerFocus])

  return containerRef
}
