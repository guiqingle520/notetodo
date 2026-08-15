import { CheckCircle2, FileText, MousePointer2, Plus } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { focusSelectedMenuItem, navigateMenu, openMenuFromTrigger } from './menu-keyboard'

type ContextMode = 'page' | 'selection'

/**
 * Owns the compact AI context menu so its trigger relationship, keyboard loop,
 * dismissal and focus restoration stay independent from the conversation state.
 */
export function AIContextMenu({
  mode,
  pageBlocks,
  selectionAvailable,
  onChange,
}: {
  mode: ContextMode
  pageBlocks: number
  selectionAvailable: boolean
  onChange: (mode: ContextMode) => void
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [open])

  useEffect(() => {
    if (open) focusSelectedMenuItem(containerRef.current)
  }, [open])

  const selectMode = (nextMode: ContextMode) => {
    onChange(nextMode)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div className="ai-context-picker" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="选择 AI 上下文"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onKeyDown={(event) => openMenuFromTrigger(event, () => setOpen(true))}
        onClick={() => setOpen((current) => !current)}
      >
        <Plus size={16} />
      </button>
      {open && (
        <div
          id={menuId}
          className="ai-context-menu"
          role="menu"
          aria-label="选择 AI 上下文"
          onKeyDown={(event) =>
            navigateMenu(event, () => {
              setOpen(false)
              triggerRef.current?.focus()
            })
          }
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'page'}
            onClick={() => selectMode('page')}
          >
            <FileText size={15} />
            <span>
              <strong>当前页面</strong>
              <small>{pageBlocks} 个内容块</small>
            </span>
            {mode === 'page' && <CheckCircle2 size={14} />}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={mode === 'selection'}
            disabled={!selectionAvailable}
            onClick={() => selectMode('selection')}
          >
            <MousePointer2 size={15} />
            <span>
              <strong>所选文本</strong>
              <small>{selectionAvailable ? '仅使用编辑器中的选区' : '请先在页面中选择文字'}</small>
            </span>
            {mode === 'selection' && <CheckCircle2 size={14} />}
          </button>
        </div>
      )}
    </div>
  )
}
