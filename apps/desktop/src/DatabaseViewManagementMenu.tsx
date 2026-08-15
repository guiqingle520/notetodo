import { useEffect, useState } from 'react'
import {
  CalendarDays,
  ChartNoAxesGantt,
  Check,
  Columns3,
  Copy,
  Images,
  List,
  Star,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import type { DatabaseView } from '@notetodo/database-core'
import { useDialogFocus } from './use-dialog-focus'

interface ViewManagementMenuProps {
  mode: 'create' | 'manage'
  views: DatabaseView[]
  activeView: DatabaseView
  defaultViewId: string
  onClose: () => void
  onCreate: (name: string, type: DatabaseView['type']) => Promise<void>
  onRename: (name: string) => Promise<void>
  onDuplicate: () => Promise<void>
  onDelete: () => Promise<void>
  onSetDefault: () => Promise<void>
}

const databaseViewTypes: Array<{
  type: DatabaseView['type']
  label: string
  description: string
  icon: typeof Table2
}> = [
  { type: 'table', label: '表格', description: '按属性列查看记录', icon: Table2 },
  { type: 'board', label: '看板', description: '按状态分组卡片', icon: Columns3 },
  { type: 'list', label: '列表', description: '紧凑浏览记录', icon: List },
  { type: 'calendar', label: '日历', description: '按日期安排记录', icon: CalendarDays },
  {
    type: 'timeline',
    label: '时间轴',
    description: '查看日期范围',
    icon: ChartNoAxesGantt,
  },
  { type: 'gallery', label: '画廊', description: '以卡片展示内容', icon: Images },
]

/**
 * 统一承载视图创建与管理操作，使数据库主组件只负责弹层编排。
 * 操作期间禁用重复提交，并将仓储错误留在当前弹层内供用户重试。
 */
export function ViewManagementMenu({
  mode,
  views,
  activeView,
  defaultViewId,
  onClose,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onSetDefault,
}: ViewManagementMenuProps) {
  const dialogRef = useDialogFocus<HTMLElement>({ trap: false })
  const [name, setName] = useState(mode === 'create' ? '新视图' : activeView.name)
  const [type, setType] = useState<DatabaseView['type']>('table')
  const [isBusy, setIsBusy] = useState(false)
  const [isDeletePending, setIsDeletePending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const runAction = async (action: () => Promise<void>) => {
    if (isBusy) return

    setIsBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败，请重试。')
    } finally {
      setIsBusy(false)
    }
  }

  if (mode === 'create') {
    const createView = () => runAction(() => onCreate(name.trim(), type))

    return (
      <section
        ref={dialogRef}
        className="database-view-menu is-create"
        role="dialog"
        aria-label="新建数据库视图"
        tabIndex={-1}
      >
        <header>
          <strong>新建视图</strong>
          <button aria-label="关闭新建视图" onClick={onClose}>
            <X size={14} />
          </button>
        </header>
        <label>
          <span>视图名称</span>
          <input
            autoFocus
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) void createView()
            }}
          />
        </label>
        <div className="database-view-types">
          {databaseViewTypes.map((candidate) => {
            const Icon = candidate.icon
            return (
              <button
                className={type === candidate.type ? 'is-selected' : ''}
                key={candidate.type}
                onClick={() => setType(candidate.type)}
              >
                <Icon size={16} />
                <span>
                  <strong>{candidate.label}</strong>
                  <small>{candidate.description}</small>
                </span>
                {type === candidate.type && <Check size={14} />}
              </button>
            )
          })}
        </div>
        {error && <p>{error}</p>}
        <footer>
          <button onClick={onClose}>取消</button>
          <button disabled={!name.trim() || isBusy} onClick={() => void createView()}>
            {isBusy ? '创建中…' : '创建'}
          </button>
        </footer>
      </section>
    )
  }

  const trimmedName = name.trim()
  const canRename = Boolean(trimmedName) && trimmedName !== activeView.name

  return (
    <section
      ref={dialogRef}
      className="database-view-menu is-manage"
      role="dialog"
      aria-label="管理数据库视图"
      tabIndex={-1}
    >
      <header>
        <strong>视图选项</strong>
        <button aria-label="关闭视图选项" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <label>
        <span>名称</span>
        <input
          autoFocus
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canRename) void runAction(() => onRename(trimmedName))
          }}
        />
      </label>
      <div className="database-view-actions">
        <button
          disabled={isBusy || !canRename}
          onClick={() => void runAction(() => onRename(trimmedName))}
        >
          <Check size={14} />
          <span>保存名称</span>
        </button>
        <button disabled={isBusy} onClick={() => void runAction(onDuplicate)}>
          <Copy size={14} />
          <span>复制视图</span>
        </button>
        <button
          disabled={isBusy || activeView.id === defaultViewId}
          onClick={() => void runAction(onSetDefault)}
        >
          <Star size={14} />
          <span>{activeView.id === defaultViewId ? '当前默认视图' : '设为默认视图'}</span>
        </button>
        <button
          className={isDeletePending ? 'is-confirm-delete' : 'is-danger'}
          disabled={isBusy || views.length <= 1}
          onClick={() => {
            if (!isDeletePending) {
              setIsDeletePending(true)
              return
            }
            void runAction(onDelete)
          }}
        >
          <Trash2 size={14} />
          <span>
            {views.length <= 1
              ? '至少保留一个视图'
              : isDeletePending
                ? '确认删除此视图'
                : '删除视图'}
          </span>
        </button>
      </div>
      {error && <p>{error}</p>}
    </section>
  )
}
