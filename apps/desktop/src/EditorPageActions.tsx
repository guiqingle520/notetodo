import { Archive, History, MessageSquare, MoreHorizontal, Star, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { RemoteCursor } from './data/remote-cursors'

interface PageHeaderActionsProps {
  syncState: 'loading' | 'ready' | 'saving' | 'error'
  collaborationState: 'local' | 'connecting' | 'online' | 'offline'
  collaborators: RemoteCursor[]
  favorite: boolean
  onComments: () => void
  onHistory: () => void
  onShare: () => void
  onToggleFavorite: () => void
  onArchive: () => void
}

/** Gives compact page menus one predictable dismissal contract. */
function useDismissibleMenu(
  open: boolean,
  close: () => void,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close()
    }
    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [close, open])

  return containerRef
}

function syncLabel(state: PageHeaderActionsProps['syncState']) {
  if (state === 'loading') return '正在恢复'
  if (state === 'saving') return '正在保存'
  if (state === 'error') return '同步异常'
  return '本机 CRDT 已同步'
}

function presenceLabel(state: PageHeaderActionsProps['collaborationState']) {
  if (state === 'online') return '实时'
  if (state === 'offline') return '离线'
  if (state === 'connecting') return '连接中'
  return '本机'
}

/** Implements the standard keyboard loop shared by compact application menus. */
function navigateMenu(event: React.KeyboardEvent<HTMLDivElement>, onEscape: () => void) {
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  let nextIndex: number | null = null
  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = items.length - 1
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    onEscape()
    return
  }
  const nextItem = nextIndex === null ? undefined : items[nextIndex]
  if (!nextItem) return
  event.preventDefault()
  nextItem.focus()
}

export function PageHeaderActions({
  syncState,
  collaborationState,
  collaborators,
  favorite,
  onComments,
  onHistory,
  onShare,
  onToggleFavorite,
  onArchive,
}: PageHeaderActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useDismissibleMenu(menuOpen, () => setMenuOpen(false))
  const menuTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [menuOpen, menuRef])

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <div className="top-actions">
      <span className={`save-state is-${syncState}`} role="status">
        <i />
        {syncLabel(syncState)}
      </span>
      <div
        className={`collaboration-presence is-${collaborationState}`}
        title={
          collaborationState === 'online'
            ? '实时协作已连接'
            : collaborationState === 'offline'
              ? '离线编辑，恢复后自动同步'
              : '本机模式'
        }
      >
        <span className="presence-state">
          <Users size={13} />
          {presenceLabel(collaborationState)}
        </span>
        <span className="presence-avatars">
          {collaborators.slice(0, 3).map((person) => (
            <i key={person.clientId} style={{ background: person.color }} title={person.name}>
              {person.name.slice(0, 1)}
            </i>
          ))}
        </span>
      </div>
      <button onClick={onComments} aria-label="页面评论">
        <MessageSquare size={15} />
      </button>
      <button onClick={onHistory} aria-label="页面历史">
        <History size={15} />
      </button>
      <button onClick={onShare}>分享</button>
      <button
        className={favorite ? 'is-starred' : ''}
        onClick={onToggleFavorite}
        aria-label={favorite ? '取消收藏' : '收藏页面'}
      >
        <Star size={17} fill={favorite ? 'currentColor' : 'none'} />
      </button>
      <div className="page-more-wrap" ref={menuRef}>
        <button
          ref={menuTriggerRef}
          aria-label="更多页面操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <div className="page-more-menu" role="menu" aria-label="更多页面操作" onKeyDown={(event) => navigateMenu(event, () => { setMenuOpen(false); menuTriggerRef.current?.focus() })}>
            <button role="menuitem" onClick={() => runMenuAction(onToggleFavorite)}>
              <Star size={14} />
              {favorite ? '取消收藏' : '添加到收藏'}
            </button>
            <button role="menuitem" onClick={() => runMenuAction(onHistory)}>
              <History size={14} />
              查看页面历史
            </button>
            <button className="is-danger" role="menuitem" onClick={() => runMenuAction(onArchive)}>
              <Archive size={14} />
              移至回收站
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function PageMetaActions({
  hasCover,
  hasDescription,
  onCoverRequest,
  onDescriptionRequest,
}: {
  hasCover: boolean
  hasDescription: boolean
  onCoverRequest: () => void
  onDescriptionRequest: () => void
}) {
  return (
    <div className="page-meta-actions" role="toolbar" aria-label="页面外观">
      {!hasCover && <button onClick={onCoverRequest}>添加封面</button>}
      <button onClick={onDescriptionRequest}>{hasDescription ? '编辑说明' : '添加说明'}</button>
    </div>
  )
}
