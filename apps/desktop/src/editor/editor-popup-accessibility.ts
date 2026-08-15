/**
 * Connects a focused contenteditable editor to the suggestion popup that it
 * controls. The editor keeps focus for uninterrupted typing while assistive
 * technology can still follow the keyboard-highlighted suggestion.
 */
export function connectEditorPopup(
  editor: HTMLElement,
  menuId: string,
  activeItemId: string | null,
) {
  editor.setAttribute('aria-haspopup', 'menu')
  editor.setAttribute('aria-expanded', 'true')
  editor.setAttribute('aria-controls', menuId)
  editor.setAttribute('aria-autocomplete', 'list')
  if (activeItemId) editor.setAttribute('aria-activedescendant', activeItemId)
  else editor.removeAttribute('aria-activedescendant')

  return () => {
    editor.removeAttribute('aria-haspopup')
    editor.removeAttribute('aria-expanded')
    editor.removeAttribute('aria-controls')
    editor.removeAttribute('aria-autocomplete')
    editor.removeAttribute('aria-activedescendant')
  }
}
