import { Archive, History, MessageSquare, MoreHorizontal, Star, Users } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { RemoteCursor } from './data/remote-cursors'
import { focusFirstMenuItem, navigateMenu, openMenuFromTrigger } from './menu-keyboard'
import { useDismissibleMenu } from './use-dismissible-menu'

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

function presenceDescription(state: PageHeaderActionsProps['collaborationState']) {
  if (state === 'online') return '实时协作已连接'
  if (state === 'offline') return '离线编辑，恢复后自动同步'
  if (state === 'connecting') return '正在连接实时协作'
  return '当前为本机模式'
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
  const moreMenuId = useId()
  const menuRef = useDismissibleMenu(menuOpen, () => setMenuOpen(false))
  const menuTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (menuOpen) focusFirstMenuItem(menuRef.current)
  }, [menuOpen, menuRef])

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false)
    action()
  }

  return (
    <div className="top-actions" role="toolbar" aria-label="页面操作">
      <span
        className={`save-state is-${syncState}`}
        role="status"
        aria-label={`同步状态：${syncLabel(syncState)}`}
      >
        <i />
        <span className="save-state-label" aria-hidden="true">
          {syncLabel(syncState)}
        </span>
      </span>
      <div
        className={`collaboration-presence is-${collaborationState}`}
        role="status"
        aria-label={`协作状态：${presenceDescription(collaborationState)}`}
        title={presenceDescription(collaborationState)}
      >
        <span className="presence-state">
          <Users size={13} />
          <span className="presence-label" aria-hidden="true">
            {presenceLabel(collaborationState)}
          </span>
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
          aria-controls={moreMenuId}
          onKeyDown={(event) => openMenuFromTrigger(event, () => setMenuOpen(true))}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <div
            id={moreMenuId}
            className="page-more-menu"
            role="menu"
            aria-label="更多页面操作"
            onKeyDown={(event) =>
              navigateMenu(event, () => {
                setMenuOpen(false)
                menuTriggerRef.current?.focus()
              })
            }
          >
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
