import { useLayoutEffect, useRef } from 'react'

const MAX_PAGE_TITLE_LENGTH = 1_000

/** A wrapping page title keeps long names readable without becoming editor content. */
export function PageTitle({ value, onChange, onSubmit }: { value: string; onChange: (value: string) => void; onSubmit: () => void }) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={inputRef}
      className="page-title"
      value={value}
      aria-label="页面标题"
      placeholder="无标题"
      maxLength={MAX_PAGE_TITLE_LENGTH}
      rows={1}
      onChange={(event) => onChange(event.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
        event.preventDefault()
        onSubmit()
      }}
    />
  )
}
