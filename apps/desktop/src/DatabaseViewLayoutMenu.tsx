import { useEffect, useState } from 'react'
import { Eye, EyeOff, GripVertical, Lock, Rows3, X } from 'lucide-react'
import type { DatabaseSchema, DatabaseViewConfig } from '@notetodo/database-core'
import { propertyTypeLabel } from './DatabaseViews'
import { useDialogFocus } from './use-dialog-focus'

/** Persists table-only density, visibility, order, and frozen-column preferences on the active view. */
export function ViewLayoutMenu({
  id,
  schema,
  config,
  onClose,
  onSave,
}: {
  id?: string
  schema: DatabaseSchema
  config: DatabaseViewConfig
  onClose: () => void
  onSave: (config: DatabaseViewConfig) => void
}) {
  const dialogRef = useDialogFocus<HTMLElement>({ trap: false })
  const [draft, setDraft] = useState<DatabaseViewConfig>(() => structuredClone(config))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const titleId = schema.properties.find((property) => property.type === 'title')?.id
  const propertyById = new Map(schema.properties.map((property) => [property.id, property]))
  const orderedIds = [
    ...new Set([
      ...(draft.propertyOrder ?? []),
      ...schema.properties.map((property) => property.id),
    ]),
  ].filter((id) => propertyById.has(id))
  const orderedProperties = orderedIds.flatMap((id) => {
    const property = propertyById.get(id)
    return property ? [property] : []
  })
  const visible = new Set(
    draft.visiblePropertyIds ?? schema.properties.map((property) => property.id),
  )
  if (titleId) visible.add(titleId)
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  const commit = (next: DatabaseViewConfig) => {
    setDraft(next)
    onSave(next)
  }
  const toggle = (propertyId: string) => {
    if (propertyId === titleId) return
    const nextVisible = new Set(visible)
    if (nextVisible.has(propertyId)) nextVisible.delete(propertyId)
    else nextVisible.add(propertyId)
    commit({
      ...draft,
      visiblePropertyIds: orderedProperties
        .filter((property) => nextVisible.has(property.id))
        .map((property) => property.id),
    })
  }
  const reorder = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return
    const ids = [...orderedIds]
    const from = ids.indexOf(draggingId)
    const to = ids.indexOf(targetId)
    const [movedId] = ids.splice(from, 1)
    if (!movedId) return
    ids.splice(to, 0, movedId)
    setDraggingId(null)
    commit({ ...draft, propertyOrder: ids })
  }
  const visibleCount = schema.properties.filter((property) => visible.has(property.id)).length
  return (
    <section
      id={id}
      ref={dialogRef}
      className="database-layout-menu"
      role="dialog"
      aria-label="表格布局"
      tabIndex={-1}
    >
      <header>
        <div>
          <strong>表格布局</strong>
          <small>仅作用于当前视图</small>
        </div>
        <button aria-label="关闭表格布局" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="layout-density">
        <span>
          <Rows3 size={14} />
          行高
        </span>
        <div>
          {(['compact', 'default', 'comfortable'] as const).map((density) => (
            <button
              aria-pressed={(draft.rowHeight ?? 'default') === density}
              className={(draft.rowHeight ?? 'default') === density ? 'is-selected' : ''}
              key={density}
              onClick={() => commit({ ...draft, rowHeight: density })}
            >
              {density === 'compact' ? '紧凑' : density === 'default' ? '标准' : '宽松'}
            </button>
          ))}
        </div>
      </div>
      <button
        className={`layout-freeze ${draft.freezeFirstColumn ? 'is-active' : ''}`}
        aria-pressed={Boolean(draft.freezeFirstColumn)}
        onClick={() => commit({ ...draft, freezeFirstColumn: !draft.freezeFirstColumn })}
      >
        <Lock size={14} />
        <span>
          <strong>冻结首列</strong>
          <small>横向滚动时保持第一列可见</small>
        </span>
        <i />
      </button>
      <div className="layout-property-heading">
        <span>显示与排序</span>
        <em>
          {visibleCount} / {schema.properties.length}
        </em>
      </div>
      <div className="layout-property-list">
        {orderedProperties.map((property) => {
          const shown = visible.has(property.id)
          return (
            <div
              className={`layout-property-row ${draggingId === property.id ? 'is-dragging' : ''}`}
              key={property.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => reorder(property.id)}
            >
              <button
                className="layout-property-drag"
                draggable
                aria-label={`调整视图属性顺序 ${property.name}`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  setDraggingId(property.id)
                }}
                onDragEnd={() => setDraggingId(null)}
              >
                <GripVertical size={13} />
              </button>
              <i>{propertyTypeLabel(property.type)}</i>
              <span>{property.name}</span>
              <button
                className="layout-property-visibility"
                aria-label={`${shown ? '隐藏' : '显示'}属性 ${property.name}`}
                disabled={property.id === titleId}
                onClick={() => toggle(property.id)}
              >
                {shown ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          )
        })}
      </div>
      <footer>
        <button
          onClick={() =>
            commit({
              ...draft,
              propertyWidths: {},
              propertyOrder: schema.properties.map((property) => property.id),
            })
          }
        >
          重置布局
        </button>
        <span>列底可选择计算方式</span>
      </footer>
    </section>
  )
}
