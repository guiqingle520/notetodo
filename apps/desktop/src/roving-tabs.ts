import type { KeyboardEvent } from 'react'

const navigationKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'] as const

/**
 * Implements automatic activation for a horizontal tab list. Selection and
 * focus move together so keyboard users see the same panel as pointer users.
 */
export function moveRovingTab<Item>(
  event: KeyboardEvent<HTMLButtonElement>,
  items: readonly Item[],
  currentIndex: number,
  onSelect: (item: Item) => void,
) {
  if (!navigationKeys.some((key) => key === event.key) || !items.length) return
  event.preventDefault()
  const lastIndex = items.length - 1
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? lastIndex
        : event.key === 'ArrowLeft'
          ? (currentIndex - 1 + items.length) % items.length
          : (currentIndex + 1) % items.length
  const nextItem = items[nextIndex]
  if (nextItem === undefined) return
  onSelect(nextItem)
  event.currentTarget
    .closest('[role="tablist"]')
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [nextIndex]?.focus()
}
