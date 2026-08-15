import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useDialogFocus } from './use-dialog-focus'

function DialogFixture() {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  return (
    <div ref={dialogRef} role="dialog" aria-label="焦点测试" tabIndex={-1}>
      <button autoFocus>第一个</button>
      <input aria-label="中间输入框" />
      <button>最后一个</button>
    </div>
  )
}

afterEach(cleanup)

describe('useDialogFocus', () => {
  it('focuses the first control and loops Tab inside the dialog', () => {
    render(<DialogFixture />)
    const first = screen.getByRole('button', { name: '第一个' })
    const last = screen.getByRole('button', { name: '最后一个' })

    expect(first).toHaveFocus()
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('restores focus to the trigger after unmounting', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const view = render(<DialogFixture />)
    expect(screen.getByRole('button', { name: '第一个' })).toHaveFocus()
    view.unmount()

    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
