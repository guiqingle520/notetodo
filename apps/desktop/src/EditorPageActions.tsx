import { Archive, History, MessageSquare, MoreHorizontal, Star, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { iconMap } from './AppSidebar'
import type { PageIcon } from './domain'
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

const iconChoices: Array<{ id: PageIcon; label: string }> = [
  { id: 'note', label: '文档' },
  { id: 'spark', label: '灵感' },
  { id: 'check', label: '任务' },
  { id: 'book', label: '知识库' },
  { id: 'grid', label: '数据库' },
]

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

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

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
      <div className="page-more-wrap">
        <button
          aria-label="更多页面操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={18} />
        </button>
        {menuOpen && (
          <div className="page-more-menu" role="menu" aria-label="更多页面操作">
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
  icon,
  onIconChange,
}: {
  icon: PageIcon
  onIconChange: (icon: PageIcon) => void
}) {
  const [iconMenuOpen, setIconMenuOpen] = useState(false)

  return (
    <div className="page-meta-actions">
      <div className="page-icon-wrap">
        <button
          aria-haspopup="menu"
          aria-expanded={iconMenuOpen}
          onClick={() => setIconMenuOpen((current) => !current)}
        >
          更改图标
        </button>
        {iconMenuOpen && (
          <div className="page-icon-menu" role="menu" aria-label="选择页面图标">
            {iconChoices.map((choice) => {
              const Icon = iconMap[choice.id]
              return (
                <button
                  className={icon === choice.id ? 'is-selected' : ''}
                  role="menuitemradio"
                  aria-checked={icon === choice.id}
                  aria-label={`${choice.label}图标`}
                  key={choice.id}
                  onClick={() => {
                    onIconChange(choice.id)
                    setIconMenuOpen(false)
                  }}
                >
                  <Icon size={16} />
                  <span>{choice.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <button disabled title="封面功能将在后续版本提供">
        添加封面
      </button>
      <button disabled title="页面说明功能将在后续版本提供">
        添加说明
      </button>
    </div>
  )
}
