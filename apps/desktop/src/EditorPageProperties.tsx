import { CalendarDays, Plus, Users } from 'lucide-react'
import type { WorkspacePage } from './domain'
import type { RemoteCursor } from './data/remote-cursors'

interface EditorPagePropertiesProps {
  page: WorkspacePage
  collaborators: RemoteCursor[]
  onAddParticipant: () => void
}

function formatPageDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未设置'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function EditorPageProperties({ page, collaborators, onAddParticipant }: EditorPagePropertiesProps) {
  const participants = collaborators
    .slice(0, 4)
    .map((person) => ({ id: person.clientId, name: person.name }))

  return (
    <section className="editor-page-properties" aria-label="页面属性">
      <div className="editor-property-row">
        <span className="editor-property-name">
          <CalendarDays size={15} />
          日期
        </span>
        <span className="editor-property-value">{formatPageDate(page.updatedAt)}</span>
      </div>
      <div className="editor-property-row">
        <span className="editor-property-name">
          <Users size={15} />
          参与者
        </span>
        <span className="editor-property-people">
          {participants.length
            ? participants.map((person) => <span key={person.id}>@{person.name}</span>)
            : <span className="editor-property-empty">未添加参与者</span>}
          <button aria-label="添加参与者" onClick={onAddParticipant}>
            <Plus size={13} />
          </button>
        </span>
      </div>
    </section>
  )
}
