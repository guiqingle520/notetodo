import { useEffect, useState, type ReactNode } from 'react'
import { ArrowUpDown, ChevronDown, ChevronRight, Filter, GripVertical, Layers3, Link2, Plus, Settings2, Sigma, Trash2, X } from 'lucide-react'
import { evaluateFormula, validateFormulaExpression, type DatabaseProperty, type DatabaseRecord, type DatabaseSchema, type DatabaseViewConfig, type FilterRule, type PropertyType, type PropertyValue, type SelectOption, type SortRule } from '@notetodo/database-core'
import { propertyTypeLabel, type RelationTargets } from './DatabaseViews'

const writablePropertyTypes: Array<{ id: Exclude<PropertyType, 'title'>; label: string }> = [
  { id: 'text', label: '文本' }, { id: 'number', label: '数字' }, { id: 'checkbox', label: '复选框' },
  { id: 'select', label: '单选' }, { id: 'multiSelect', label: '多选' }, { id: 'date', label: '日期' }, { id: 'url', label: '网址' },
  { id: 'relation', label: '关联' }, { id: 'rollup', label: '汇总' }, { id: 'formula', label: '公式' },
]

type PropertyConfig = Partial<Pick<DatabaseProperty, 'options' | 'relation' | 'rollup' | 'formula' | 'constraints'>>
type DatabaseSource = { id: string; pageId: string; name: string; pageTitle: string; recordCount: number }

