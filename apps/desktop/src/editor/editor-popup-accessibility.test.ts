import { describe, expect, it } from 'vitest'
import { connectEditorPopup } from './editor-popup-accessibility'

describe('connectEditorPopup', () => {
  it('connects the focused editor to its active suggestion and cleans up', () => {
    const editor = document.createElement('div')
    const disconnect = connectEditorPopup(editor, 'slash-menu', 'slash-menu-item-2')

    expect(editor).toHaveAttribute('aria-haspopup', 'menu')
    expect(editor).toHaveAttribute('aria-expanded', 'true')
    expect(editor).toHaveAttribute('aria-controls', 'slash-menu')
    expect(editor).toHaveAttribute('aria-autocomplete', 'list')
    expect(editor).toHaveAttribute('aria-activedescendant', 'slash-menu-item-2')

    disconnect()
    expect(editor).not.toHaveAttribute('aria-controls')
    expect(editor).not.toHaveAttribute('aria-activedescendant')
  })

  it('omits an active descendant for an empty result set', () => {
    const editor = document.createElement('div')
    connectEditorPopup(editor, 'mention-menu', null)

    expect(editor).toHaveAttribute('aria-controls', 'mention-menu')
    expect(editor).not.toHaveAttribute('aria-activedescendant')
  })
})
