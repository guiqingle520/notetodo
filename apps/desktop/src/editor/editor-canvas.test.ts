import { describe, expect, it } from 'vitest'
import { shouldFocusEditorCanvas } from './editor-canvas'

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
})
