import { useEffect, useState } from 'react'
import { PencilLine } from 'lucide-react'
import type { DatabaseSchema, DatabaseView, DatabaseViewConfig } from '@notetodo/database-core'

export function DatabaseNameEditor({
  name,
  onRename,
}: {
  name: string
  onRename: (name: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(name), [name])
  const save = async () => {
    const normalized = draft.trim()
    if (!normalized || normalized === name) {
      setDraft(name)
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await onRename(normalized)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }
  return editing ? (
    <span className="database-name-editor">
      <input
        aria-label="数据库名称"
        autoFocus
        maxLength={200}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void save()
          if (event.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
      />
      <i>{busy ? '保存中' : 'Enter 保存'}</i>
    </span>
  ) : (
    <button className="database-name-trigger" title="重命名数据库" onClick={() => setEditing(true)}>
      <span>{name}</span>
      <PencilLine size={10} />
    </button>
  )
}

export function defaultViewConfig(
  schema: DatabaseSchema,
  type: DatabaseView['type'],
): DatabaseViewConfig {
  const dates = schema.properties.filter((property) => property.type === 'date')
  const selectable = schema.properties.find((property) =>
    ['select', 'multiSelect'].includes(property.type),
  )
  const cover = schema.properties.find((property) => property.type === 'url')
  if (type === 'board') return selectable ? { groupByPropertyId: selectable.id } : {}
  if (type === 'calendar') return dates[0] ? { datePropertyId: dates[0].id } : {}
  if (type === 'timeline')
    return { startDatePropertyId: dates[0]?.id, endDatePropertyId: dates[1]?.id ?? dates[0]?.id }
  if (type === 'gallery')
    return {
      coverPropertyId: cover?.id,
      visiblePropertyIds: schema.properties
        .filter((property) => property.type !== 'title')
        .slice(0, 3)
        .map((property) => property.id),
      cardSize: 'medium',
    }
  return {}
}
