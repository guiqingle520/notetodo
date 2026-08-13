import { describe, expect, it } from 'vitest'
import { findDirectEditorBlock, placeEditorMenu, shouldFocusEditorCanvas } from './editor-canvas'

describe('shouldFocusEditorCanvas', () => {
  it('focuses only a primary-button press on the blank canvas', () => {
    const canvas = document.createElement('div')
    expect(shouldFocusEditorCanvas({ button: 0, currentTarget: canvas, target: canvas, defaultPrevented: false })).toBe(true)
  })

  it('preserves nested controls and handled pointer interactions', () => {
    const canvas = document.createElement('div')
    const block = document.createElement('p')
    canvas.append(block)

    expect(shouldFocusEditorCanvas({ button: 0, currentTarget: canvas, target: block, defaultPrevented: false })).toBe(false)
    expect(shouldFocusEditorCanvas({ button: 1, currentTarget: canvas, target: canvas, defaultPrevented: false })).toBe(false)
    expect(shouldFocusEditorCanvas({ button: 0, currentTarget: canvas, target: canvas, defaultPrevented: true })).toBe(false)
  })

  it('resolves nested content to its direct editor block', () => {
    const root = document.createElement('div')
    const paragraph = document.createElement('p')
    const text = document.createElement('span')
    paragraph.append(text)
    root.append(paragraph)

    expect(findDirectEditorBlock(root, text)).toBe(paragraph)
    expect(findDirectEditorBlock(root, root)).toBeNull()
    expect(findDirectEditorBlock(root, document.createElement('button'))).toBeNull()
  })

  it('keeps menus inside narrow viewports and opens upward near the bottom edge', () => {
    expect(placeEditorMenu({ anchorLeft: 280, anchorTop: 80, anchorBottom: 100, viewportWidth: 300, viewportHeight: 600 })).toEqual({ left: 8, top: 108 })
    expect(placeEditorMenu({ anchorLeft: 120, anchorTop: 680, anchorBottom: 700, viewportWidth: 1200, viewportHeight: 768 })).toEqual({ left: 120, top: 286 })
  })
})
