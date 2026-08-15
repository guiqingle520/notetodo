import { useEffect, useId, useRef, useState } from 'react'
import { iconMap } from './AppSidebar'
import type { PageIcon as PageIconName } from './domain'
import { focusSelectedMenuItem, navigateMenu, openMenuFromTrigger } from './menu-keyboard'
import { useDismissibleMenu } from './use-dismissible-menu'

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
  const menuId = useId()
  const containerRef = useDismissibleMenu(open, () => setOpen(false))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const Icon = iconMap[icon]
  const activeLabel = iconChoices.find((choice) => choice.id === icon)?.label ?? '页面'

  const selectIcon = (nextIcon: PageIconName) => {
    onChange(nextIcon)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  useEffect(() => {
    if (open) focusSelectedMenuItem(containerRef.current)
  }, [open])

  return (
    <div className="page-icon-picker" ref={containerRef}>
      <button
        ref={triggerRef}
        className="page-icon-trigger"
        aria-label={`更改页面图标，当前为${activeLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onKeyDown={(event) => openMenuFromTrigger(event, () => setOpen(true))}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon size={34} />
      </button>
      {open && (
        <div
          id={menuId}
          className="page-icon-menu"
          role="menu"
          aria-label="选择页面图标"
          onKeyDown={(event) =>
            navigateMenu(event, () => {
              setOpen(false)
              triggerRef.current?.focus()
            })
          }
        >
          {iconChoices.map((choice) => {
            const ChoiceIcon = iconMap[choice.id]
            return (
              <button
                className={icon === choice.id ? 'is-selected' : ''}
                role="menuitemradio"
                aria-checked={icon === choice.id}
                aria-label={`${choice.label}图标`}
                key={choice.id}
                onClick={() => selectIcon(choice.id)}
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
