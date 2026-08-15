function treeItems(tree: HTMLElement) {
  return Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'))
}

function level(item: HTMLElement) {
  return Number(item.getAttribute('aria-level')) || 1
}

/** Maintains one Tab stop while allowing arrow keys to move through visible pages. */
export function focusSidebarTreeItem(tree: HTMLElement, item: HTMLElement) {
  for (const candidate of treeItems(tree)) candidate.tabIndex = candidate === item ? 0 : -1
  item.focus()
}

export function navigateSidebarTree(tree: HTMLElement, current: HTMLElement, key: string) {
  const items = treeItems(tree)
  const index = items.indexOf(current)
  if (index < 0) return false

  let target: HTMLElement | undefined
  if (key === 'ArrowDown') target = items[index + 1]
  if (key === 'ArrowUp') target = items[index - 1]
  if (key === 'Home') target = items[0]
  if (key === 'End') target = items.at(-1)

  if (key === 'ArrowRight') {
    if (current.getAttribute('aria-expanded') === 'false') {
      current.querySelector<HTMLButtonElement>('.row-disclosure')?.click()
      return true
    }
    const next = items[index + 1]
    if (current.getAttribute('aria-expanded') === 'true' && next && level(next) > level(current)) {
      target = next
    }
  }

  if (key === 'ArrowLeft') {
    if (current.getAttribute('aria-expanded') === 'true') {
      current.querySelector<HTMLButtonElement>('.row-disclosure')?.click()
      return true
    }
    for (let parentIndex = index - 1; parentIndex >= 0; parentIndex -= 1) {
      const candidate = items[parentIndex]
      if (candidate && level(candidate) < level(current)) {
        target = candidate
        break
      }
    }
  }

  if (!target) return false
  focusSidebarTreeItem(tree, target)
  return true
}
