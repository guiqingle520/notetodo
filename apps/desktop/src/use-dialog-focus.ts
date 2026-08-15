import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.closest('[hidden], [aria-hidden="true"]'),
  )
}

/** 将键盘焦点限制在模态对话框内，并在关闭后还原到原触发控件。 */
export function useDialogFocus<T extends HTMLElement>() {
  const dialogRef = useRef<T>(null)
  // React 会在 effect 之前处理 autoFocus，因此必须在首次渲染时保存外部焦点。
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const initialFocus = focusableElements(dialog)[0] ?? dialog

    if (!dialog.contains(document.activeElement)) initialFocus.focus()

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const elements = focusableElements(dialog)
      if (!elements.length) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = elements[0]!
      const last = elements.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', keepFocusInside)
    return () => {
      dialog.removeEventListener('keydown', keepFocusInside)
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [])

  return dialogRef
}
