import { useEffect, useState } from 'react'
import { Filter, Plus, X } from 'lucide-react'
import type {
  DatabaseProperty,
  DatabaseSchema,
  FilterRule,
  PropertyValue,
} from '@notetodo/database-core'
import { useDialogFocus } from './use-dialog-focus'

/** Compact filter composer used by the database toolbar for the most common one-value rules. */
export function QuickFilterMenu({
  id,
  schema,
  filters,
  onClose,
  onChange,
}: {
  id?: string
  schema: DatabaseSchema
  filters: FilterRule[]
  onClose: () => void
  onChange: (filters: FilterRule[]) => void
}) {
  const dialogRef = useDialogFocus<HTMLElement>({ trap: false })
  const available = schema.properties.filter(
    (property) => !filters.some((filter) => filter.propertyId === property.id),
  )
  const initialProperty =
    available.find((property) => property.type === 'select') ??
    available.find((property) => property.type === 'checkbox') ??
    available[0] ??
    schema.properties[0]
  const [propertyId, setPropertyId] = useState(initialProperty?.id ?? '')
  const property =
    schema.properties.find((candidate) => candidate.id === propertyId) ?? initialProperty
  const [value, setValue] = useState<PropertyValue>(() =>
    initialProperty ? defaultValue(initialProperty) : null,
  )
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const selectProperty = (nextId: string) => {
    const next = schema.properties.find((candidate) => candidate.id === nextId) ?? initialProperty
    if (!next) return
    setPropertyId(next.id)
    setValue(defaultValue(next))
  }
  const add = () => {
    if (
      !property ||
      filters.length >= 5 ||
      filters.some((filter) => filter.propertyId === property.id)
    )
      return
    const nextFilters = [
      ...filters,
      { propertyId: property.id, operator: operatorFor(property), value },
    ]
    onChange(nextFilters)
    const nextProperty = schema.properties.find(
      (candidate) => !nextFilters.some((filter) => filter.propertyId === candidate.id),
    )
    if (nextProperty) selectProperty(nextProperty.id)
  }
  return (
    <section
      id={id}
      ref={dialogRef}
      className="quick-filter-menu"
      role="dialog"
      aria-label="快速筛选"
      tabIndex={-1}
    >
      <header>
        <span>
          <Filter size={13} />
          <strong>快速筛选</strong>
        </span>
        <button aria-label="关闭快速筛选" onClick={onClose}>
          <X size={13} />
        </button>
      </header>
      {filters.length > 0 && (
        <div className="quick-filter-list">
          {filters.map((filter, index) => (
            <span key={`${filter.propertyId}-${index}`}>
              {quickFilterLabel(schema, filter)}
              <button
                aria-label={`删除快速筛选 ${index + 1}`}
                onClick={() => onChange(filters.filter((_, candidate) => candidate !== index))}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {property && available.length > 0 && filters.length < 5 ? (
        <div className="quick-filter-composer">
          <select
            autoFocus
            aria-label="快速筛选属性"
            value={property.id}
            onChange={(event) => selectProperty(event.target.value)}
          >
            {available.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <QuickFilterValueInput property={property} value={value} onChange={setValue} />
          <button onClick={add}>
            <Plus size={12} />
            添加
          </button>
        </div>
      ) : (
        <p>当前视图已添加全部可用的快速筛选。</p>
      )}
      <footer>快速筛选按“全部满足”组合，并随当前视图保存。</footer>
    </section>
  )
}

function QuickFilterValueInput({
  property,
  value,
  onChange,
}: {
  property: DatabaseProperty
  value: PropertyValue
  onChange: (value: PropertyValue) => void
}) {
  if (['select', 'multiSelect'].includes(property.type) && property.options?.length)
    return (
      <select
        aria-label="快速筛选值"
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      >
        {property.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    )
  if (property.type === 'checkbox')
    return (
      <select
        aria-label="快速筛选值"
        value={String(value)}
        onChange={(event) => onChange(event.target.value === 'true')}
      >
        <option value="true">已勾选</option>
        <option value="false">未勾选</option>
      </select>
    )
  return (
    <input
      aria-label="快速筛选值"
      type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'}
      value={String(value ?? '')}
      placeholder="输入值"
      onChange={(event) =>
        onChange(property.type === 'number' ? Number(event.target.value) : event.target.value)
      }
      onKeyDown={(event) => {
        if (event.key === 'Enter')
          event.currentTarget
            .closest('.quick-filter-composer')
            ?.querySelector<HTMLButtonElement>('button')
            ?.click()
      }}
    />
  )
}

function operatorFor(property: DatabaseProperty): FilterRule['operator'] {
  return ['title', 'text', 'url', 'multiSelect', 'relation'].includes(property.type)
    ? 'contains'
    : 'equals'
}

function defaultValue(property: DatabaseProperty): PropertyValue {
  if (['select', 'multiSelect'].includes(property.type)) return property.options?.[0]?.id ?? ''
  if (property.type === 'checkbox') return true
  return property.type === 'number' ? 0 : ''
}

export function quickFilterLabel(schema: DatabaseSchema, filter: FilterRule) {
  const property = schema.properties.find((candidate) => candidate.id === filter.propertyId)
  const raw = Array.isArray(filter.value) ? filter.value.join(', ') : filter.value
  const value =
    property?.options?.find((option) => option.id === raw)?.name ??
    (typeof raw === 'boolean' ? (raw ? '已勾选' : '未勾选') : String(raw ?? ''))
  return `${property?.name ?? filter.propertyId} · ${value}`
}
