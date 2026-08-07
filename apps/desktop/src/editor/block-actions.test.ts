import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { applyBlockAction } from './block-actions'

let editor: Editor | undefined
afterEach(() => editor?.destroy())

describe('top-level block actions', () => {
  it('reorders a block atomically in both directions', () => {
    editor = new Editor({ extensions: [StarterKit], content: '<p>Alpha</p><p>Beta</p><p>Gamma</p>' })
    expect(applyBlockAction(editor, 1, 'move-up')).toBe(true)
    expect(editor.getText({ blockSeparator: '|' })).toBe('Beta|Alpha|Gamma')
    expect(applyBlockAction(editor, 0, 'move-down')).toBe(true)
    expect(editor.getText({ blockSeparator: '|' })).toBe('Alpha|Beta|Gamma')
  })

  it('duplicates and deletes blocks while preserving a valid document', () => {
    editor = new Editor({ extensions: [StarterKit], content: '<p>Only</p>' })
    applyBlockAction(editor, 0, 'duplicate')
    expect(editor.getText({ blockSeparator: '|' })).toBe('Only|Only')
    applyBlockAction(editor, 1, 'delete')
    applyBlockAction(editor, 0, 'delete')
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.type.name).toBe('paragraph')
  })
})
