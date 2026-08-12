import { useEffect, useRef, useState } from 'react'
import { iconMap } from './AppSidebar'
import type { PageIcon as PageIconName } from './domain'

const iconChoices: Array<{ id: PageIconName; label: string }> = [
  { id: 'note', label: '文档' },
  { id: 'spark', label: '灵感' },
  { id: 'check', label: '任务' },
  { id: 'book', label: '知识库' },
  { id: 'grid', label: '数据库' },
]

/** Keeps the page identity visible while isolating picker state from the editor. */
export function PageIcon({
  icon,
  onChange,
}: {
  icon: PageIconName
  onChange: (icon: PageIconName) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const Icon = iconMap[icon]

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
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

  return (
    <div className="page-icon-picker" ref={containerRef}>
      <button
        className="page-icon-trigger"
        aria-label="更改页面图标"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon size={34} />
      </button>
      {open && (
        <div className="page-icon-menu" role="menu" aria-label="选择页面图标">
          {iconChoices.map((choice) => {
            const ChoiceIcon = iconMap[choice.id]
            return (
              <button
                className={icon === choice.id ? 'is-selected' : ''}
                role="menuitemradio"
                aria-checked={icon === choice.id}
                aria-label={`${choice.label}图标`}
                key={choice.id}
                onClick={() => {
                  onChange(choice.id)
                  setOpen(false)
                }}
              >
                <ChoiceIcon size={17} />
                <span>{choice.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
