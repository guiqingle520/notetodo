import { useEffect, useLayoutEffect, useRef } from 'react'

const MAX_PAGE_DESCRIPTION_LENGTH = 2_000

/** Keeps optional page context readable without coupling its layout to the editor document. */
export function PageDescription({ value, focusRequest, onChange, onEmptyBlur }: { value: string; focusRequest: number; onChange: (value: string) => void; onEmptyBlur: () => void }) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [value])

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus()
  }, [focusRequest])

  return (
    <textarea
      ref={inputRef}
      className="page-description"
      aria-label="页面说明"
      placeholder="添加页面说明…"
      maxLength={MAX_PAGE_DESCRIPTION_LENGTH}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={(event) => {
        if (!event.currentTarget.value.trim()) onEmptyBlur()
      }}
    />
  )
}
