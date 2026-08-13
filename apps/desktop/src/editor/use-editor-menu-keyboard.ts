import { useEffect, useRef } from 'react'
import { isEditorCompositionEvent } from './editor-canvas'

type EditorMenuKeyboardOptions = {
  open: boolean
  itemCount: number
  selectedIndex: number
  onMove: (direction: 1 | -1) => void
  onSelect: (index: number) => void
  onClose: () => void
}

/** Shared keyboard loop for caret-anchored editor menus. */
export function useEditorMenuKeyboard(options: EditorMenuKeyboardOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!options.open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = optionsRef.current
      if (isEditorCompositionEvent(event)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        current.onClose()
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (current.itemCount) current.onMove(event.key === 'ArrowDown' ? 1 : -1)
      } else if (event.key === 'Enter' && current.itemCount) {
        event.preventDefault()
        current.onSelect(Math.min(current.selectedIndex, current.itemCount - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [options.open])
}
