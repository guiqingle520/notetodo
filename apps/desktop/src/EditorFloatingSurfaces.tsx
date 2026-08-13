import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { iconMap } from './AppSidebar'
import { pageBreadcrumbs, type WorkspacePage } from './domain'
import type { BlockAction } from './editor/block-actions'
import type { SlashCommand } from './editor/slash-commands'

export type EditorMenuState = {
  from: number
  left: number
  top: number
  query: string
  index: number
}

export type AttachmentProgressState = {
  phase: 'working' | 'complete' | 'error'
  percent: number
  name: string
  message: string
}

export function EditorDropGuide() {
  return (
    <div className="editor-drop-guide" aria-hidden="true">
      <Upload size={18} />
      <strong>放入工作页</strong>
      <span>图片显示为画面，其他内容成为文件卡片</span>
    </div>
  )
}

export function BlockToolbar({
  top,
  index,
  childCount,
  onAction,
}: {
  top: number
  index: number
  childCount: number
  onAction: (action: BlockAction) => void
}) {
  const runPointerAction = (event: MouseEvent, action: BlockAction) => {
    event.preventDefault()
    onAction(action)
  }

  const runKeyboardAction = (event: MouseEvent, action: BlockAction) => {
    // Keyboard-generated click events have no pointer click count. Pointer
    // actions already run on mouse down so the editor selection is preserved.
    if (event.detail === 0) onAction(action)
  }

  return (
    <div className="block-toolbar" style={{ top }} role="toolbar" aria-label="内容块工具栏">
      <span title="内容块">
        <GripVertical size={14} />
      </span>
      <button
        type="button"
        onMouseDown={(event) => runPointerAction(event, 'move-up')}
        onClick={(event) => runKeyboardAction(event, 'move-up')}
        disabled={index === 0}
        aria-label="上移内容块"
      >
        <ArrowUp size={13} />
      </button>
      <button
        type="button"
        onMouseDown={(event) => runPointerAction(event, 'move-down')}
        onClick={(event) => runKeyboardAction(event, 'move-down')}
        disabled={index >= childCount - 1}
        aria-label="下移内容块"
      >
        <ArrowDown size={13} />
      </button>
      <button
        type="button"
        onMouseDown={(event) => runPointerAction(event, 'duplicate')}
        onClick={(event) => runKeyboardAction(event, 'duplicate')}
        aria-label="复制内容块"
      >
        <Copy size={13} />
      </button>
      <button
        type="button"
        className="is-danger"
        onMouseDown={(event) => runPointerAction(event, 'delete')}
        onClick={(event) => runKeyboardAction(event, 'delete')}
        aria-label="删除内容块"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export function AttachmentProgress({ state }: { state: AttachmentProgressState }) {
  return (
    <div className={`asset-progress is-${state.phase}`} role="status" aria-live="polite">
      <span className="asset-progress-mark">
        {state.phase === 'complete' ? '✓' : state.phase === 'error' ? '!' : <Upload size={13} />}
      </span>
      <span className="asset-progress-copy">
        <strong>{state.message}</strong>
        {state.name && <small>{state.name}</small>}
      </span>
      {state.phase === 'working' && <em>{state.percent}%</em>}
      <i style={{ width: `${state.percent}%` }} />
    </div>
  )
}

function MenuFrame({
  label,
  trigger,
  actionLabel,
  hasResults,
  children,
}: {
  label: string
  trigger: string
  actionLabel: string
  hasResults: boolean
  children: ReactNode
}) {
  return (
    <>
      <header>
        <span>{label}</span>
        <kbd>{trigger}</kbd>
      </header>
      <div>{children}</div>
      <footer>
        {hasResults ? (
          <>
            <span><kbd>↑↓</kbd> 选择</span>
            <span><kbd>Enter</kbd> {actionLabel}</span>
          </>
        ) : (
          <span><kbd>Esc</kbd> 关闭</span>
        )}
      </footer>
    </>
  )
}

export function SlashCommandMenu({
  state,
  commands,
  onSelect,
  onHighlight,
}: {
  state: EditorMenuState
  commands: SlashCommand[]
  onSelect: (command: SlashCommand) => void
  onHighlight: (index: number) => void
}) {
  const selectedItemRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [state.index, commands[state.index]?.label])

  return (
    <div
      className="slash-menu"
      style={{ left: state.left, top: state.top }}
      role="menu"
      aria-label="插入内容块"
    >
      <MenuFrame label="插入内容块" trigger="/" actionLabel="插入" hasResults={Boolean(commands.length)}>
        {commands.map((command, index) => {
          const Icon = command.icon
          return (
            <button
              type="button"
              className={index === state.index ? 'is-selected' : ''}
              aria-current={index === state.index ? 'true' : undefined}
              key={command.label}
              ref={index === state.index ? selectedItemRef : undefined}
              onMouseEnter={() => onHighlight(index)}
              onFocus={() => onHighlight(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(command)
              }}
              onClick={(event) => {
                if (event.detail === 0) onSelect(command)
              }}
              role="menuitem"
            >
              <span>
                <Icon size={16} />
              </span>
              <span>
                <strong>{command.label}</strong>
                <small>{command.hint}</small>
              </span>
            </button>
          )
        })}
        {!commands.length && (
          <div className="slash-empty" role="status" aria-live="polite">
            {state.query ? `没有与“${state.query}”匹配的内容块` : '没有可插入的内容块'}
          </div>
        )}
      </MenuFrame>
    </div>
  )
}

export function PageMentionMenu({
  state,
  pages,
  allPages,
  onSelect,
  onHighlight,
}: {
  state: EditorMenuState
  pages: WorkspacePage[]
  allPages: WorkspacePage[]
  onSelect: (page: WorkspacePage) => void
  onHighlight: (index: number) => void
}) {
  const selectedItemRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    selectedItemRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [state.index, pages[state.index]?.id])

  return (
    <div
      className="page-mention-menu"
      style={{ left: state.left, top: state.top }}
      role="menu"
      aria-label="链接到页面"
    >
      <MenuFrame label="链接到页面" trigger="@" actionLabel="链接" hasResults={Boolean(pages.length)}>
        {pages.map((page, index) => {
          const Icon = iconMap[page.icon]
          return (
            <button
              type="button"
              className={index === state.index ? 'is-selected' : ''}
              aria-current={index === state.index ? 'true' : undefined}
              key={page.id}
              ref={index === state.index ? selectedItemRef : undefined}
              onMouseEnter={() => onHighlight(index)}
              onFocus={() => onHighlight(index)}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(page)
              }}
              onClick={(event) => {
                if (event.detail === 0) onSelect(page)
              }}
              role="menuitem"
            >
              <span>
                <Icon size={15} />
              </span>
              <span>
                <strong>{page.title}</strong>
                <small>
                  {pageBreadcrumbs(allPages, page.id)
                    .map((crumb) => crumb.title)
                    .join(' / ')}
                </small>
              </span>
            </button>
          )
        })}
        {!pages.length && (
          <div className="slash-empty" role="status" aria-live="polite">
            {state.query ? `没有与“${state.query}”匹配的页面` : '没有可链接的其他页面'}
          </div>
        )}
      </MenuFrame>
    </div>
  )
}
