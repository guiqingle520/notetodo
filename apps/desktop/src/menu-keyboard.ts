import type { KeyboardEvent } from 'react'

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(:disabled), [role="menuitemradio"]:not(:disabled)'

export function focusFirstMenuItem(container: HTMLElement | null) {
  container?.querySelector<HTMLButtonElement>(MENU_ITEM_SELECTOR)?.focus()
}

export function openMenuFromTrigger(event: KeyboardEvent<HTMLButtonElement>, open: () => void) {
  if (event.key !== 'ArrowDown') return
  event.preventDefault()
  open()
}

/** Keeps every compact menu on the same predictable WAI-ARIA keyboard loop. */
export function navigateMenu(event: KeyboardEvent<HTMLDivElement>, onEscape: () => void) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(MENU_ITEM_SELECTOR))
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  let nextIndex: number | null = null
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = items.length - 1
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onEscape()
    return
  }
  const nextItem = nextIndex === null ? undefined : items[nextIndex]
  if (!nextItem) return
  event.preventDefault()
  nextItem.focus()
}