export function SchemaPanel({ schema, previewRecord, databaseSources, relationTargets, onClose, onAdd, onRename, onReorder, onConfigure, onDelete }: {
  schema: DatabaseSchema; previewRecord?: DatabaseRecord; databaseSources: DatabaseSource[]; relationTargets: RelationTargets; onClose: () => void
  onAdd: (name: string, type: Exclude<PropertyType, 'title'>) => Promise<void>; onRename: (propertyId: string, name: string) => Promise<void>; onReorder: (propertyIds: string[]) => Promise<void>
  onConfigure: (propertyId: string, config: PropertyConfig) => Promise<void>; onDelete: (propertyId: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<(typeof writablePropertyTypes)[number]['id']>('text')
  const [busy, setBusy] = useState(false)
  const [deletePending, setDeletePending] = useState<string | null>(null); const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null)
  const [draggingPropertyId, setDraggingPropertyId] = useState<string | null>(null)
  const editingProperty = schema.properties.find((property) => property.id === editingPropertyId)
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if (editingPropertyId) setEditingPropertyId(null); else onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [editingPropertyId, onClose])
  const add = async () => {
    if (!name.trim() || busy || schema.properties.length >= 50) return
    setBusy(true); try { await onAdd(name.trim(), type); setName('') } finally { setBusy(false) }
  }
  const reorder = (targetId: string) => {
    if (!draggingPropertyId || draggingPropertyId === targetId) return
    const ids = schema.properties.map((property) => property.id)
    const from = ids.indexOf(draggingPropertyId); const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0]!)
    setDraggingPropertyId(null); void onReorder(ids)
  }
  return <div className="schema-panel-backdrop" onMouseDown={onClose}><section className={`schema-panel ${editingProperty ? 'is-configuring' : ''}`} role="dialog" aria-modal="true" aria-label="数据库属性管理" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><small>{schema.name}</small><strong>属性</strong></div><button aria-label="关闭属性管理" onClick={onClose}><X size={15} /></button></header>
    <main className="schema-workbench"><section className="schema-ledger"><div className="schema-ledger-head"><span>序号</span><span>属性名称</span><span>类型</span><span>操作</span></div>{schema.properties.map((property, index) => {
      const configurable = true
      return <div className={`schema-ledger-row ${editingPropertyId === property.id ? 'is-selected' : ''} ${draggingPropertyId === property.id ? 'is-dragging' : ''}`} key={property.id} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(property.id)}><em><button draggable aria-label={`拖动排序 ${property.name}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggingPropertyId(property.id) }} onDragEnd={() => setDraggingPropertyId(null)}><GripVertical size={13} /></button>{String(index + 1).padStart(2, '0')}</em><input aria-label={`${property.name} 属性名称`} defaultValue={property.name} maxLength={100} onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== property.name) void onRename(property.id, next) }} /><span><i>{propertyTypeLabel(property.type)}</i>{propertyTypeName(property.type)}</span><div>{configurable && <button aria-label={`配置 ${property.name}`} onClick={() => setEditingPropertyId(property.id)}><Settings2 size={12} /></button>}{property.type === 'title' ? <small>主属性</small> : <button aria-label={`删除属性 ${property.name}`} className={deletePending === property.id ? 'is-confirm' : ''} onClick={() => { if (deletePending !== property.id) { setDeleteError(null); return setDeletePending(property.id) } void onDelete(property.id).then(() => setDeletePending(null)).catch((error) => { setDeletePending(null); setDeleteError(error instanceof Error ? error.message : '无法删除属性。') }) }}><Trash2 size={11} /></button>}</div></div>
    })}</section>{editingProperty && <PropertyConfigEditor key={editingProperty.id} property={editingProperty} schema={schema} previewRecord={previewRecord} databaseSources={databaseSources} relationTargets={relationTargets} onClose={() => setEditingPropertyId(null)} onSave={async (config) => { setBusy(true); try { await onConfigure(editingProperty.id, config); setEditingPropertyId(null) } finally { setBusy(false) } }} />}</main>
    <footer><div><input aria-label="新属性名称" placeholder="属性名称" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add() }} /><select aria-label="新属性类型" value={type} onChange={(event) => setType(event.target.value as typeof type)}>{writablePropertyTypes.map((candidate) => <option disabled={candidate.id === 'rollup' && !schema.properties.some((property) => property.type === 'relation')} key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select><button disabled={!name.trim() || busy || schema.properties.length >= 50 || (type === 'rollup' && !schema.properties.some((property) => property.type === 'relation'))} onClick={() => void add()}><Plus size={12} />{busy ? '添加中' : '添加属性'}</button></div><span className={deleteError ? 'property-config-error' : ''}>{deleteError ?? `${schema.properties.length} / 50 个属性 · 拖动手柄调整顺序 · 标题属性受保护`}</span></footer>
  </section></div>
}

const optionColors: SelectOption['color'][] = ['slate', 'gray', 'brown', 'red', 'orange', 'amber', 'green', 'blue', 'purple', 'pink']
const rollupAggregations: Array<{ id: NonNullable<DatabaseProperty['rollup']>['aggregation']; label: string }> = [
  { id: 'count', label: '计数' }, { id: 'showOriginal', label: '显示原值' }, { id: 'sum', label: '求和' },
  { id: 'average', label: '平均值' }, { id: 'min', label: '最小值' }, { id: 'max', label: '最大值' },
]

function PropertyConfigEditor({ property, schema, previewRecord, databaseSources, relationTargets, onClose, onSave }: { property: DatabaseProperty; schema: DatabaseSchema; previewRecord?: DatabaseRecord; databaseSources: DatabaseSource[]; relationTargets: RelationTargets; onClose: () => void; onSave: (config: PropertyConfig) => Promise<void> }) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [options, setOptions] = useState<SelectOption[]>(() => structuredClone(property.options ?? []))
  const [relationDatabaseId, setRelationDatabaseId] = useState(property.relation?.databaseId ?? schema.id)
  const [reciprocalPropertyId, setReciprocalPropertyId] = useState(property.relation?.reciprocalPropertyId ?? '')
  const [expression, setExpression] = useState(property.formula?.expression ?? '""')
  const derived = ['formula', 'rollup'].includes(property.type)
  const uniqueSupported = !['checkbox', 'multiSelect', 'relation', 'formula', 'rollup'].includes(property.type)
  const [required, setRequired] = useState(property.constraints?.required ?? false)
  const [unique, setUnique] = useState(property.constraints?.unique ?? false)
  const [defaultValue, setDefaultValue] = useState<PropertyValue>(() => property.constraints && Object.hasOwn(property.constraints, 'defaultValue') ? property.constraints.defaultValue ?? null : null)
  const relationProperties = schema.properties.filter((candidate) => candidate.type === 'relation' && candidate.relation)
  const reciprocalProperties = (relationTargets[relationDatabaseId]?.schema.properties ?? []).filter((candidate) => candidate.type === 'relation' && candidate.id !== property.id && candidate.relation?.databaseId === schema.id)
  const [rollupRelationId, setRollupRelationId] = useState(property.rollup?.relationPropertyId ?? relationProperties[0]?.id ?? '')
  const rollupRelation = relationProperties.find((candidate) => candidate.id === rollupRelationId)
  const rollupTarget = rollupRelation ? relationTargets[rollupRelation.relation!.databaseId] : undefined
  const rollupTargetProperties = (rollupTarget?.schema.properties ?? []).filter((candidate) => candidate.id !== property.id && !['formula', 'rollup'].includes(candidate.type))
  const [rollupTargetPropertyId, setRollupTargetPropertyId] = useState(property.rollup?.targetPropertyId ?? rollupTargetProperties[0]?.id ?? '')
  const [rollupAggregation, setRollupAggregation] = useState<NonNullable<DatabaseProperty['rollup']>['aggregation']>(property.rollup?.aggregation ?? 'count')
  const selectedRollupTarget = rollupTargetProperties.find((candidate) => candidate.id === rollupTargetPropertyId)
  const availableRollupAggregations = selectedRollupTarget?.type === 'number' ? rollupAggregations : rollupAggregations.filter((candidate) => ['count', 'showOriginal'].includes(candidate.id))
  const [busy, setBusy] = useState(false)
  const validFormula = property.type !== 'formula' || validateFormulaExpression(expression)
  const duplicateOption = options.some((option, index) => options.findIndex((candidate) => candidate.name.trim().toLocaleLowerCase() === option.name.trim().toLocaleLowerCase()) !== index || !option.name.trim())
  const save = async () => {
    const base: PropertyConfig = ['select', 'multiSelect'].includes(property.type) ? { options } : property.type === 'relation' ? { relation: { databaseId: relationDatabaseId, ...(reciprocalPropertyId ? { reciprocalPropertyId } : {}) } } : property.type === 'rollup' ? { rollup: { relationPropertyId: rollupRelationId, targetPropertyId: rollupTargetPropertyId, aggregation: rollupAggregation } } : property.type === 'formula' ? { formula: { expression: expression.trim() } } : {}
    const constraints = { ...(required ? { required: true } : {}), ...(unique ? { unique: true } : {}), ...(!isEmptyConstraintValue(defaultValue) ? { defaultValue } : {}) }
    const config: PropertyConfig = derived ? base : { ...base, ...(Object.keys(constraints).length || property.constraints ? { constraints } : {}) }
    setBusy(true); setSaveError(null); try { await onSave(config) } catch (error) { setSaveError(error instanceof Error ? error.message : '无法保存属性配置。') } finally { setBusy(false) }
  }
  const previewValues = { ...(previewRecord?.values ?? {}) }
  for (const candidate of schema.properties) previewValues[candidate.name] = previewRecord?.values[candidate.id] ?? null
  const preview = property.type === 'formula' ? evaluateFormula(expression, previewValues) : null
  const rollupPreview = previewRollup(previewRecord, rollupRelation, rollupTarget, rollupTargetPropertyId, rollupAggregation)
  return <aside className="property-config-editor" aria-label={`${property.name} 属性配置`}>
    <header><div><i>{propertyTypeLabel(property.type)}</i><span><small>{propertyTypeName(property.type).toLocaleUpperCase()} PROPERTY</small><strong>{property.name}</strong></span></div><button aria-label="关闭属性配置" onClick={onClose}><X size={14} /></button></header>
    {['select', 'multiSelect'].includes(property.type) && <div className="option-config"><p>选项会立即用于表格、筛选和分组。拖动排序将在下一阶段开放。</p>{options.map((option, index) => <div className="option-config-row" key={option.id}><span className={`option-swatch color-${option.color}`} /><input aria-label={`选项 ${index + 1} 名称`} maxLength={100} value={option.name} onChange={(event) => setOptions((current) => current.map((candidate, position) => position === index ? { ...candidate, name: event.target.value } : candidate))} /><details><summary aria-label={`选项 ${index + 1} 颜色`} className={`color-${option.color}`} /><div>{optionColors.map((color) => <button aria-label={`颜色 ${color}`} className={`color-${color}`} key={color} onClick={() => setOptions((current) => current.map((candidate, position) => position === index ? { ...candidate, color } : candidate))} />)}</div></details><button aria-label={`删除选项 ${option.name}`} onClick={() => setOptions((current) => current.filter((_, position) => position !== index))}><Trash2 size={12} /></button></div>)}<button className="option-add" disabled={options.length >= 100} onClick={() => setOptions((current) => [...current, { id: crypto.randomUUID(), name: `选项 ${current.length + 1}`, color: optionColors[current.length % optionColors.length]! }])}><Plus size={13} />添加选项</button>{duplicateOption && <small className="property-config-error">选项名称不能为空或重复。</small>}</div>}
    {property.type === 'relation' && <div className="relation-config"><p>选择目标数据库；绑定反向属性后，两侧记录会在同一事务内自动同步。</p><label><span>目标数据库</span><select aria-label="关联目标数据库" value={relationDatabaseId} onChange={(event) => { setRelationDatabaseId(event.target.value); setReciprocalPropertyId('') }}>{databaseSources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.recordCount} 条</option>)}</select></label><label><span>反向关联</span><select aria-label="反向关联属性" value={reciprocalPropertyId} onChange={(event) => setReciprocalPropertyId(event.target.value)}><option value="">单向关联</option>{reciprocalProperties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><div className="relation-preview"><Link2 size={15} /><span><small>{reciprocalPropertyId ? 'TWO-WAY RELATION' : 'ONE-WAY RELATION'}</small><strong>{databaseSources.find((source) => source.id === relationDatabaseId)?.pageTitle ?? schema.name}</strong></span></div></div>}
    {property.type === 'rollup' && <div className="rollup-config"><p>先沿关联属性找到记录，再选择目标属性与计算方式。汇总结果始终只读。</p><label><span>关联属性</span><select aria-label="汇总关联属性" value={rollupRelationId} onChange={(event) => { const relationId = event.target.value; const relation = relationProperties.find((candidate) => candidate.id === relationId); const targets = relation ? relationTargets[relation.relation!.databaseId]?.schema.properties.filter((candidate) => !['formula', 'rollup'].includes(candidate.type)) ?? [] : []; setRollupRelationId(relationId); setRollupTargetPropertyId(targets[0]?.id ?? ''); setRollupAggregation('count') }}>{relationProperties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><label><span>目标属性</span><select aria-label="汇总目标属性" value={rollupTargetPropertyId} onChange={(event) => { const targetId = event.target.value; setRollupTargetPropertyId(targetId); if (rollupTargetProperties.find((candidate) => candidate.id === targetId)?.type !== 'number') setRollupAggregation('count') }}>{rollupTargetProperties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {propertyTypeName(candidate.type)}</option>)}</select></label><label><span>计算方式</span><select aria-label="汇总计算方式" value={rollupAggregation} onChange={(event) => setRollupAggregation(event.target.value as typeof rollupAggregation)}>{availableRollupAggregations.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></label><div className="rollup-preview"><Sigma size={15} /><span><small>当前记录预览</small><strong>{formatPropertyValue(rollupPreview) || '—'}</strong></span></div></div>}
    {property.type === 'formula' && <div className="formula-config"><p>使用属性名称，例如 <code>[评分] * 2</code>。支持 if、concat、round、min、max 与基础运算。</p><textarea aria-label="公式表达式" spellCheck={false} value={expression} onChange={(event) => setExpression(event.target.value)} /><div className="formula-token-list"><small>插入属性</small>{schema.properties.filter((candidate) => candidate.id !== property.id && candidate.type !== 'formula').map((candidate) => <button key={candidate.id} onClick={() => setExpression((current) => `${current}${current && !/\s$/u.test(current) ? ' ' : ''}[${candidate.name}]`)}>{candidate.name}</button>)}</div><div className={`formula-preview ${validFormula ? '' : 'is-error'}`}><Sigma size={15} /><span><small>{validFormula ? '当前记录预览' : '表达式不完整'}</small><strong>{validFormula ? formatPropertyValue(preview) || '—' : '检查括号、引号或运算符'}</strong></span></div></div>}
    {!derived && <div className="constraint-config"><p>约束会同时应用于编辑、批量操作、模板和 CSV 导入。</p><div className="constraint-switches"><button className={required ? 'is-active' : ''} onClick={() => { setRequired((value) => !value); setUnique(false) }}><span>必填</span><small>不允许留空</small></button><button disabled={!uniqueSupported} className={unique ? 'is-active' : ''} onClick={() => { setUnique((value) => !value); setRequired(false); setDefaultValue(null) }}><span>唯一值</span><small>{uniqueSupported ? '数据库内不可重复' : '此类型不支持'}</small></button></div><label><span>新记录默认值</span><ConstraintDefaultInput property={property} value={defaultValue} onChange={setDefaultValue} disabled={unique} /></label>{required && isEmptyConstraintValue(defaultValue) && <small className="property-config-error">必填属性需要设置默认值，确保新记录可以安全创建。</small>}{saveError && <small className="property-config-error">{saveError}</small>}</div>}
    <footer><button onClick={onClose}>取消</button><button disabled={busy || duplicateOption || !validFormula || (required && isEmptyConstraintValue(defaultValue)) || (property.type === 'relation' && !relationDatabaseId) || (property.type === 'rollup' && (!rollupRelationId || !rollupTargetPropertyId))} onClick={() => void save()}>{busy ? '保存中…' : '保存配置'}</button></footer>
  </aside>
}

function ConstraintDefaultInput({ property, value, onChange, disabled = false }: { property: DatabaseProperty; value: PropertyValue; onChange: (value: PropertyValue) => void; disabled?: boolean }) {
  if (property.type === 'checkbox') return <button disabled={disabled} type="button" className={`constraint-checkbox ${value ? 'is-active' : ''}`} onClick={() => onChange(!value)}>{value ? '默认勾选' : '默认不勾选'}</button>
  if (property.type === 'select') return <select disabled={disabled} aria-label="属性默认值" value={String(value ?? '')} onChange={(event) => onChange(event.target.value || null)}><option value="">无默认值</option>{property.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
  if (property.type === 'multiSelect') return <input disabled={disabled} aria-label="属性默认值" placeholder="多个值用逗号分隔" value={Array.isArray(value) ? value.join(', ') : ''} onChange={(event) => onChange(event.target.value.split(/[,，]/u).map((item) => item.trim()).filter(Boolean))} />
  return <input disabled={disabled} aria-label="属性默认值" type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'url' ? 'url' : 'text'} placeholder={disabled ? '唯一值不使用默认值' : '无默认值'} value={String(value ?? '')} onChange={(event) => onChange(property.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value || null)} />
}

function isEmptyConstraintValue(value: PropertyValue) {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function previewRollup(record: DatabaseRecord | undefined, relation: DatabaseProperty | undefined, target: RelationTargets[string] | undefined, targetPropertyId: string, aggregation: NonNullable<DatabaseProperty['rollup']>['aggregation']): PropertyValue {
  const relatedIds = relation && record?.values[relation.id]
  if (!Array.isArray(relatedIds) || !target) return aggregation === 'count' ? 0 : null
  const byId = new Map(target.records.map((candidate) => [candidate.id, candidate]))
  const values = relatedIds.map((id) => byId.get(id)?.values[targetPropertyId] ?? null).filter((value) => value !== null)
  if (aggregation === 'count') return values.length
  if (aggregation === 'showOriginal') return values.flatMap((value) => Array.isArray(value) ? value : [String(value)])
  const numbers = values.map(Number).filter(Number.isFinite)
  if (!numbers.length) return null
  if (aggregation === 'sum') return numbers.reduce((sum, value) => sum + value, 0)
  if (aggregation === 'average') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  return aggregation === 'min' ? Math.min(...numbers) : Math.max(...numbers)
}

export function propertyTypeName(type: PropertyType) {
  return ({ title: '标题', text: '文本', number: '数字', checkbox: '复选框', select: '单选', multiSelect: '多选', date: '日期', url: '网址', relation: '关联', rollup: '汇总', formula: '公式' } as const)[type]
}

export function ViewRuleSummary({ config, schema, onOpen }: { config: DatabaseViewConfig; schema: DatabaseSchema; onOpen: (tab: 'filters' | 'sorts' | 'group') => void }) {
  if (!config.filters?.length && !config.sorts?.length && !config.groupByPropertyId) return null
  return <div className="view-rule-summary">
    <span>已保存视图</span>
    {config.filters?.length ? <button onClick={() => onOpen('filters')}><Filter size={10} />{config.filters.length} 条筛选 · {config.filterMode === 'or' ? '任一' : '全部'}</button> : null}
    {config.sorts?.length ? <button onClick={() => onOpen('sorts')}><ArrowUpDown size={10} />{config.sorts.map((sort) => propertyName(schema.properties, sort.propertyId)).join(' → ')}</button> : null}
    {config.groupByPropertyId ? <button onClick={() => onOpen('group')}><Layers3 size={10} />按 {propertyName(schema.properties, config.groupByPropertyId)} 分组</button> : null}
  </div>
}

export function ViewRulesPanel({ schema, config, initialTab, onClose, onSave }: { schema: DatabaseSchema; config: DatabaseViewConfig; initialTab: 'filters' | 'sorts' | 'group'; onClose: () => void; onSave: (config: DatabaseViewConfig) => void }) {
  const [tab, setTab] = useState(initialTab)
  const [draft, setDraft] = useState<DatabaseViewConfig>(() => structuredClone(config))
  const filters = draft.filters ?? []; const sorts = draft.sorts ?? []
  const defaultProperty = schema.properties.find((property) => property.type === 'select') ?? schema.properties[0]!
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape) }, [onClose])
  const setFilter = (index: number, patch: Partial<FilterRule>) => setDraft((current) => ({ ...current, filters: (current.filters ?? []).map((rule, candidate) => candidate === index ? { ...rule, ...patch } : rule) }))
  const addFilter = () => setDraft((current) => ({ ...current, filters: [...(current.filters ?? []), { propertyId: defaultProperty.id, operator: 'equals', value: defaultFilterValue(defaultProperty) }] }))
  const addSort = () => {
    const property = schema.properties.find((candidate) => !sorts.some((sort) => sort.propertyId === candidate.id))
    if (property) setDraft((current) => ({ ...current, sorts: [...(current.sorts ?? []), { propertyId: property.id, direction: 'asc' }] }))
  }
  return <div className="view-rules-backdrop" onMouseDown={onClose}>
    <section className="view-rules-panel" role="dialog" aria-modal="true" aria-label="视图规则工作台" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>{schema.name}</small><strong>筛选、排序与分组</strong></div><button aria-label="关闭视图规则" onClick={onClose}><X size={15} /></button></header>
      <nav>{(['filters', 'sorts', 'group'] as const).map((item) => <button className={tab === item ? 'is-active' : ''} key={item} onClick={() => setTab(item)}>{item === 'filters' ? <Filter size={12} /> : item === 'sorts' ? <ArrowUpDown size={12} /> : <Layers3 size={12} />}{item === 'filters' ? `筛选 ${filters.length}` : item === 'sorts' ? `排序 ${sorts.length}` : '分组'}</button>)}</nav>
      <main>
        {tab === 'filters' && <><div className="rule-logic"><span>显示满足</span><button className={draft.filterMode !== 'or' ? 'is-active' : ''} onClick={() => setDraft({ ...draft, filterMode: 'and' })}>全部条件</button><button className={draft.filterMode === 'or' ? 'is-active' : ''} onClick={() => setDraft({ ...draft, filterMode: 'or' })}>任一条件</button></div><div className="rule-stack">{filters.map((rule, index) => {
          const property = schema.properties.find((candidate) => candidate.id === rule.propertyId) ?? defaultProperty
          return <div className="filter-rule" key={`${index}-${rule.propertyId}`}><em>{String(index + 1).padStart(2, '0')}</em><select aria-label={`筛选 ${index + 1} 属性`} value={rule.propertyId} onChange={(event) => { const nextProperty = schema.properties.find((candidate) => candidate.id === event.target.value)!; setFilter(index, { propertyId: nextProperty.id, value: defaultFilterValue(nextProperty) }) }}>{schema.properties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select aria-label={`筛选 ${index + 1} 条件`} value={rule.operator} onChange={(event) => setFilter(index, { operator: event.target.value as FilterRule['operator'] })}>{filterOperators.map((operator) => <option key={operator.id} value={operator.id}>{operator.label}</option>)}</select>{!['isEmpty', 'isNotEmpty'].includes(rule.operator) && <FilterValueInput property={property} value={rule.value} onChange={(value) => setFilter(index, { value })} />}<button aria-label={`删除筛选 ${index + 1}`} onClick={() => setDraft({ ...draft, filters: filters.filter((_, candidate) => candidate !== index) })}><Trash2 size={12} /></button></div>
        })}{!filters.length && <RuleEmpty icon={<Filter size={18} />} title="还没有筛选条件" detail="添加条件后，结果会即时按保存视图恢复。" />}</div><button className="rule-add" disabled={filters.length >= 20} onClick={addFilter}><Plus size={12} />添加条件</button></>}
        {tab === 'sorts' && <><div className="rule-intro"><strong>排序优先级</strong><span>从上到下依次比较；同值记录保持原有顺序。</span></div><div className="rule-stack">{sorts.map((sort, index) => <div className="sort-rule" key={sort.propertyId}><em>{String(index + 1).padStart(2, '0')}</em><select aria-label={`排序 ${index + 1} 属性`} value={sort.propertyId} onChange={(event) => setDraft({ ...draft, sorts: sorts.map((candidate, position) => position === index ? { ...candidate, propertyId: event.target.value } : candidate) })}>{schema.properties.map((property) => <option disabled={sorts.some((candidate, position) => position !== index && candidate.propertyId === property.id)} key={property.id} value={property.id}>{property.name}</option>)}</select><select aria-label={`排序 ${index + 1} 方向`} value={sort.direction} onChange={(event) => setDraft({ ...draft, sorts: sorts.map((candidate, position) => position === index ? { ...candidate, direction: event.target.value as SortRule['direction'] } : candidate) })}><option value="asc">升序 / A→Z</option><option value="desc">降序 / Z→A</option></select><button aria-label={`删除排序 ${index + 1}`} onClick={() => setDraft({ ...draft, sorts: sorts.filter((_, candidate) => candidate !== index) })}><Trash2 size={12} /></button></div>)}{!sorts.length && <RuleEmpty icon={<ArrowUpDown size={18} />} title="保留数据库原始顺序" detail="可叠加最多 10 个稳定排序键。" />}</div><button className="rule-add" disabled={sorts.length >= Math.min(10, schema.properties.length)} onClick={addSort}><Plus size={12} />添加排序</button></>}
        {tab === 'group' && <div className="group-rule"><div><Layers3 size={19} /><span><strong>分组目录</strong><small>视图会按属性聚拢记录，并显示每组数量。</small></span></div><label><span>分组依据</span><select value={draft.groupByPropertyId ?? ''} onChange={(event) => setDraft({ ...draft, groupByPropertyId: event.target.value || undefined, collapsedGroupKeys: [] })}><option value="">不分组</option>{schema.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><p>空值进入“未填写”；多选与关联属性可让记录出现在多个分组。最多生成 100 个分组，其余收纳到“其他”。</p></div>}
      </main>
      <footer><span>{filters.length} FILTERS / {sorts.length} SORTS / {draft.groupByPropertyId ? 'GROUPED' : 'FLAT'}</span><div><button onClick={onClose}>取消</button><button onClick={() => onSave(draft)}>保存到当前视图</button></div></footer>
    </section>
  </div>
}

function FilterValueInput({ property, value, onChange }: { property: DatabaseProperty; value: PropertyValue | undefined; onChange: (value: PropertyValue) => void }) {
  if (property.type === 'select' && property.options?.length) return <select aria-label="筛选值" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>{property.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
  return <input aria-label="筛选值" type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'} value={Array.isArray(value) ? value.join(', ') : String(value ?? '')} onChange={(event) => onChange(property.type === 'number' ? Number(event.target.value) : ['multiSelect', 'relation'].includes(property.type) ? event.target.value.split(',').map((item) => item.trim()).filter(Boolean) : event.target.value)} />
}

function RuleEmpty({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) { return <div className="rule-empty">{icon}<strong>{title}</strong><span>{detail}</span></div> }
const filterOperators: Array<{ id: FilterRule['operator']; label: string }> = [{ id: 'equals', label: '等于' }, { id: 'notEquals', label: '不等于' }, { id: 'contains', label: '包含' }, { id: 'isEmpty', label: '为空' }, { id: 'isNotEmpty', label: '不为空' }, { id: 'greaterThan', label: '大于' }, { id: 'lessThan', label: '小于' }]
function defaultFilterValue(property: DatabaseProperty): PropertyValue { return property.type === 'select' ? property.options?.[0]?.id ?? '' : property.type === 'number' ? 0 : ['multiSelect', 'relation'].includes(property.type) ? [] : '' }
function displayGroupLabel(value: string, schema: DatabaseSchema, propertyId?: string) { const property = schema.properties.find((candidate) => candidate.id === propertyId); return property?.options?.find((option) => option.id === value)?.name ?? value }

export function GroupLedger({ groups, schema, propertyId, collapsedKeys, onToggle }: { groups: Array<{ key: string; label: string; records: DatabaseRecord[] }>; schema: DatabaseSchema; propertyId?: string; collapsedKeys: ReadonlySet<string>; onToggle: (groupKey: string) => void }) {
  return <div className="database-group-ledger"><span>分组</span>{groups.map((group) => {
    const collapsed = collapsedKeys.has(group.key)
    const label = displayGroupLabel(group.label, schema, propertyId)
    return <button aria-expanded={!collapsed} aria-label={`${collapsed ? '展开' : '折叠'}分组 ${label}`} className={collapsed ? 'is-collapsed' : ''} key={group.key} onClick={() => onToggle(group.key)}>{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<strong>{label}</strong><em>{group.records.length}</em></button>
  })}</div>
}
function propertyName(properties: DatabaseProperty[], id: string) { return properties.find((property) => property.id === id)?.name ?? id }
function formatPropertyValue(value: PropertyValue | undefined) { return Array.isArray(value) ? value.join('、') : value === null || value === undefined || value === '' ? '' : String(value) }
