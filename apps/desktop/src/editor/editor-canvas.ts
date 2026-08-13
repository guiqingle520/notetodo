type CanvasPointerEvent = Pick<MouseEvent, 'button' | 'currentTarget' | 'defaultPrevented' | 'target'>

type EditorMenuPlacement = {
  anchorLeft: number
  anchorTop: number
  anchorBottom: number
  viewportWidth: number
  viewportHeight: number
}

const MENU_MARGIN = 8
const MENU_WIDTH = 324
const MENU_HEIGHT = 386
const MENU_VIEWPORT_RESERVE = 92

/**
 * Only a primary-button press on the canvas itself should move the caret.
 * Content blocks, links, controls and prevented pointer interactions keep their
 * own behavior instead of unexpectedly jumping to the end of the document.
 */
export function shouldFocusEditorCanvas(event: CanvasPointerEvent) {
  return !event.defaultPrevented && event.button === 0 && event.target === event.currentTarget
}

/** Resolve a pointer target to the top-level ProseMirror block it belongs to. */
export function findDirectEditorBlock(root: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element) || !root.contains(target)) return null
  let candidate: Element | null = target
  while (candidate?.parentElement && candidate.parentElement !== root) {
    candidate = candidate.parentElement
  }
  return candidate instanceof HTMLElement && candidate.parentElement === root ? candidate : null
}

/** Keep fixed-position editor menus inside the viewport and open upward near the bottom edge. */
export function placeEditorMenu({ anchorLeft, anchorTop, anchorBottom, viewportWidth, viewportHeight }: EditorMenuPlacement) {
  const visibleWidth = Math.min(MENU_WIDTH, Math.max(0, viewportWidth - MENU_MARGIN * 2))
  const visibleHeight = Math.min(MENU_HEIGHT, Math.max(0, viewportHeight - MENU_VIEWPORT_RESERVE))
  const maxLeft = Math.max(MENU_MARGIN, viewportWidth - visibleWidth - MENU_MARGIN)
  const left = Math.min(Math.max(anchorLeft, MENU_MARGIN), maxLeft)
  const below = anchorBottom + MENU_MARGIN
  const fitsBelow = below + visibleHeight <= viewportHeight - MENU_MARGIN
  const top = fitsBelow
    ? below
    : Math.max(MENU_MARGIN, anchorTop - visibleHeight - MENU_MARGIN)
  return { left, top }
}
