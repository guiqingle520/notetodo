type CanvasPointerEvent = Pick<MouseEvent, 'button' | 'currentTarget' | 'defaultPrevented' | 'target'>

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
