import type { Editor } from '@tiptap/react'
import {
  Archive,
  BookOpen,
  CheckCircle2,
  CheckSquare2,
  FileText,
  Grid2X2,
  Inbox,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PageIcon } from './domain'
import { useWorkspace } from './store'
import { useDialogFocus } from './use-dialog-focus'

type PagePermission = {
  subjectId: string
  displayName: string
  role: 'viewer' | 'commenter' | 'editor' | 'owner'
}

type PageComment = {
  id: string
  authorName: string
  body: string
  anchor: null | { from: number; to: number; quote: string }
  resolvedAt: string | null
  createdAt: string
}

type WorkspaceNotification = {
  id: string
  type: 'mention' | 'comment'
  readAt: string | null
  createdAt: string
  pageId: string
  pageTitle: string
  authorName: string
  body: string
}

const iconMap: Record<PageIcon, React.ComponentType<{ size?: number }>> = {
  spark: Sparkles,
  note: FileText,
  check: CheckSquare2,
  grid: Grid2X2,
  book: BookOpen,
}

export function ArchivePanel({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const { pages, restorePage } = useWorkspace()
  const archivedPages = pages.filter((page) => page.archivedAt)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="archive-panel"
        role="dialog"
        aria-modal="true"
        aria-label="归档与回收站"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Archive size={18} />
            <span>
              <strong>归档与回收站</strong>
              <small>内容仍然安全保存在本机</small>
            </span>
          </div>
          <button onClick={onClose} aria-label="关闭归档与回收站">
            <X size={17} />
          </button>
        </header>
        <div className="archive-list">
          {archivedPages.map((page) => {
            const Icon = iconMap[page.icon]
            return (
              <div key={page.id}>
                <span className="result-icon">
                  <Icon size={16} />
                </span>
                <span>
                  <strong>{page.title}</strong>
                  <small>
                    {page.archivedAt && new Date(page.archivedAt).toLocaleString('zh-CN')}
                  </small>
                </span>
                <button onClick={() => restorePage(page.id)}>
                  <RotateCcw size={14} />
                  恢复
                </button>
              </div>
            )
          })}
          {!archivedPages.length && (
            <div className="empty-state" role="status">
              <Archive size={26} />
              <strong>回收站是空的</strong>
              <span>归档的页面会出现在这里。</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function NotificationPanel({
  onClose,
  onCountChange,
}: {
  onClose: () => void
  onCountChange: (count: number) => void
}) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const { setActivePage } = useWorkspace()
  const [items, setItems] = useState<WorkspaceNotification[]>([])

  useEffect(() => {
    const load = async () => {
      const notifications = window.notetodo?.notifications
        ? await window.notetodo.notifications.list()
        : []
      setItems(notifications)
      onCountChange(notifications.filter((item) => !item.readAt).length)
    }
    void load()
  }, [onCountChange])

  const open = async (item: WorkspaceNotification) => {
    if (!item.readAt && window.notetodo?.notifications) {
      await window.notetodo.notifications.markRead(item.id)
    }
    setActivePage(item.pageId)
    onCountChange(
      Math.max(0, items.filter((entry) => !entry.readAt && entry.id !== item.id).length),
    )
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="notification-panel"
        role="dialog"
        aria-modal="true"
        aria-label="更新"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Inbox size={17} />
            <span>
              <strong>更新</strong>
              <small>提及与页面协作动态</small>
            </span>
          </div>
          <button onClick={onClose} aria-label="关闭更新">
            <X size={16} />
          </button>
        </header>
        <div className="notification-list" aria-label="协作动态">
          {items.map((item) => (
            <button
              className={item.readAt ? 'is-read' : ''}
              key={item.id}
              onClick={() => void open(item)}
            >
              <i>{item.authorName?.slice(0, 1) || '@'}</i>
              <span>
                <strong>
                  {item.authorName} 在「{item.pageTitle}」中提到了你
                </strong>
                <p>{item.body}</p>
                <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
              </span>
              {!item.readAt && <em aria-label="未读" />}
            </button>
          ))}
          {!items.length && (
            <div className="empty-state" role="status">
              <Inbox size={25} />
              <strong>没有新消息</strong>
              <span>评论中的 @提及会出现在这里。</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function SharePanel({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const [permissions, setPermissions] = useState<PagePermission[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor'>('editor')

  useEffect(() => {
    if (window.notetodo?.sharing) void window.notetodo.sharing.list(pageId).then(setPermissions)
    else setPermissions([{ subjectId: 'preview-owner', displayName: '本机用户', role: 'owner' }])
  }, [pageId])

  const add = async () => {
    const displayName = name.trim()
    if (!displayName) return
    const subjectId = crypto.randomUUID()
    if (window.notetodo?.sharing)
      await window.notetodo.sharing.upsert(pageId, subjectId, displayName, role)
    setPermissions((current) => [...current, { subjectId, displayName, role }])
    setName('')
  }

  const remove = async (permission: PagePermission) => {
    if (permission.role === 'owner') return
    if (window.notetodo?.sharing) await window.notetodo.sharing.remove(pageId, permission.subjectId)
    setPermissions((current) => current.filter((item) => item.subjectId !== permission.subjectId))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="share-panel"
        role="dialog"
        aria-modal="true"
        aria-label="共享此页面"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Users size={17} />
            <span>
              <strong>共享此页面</strong>
              <small>权限在加入协作房间前验证</small>
            </span>
          </div>
          <button onClick={onClose} aria-label="关闭共享">
            <X size={16} />
          </button>
        </header>
        <div className="share-invite">
          <input
            autoFocus
            aria-label="受邀成员"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="姓名或团队成员 ID"
          />
          <select
            aria-label="访问权限"
            value={role}
            onChange={(event) => setRole(event.target.value as typeof role)}
          >
            <option value="editor">可编辑</option>
            <option value="commenter">可评论</option>
            <option value="viewer">可查看</option>
          </select>
          <button onClick={() => void add()} disabled={!name.trim()}>
            邀请
          </button>
        </div>
        <div className="permission-list" aria-label="已有访问权限">
          <span>已有访问权限</span>
          {permissions.map((permission) => (
            <div key={permission.subjectId}>
              <i>{permission.displayName.slice(0, 1)}</i>
              <span>
                <strong>{permission.displayName}</strong>
                <small>{permission.subjectId.slice(0, 8)}</small>
              </span>
              <em>
                {permission.role === 'owner'
                  ? '所有者'
                  : permission.role === 'editor'
                    ? '可编辑'
                    : permission.role === 'commenter'
                      ? '可评论'
                      : '可查看'}
              </em>
              {permission.role !== 'owner' && (
                <button
                  aria-label={`移除 ${permission.displayName}`}
                  onClick={() => void remove(permission)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        <footer>
          <ShieldCheck size={14} />
          房间票据仅对当前页面有效，5 分钟后过期
        </footer>
      </section>
    </div>
  )
}

export function CommentsPanel({
  pageId,
  editor,
  onClose,
}: {
  pageId: string
  editor: Editor | null
  onClose: () => void
}) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const [comments, setComments] = useState<PageComment[]>([])
  const [members, setMembers] = useState<PagePermission[]>([])
  const [body, setBody] = useState('')
  const selection = editor?.state.selection
  const quote =
    selection && !selection.empty
      ? (editor?.state.doc.textBetween(selection.from, selection.to, ' ') ?? '')
      : ''

  useEffect(() => {
    if (window.notetodo?.comments) void window.notetodo.comments.list(pageId).then(setComments)
    if (window.notetodo?.sharing) void window.notetodo.sharing.list(pageId).then(setMembers)
    else setMembers([{ subjectId: 'preview-ming', displayName: 'Ming', role: 'editor' }])
  }, [pageId])

  const create = async () => {
    const value = body.trim()
    if (!value) return
    const anchor =
      selection && !selection.empty
        ? { from: selection.from, to: selection.to, quote: quote.slice(0, 1000) }
        : null
    const mentions = members
      .filter((member) => value.includes(`@${member.displayName}`))
      .map((member) => member.subjectId)
    const id = window.notetodo?.comments
      ? await window.notetodo.comments.create(pageId, value, anchor, mentions)
      : crypto.randomUUID()
    setComments((current) => [
      {
        id,
        authorName: '本机用户',
        body: value,
        anchor,
        resolvedAt: null,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ])
    setBody('')
  }

  const resolve = async (id: string) => {
    if (window.notetodo?.comments) await window.notetodo.comments.resolve(id)
    setComments((current) =>
      current.map((comment) =>
        comment.id === id ? { ...comment, resolvedAt: new Date().toISOString() } : comment,
      ),
    )
  }

  return (
    <aside
      ref={dialogRef}
      className="comments-panel"
      role="dialog"
      aria-modal="true"
      aria-label="页面讨论"
      tabIndex={-1}
    >
      <header>
        <div>
          <MessageSquare size={16} />
          <span>
            <strong>页面讨论</strong>
            <small aria-live="polite">
              {comments.filter((comment) => !comment.resolvedAt).length} 条未解决
            </small>
          </span>
        </div>
        <button onClick={onClose} aria-label="关闭页面讨论">
          <X size={16} />
        </button>
      </header>
      <div className="comment-composer">
        {quote && <blockquote>“{quote}”</blockquote>}
        <textarea
          autoFocus
          aria-label="评论内容"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={quote ? '评论所选内容，支持 @提及…' : '添加页面评论，输入 @ 提及成员…'}
        />
        {members.length > 0 && (
          <div className="mention-members" aria-label="可提及成员">
            <span>提及</span>
            {members.slice(0, 5).map((member) => (
              <button
                key={member.subjectId}
                onClick={() =>
                  setBody(
                    (current) =>
                      `${current}${current && !current.endsWith(' ') ? ' ' : ''}@${member.displayName} `,
                  )
                }
              >
                @{member.displayName}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => void create()} disabled={!body.trim()}>
          发布评论
        </button>
      </div>
      <div className="comment-list" aria-label="评论列表">
        {comments.map((comment) => (
          <article className={comment.resolvedAt ? 'is-resolved' : ''} key={comment.id}>
            {comment.anchor?.quote && <blockquote>“{comment.anchor.quote}”</blockquote>}
            <header>
              <i>{comment.authorName.slice(0, 1)}</i>
              <span>
                <strong>{comment.authorName}</strong>
                <small>{new Date(comment.createdAt).toLocaleString('zh-CN')}</small>
              </span>
            </header>
            <p>{comment.body}</p>
            {!comment.resolvedAt && (
              <button onClick={() => void resolve(comment.id)}>
                <CheckCircle2 size={12} />
                标记已解决
              </button>
            )}
          </article>
        ))}
        {!comments.length && (
          <div className="empty-state comment-empty" role="status">
            <MessageSquare size={24} />
            <strong>还没有讨论</strong>
            <span>针对页面或所选内容留下第一条评论。</span>
          </div>
        )}
      </div>
    </aside>
  )
}
