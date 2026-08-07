import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Activity, ArrowRight, ArrowUpDown, CalendarDays, ChartNoAxesGantt, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Columns3, Filter, Images, Layers3, Link2, List, Plus, RotateCcw, Sigma, Table2, Trash2, X, Zap } from 'lucide-react'
import { buildCalendarMonth, groupRecordsByDate, groupRecordsByProperty, layoutTimelineRecords, normalizeViewConfig, prepareGalleryRecords, queryRecords, resolveDerivedRecordsIncremental, safeGalleryCover, timelineDays, virtualWindow, type DatabaseProperty, type DatabaseRecord, type DatabaseSchema, type DatabaseSnapshot, type DatabaseViewConfig, type FilterRule, type PropertyValue, type SortRule } from '@notetodo/database-core'
import type { AutomationRule, AutomationValue } from '@notetodo/automation-core'
import { databaseRepository } from './data/database-repository'

const ROW_HEIGHT = 42
const VIEWPORT_HEIGHT = 336
const OVERSCAN = 5
const LIST_ROW_HEIGHT = 43
const BOARD_CARD_HEIGHT = 122
const statuses = [
  { id: 'todo', label: '待开始' },
  { id: 'doing', label: '进行中' },
  { id: 'done', label: '已完成' },
]
type AutomationRun = Awaited<ReturnType<NonNullable<typeof window.notetodo>['automations']['listRuns']>>[number]
const previewAutomation: AutomationRule = { id: 'completed-task-priority', name: '完成后归档优先级', enabled: true, trigger: { type: 'propertyChanged', propertyId: 'task-status' }, condition: { propertyId: 'task-status', operator: 'equals', value: 'done' }, actions: [{ type: 'setProperty', propertyId: 'task-score', value: 1 }] }

export function DatabaseBlock({ pageId }: { pageId: string }) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null>(null)
  const [rulesOpen, setRulesOpen] = useState<'filters' | 'sorts' | 'group' | null>(null)
  const [automationOpen, setAutomationOpen] = useState(false)
  const [automations, setAutomations] = useState<AutomationRule[]>([])
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([])
  const projectionCache = useRef<{ schemaId: string; records: DatabaseRecord[] }>({ schemaId: '', records: [] })
  const changedRecordIds = useRef(new Set<string>())

  useEffect(() => { void databaseRepository.loadByPage(pageId).then(setSnapshot) }, [pageId])
  useEffect(() => {
    if (!snapshot) return
    if (window.notetodo?.automations) void Promise.all([window.notetodo.automations.list(snapshot.schema.id), window.notetodo.automations.listRuns(snapshot.schema.id)]).then(([rules, runs]) => { setAutomations(rules); setAutomationRuns(runs) })
    else setAutomations([previewAutomation])
  }, [snapshot?.schema.id])

  // Rollups and formulas are computed once per snapshot, never persisted back.
  // This keeps sort/filter cheap while making every view consume identical data.
  const projection = useMemo(() => {
    if (!snapshot) return { records: [], recomputedCount: 0 }
    const previous = projectionCache.current.schemaId === snapshot.schema.id ? projectionCache.current.records : undefined
    const result = resolveDerivedRecordsIncremental(snapshot.schema, snapshot.records, previous, changedRecordIds.current)
    projectionCache.current = { schemaId: snapshot.schema.id, records: result.records }
    changedRecordIds.current.clear()
    return result
  }, [snapshot])
  const derivedRecords = projection.records
  const activeView = snapshot ? snapshot.views.find((view) => view.id === snapshot.activeViewId) ?? snapshot.views[0] : undefined
  const queriedRecords = useMemo(() => snapshot && activeView ? queryRecords(
    derivedRecords,
    activeView.config.filters,
    activeView.config.sorts,
    activeView.config.filterMode,
  ) : [], [snapshot, activeView, derivedRecords])
  const recordGroups = useMemo(() => activeView?.config.groupByPropertyId ? groupRecordsByProperty(queriedRecords, activeView.config.groupByPropertyId) : [], [queriedRecords, activeView])
  const records = recordGroups.length ? recordGroups.flatMap((group) => group.records) : queriedRecords

  if (!snapshot || !activeView) return <div className="database-loading">正在打开本地数据库…</div>

  const updateCell = (recordId: string, propertyId: string, value: PropertyValue) => {
    const sourceRecord = snapshot.records.find((record) => record.id === recordId)
    if (!sourceRecord) return
    const editedRecord = { ...sourceRecord, values: { ...sourceRecord.values, [propertyId]: value }, updatedAt: new Date().toISOString() }
    const next: DatabaseSnapshot = {
      ...snapshot,
      records: snapshot.records.map((record) => record.id === recordId
        ? editedRecord
        : record),
    }
    changedRecordIds.current.add(recordId)
    setSnapshot(next)
    void databaseRepository.updateCell(next, recordId, propertyId, value).then(async (result) => {
      // Desktop automation runs in the same SQLite transaction as the user's
      // edit. Reload only when a rule actually ran so normal typing stays cheap.
      if (result?.automationRuns?.length) setSnapshot(await databaseRepository.loadByPage(pageId))
      if (result?.automationRuns?.length && window.notetodo?.automations) setAutomationRuns(await window.notetodo.automations.listRuns(snapshot.schema.id))
    })
  }

  const addRecord = () => {
    const id = crypto.randomUUID()
    const record: DatabaseRecord = {
      id,
      values: { 'task-title': '新任务', 'task-status': 'todo', 'task-owner': '', 'task-start': new Date().toISOString().slice(0, 10), 'task-due': '', 'task-score': 1, 'task-dependencies': [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const next = { ...snapshot, records: [...snapshot.records, record] }
    setSnapshot(next)
    void databaseRepository.createRecord(next, id)
    for (const [propertyId, value] of Object.entries(record.values)) void databaseRepository.updateCell(next, id, propertyId, value)
  }

  const setView = (viewId: string) => {
    const next = { ...snapshot, activeViewId: viewId }
    setSnapshot(next)
    void databaseRepository.setActiveView(next, viewId)
  }

  const saveViewConfig = (config: DatabaseViewConfig) => {
    const normalized = normalizeViewConfig(snapshot.schema, config)
    const next = { ...snapshot, views: snapshot.views.map((view) => view.id === activeView.id ? { ...view, config: normalized } : view) }
    setSnapshot(next)
    void databaseRepository.updateViewConfig(next, activeView.id, normalized)
  }

  return (
    <section className="database-block">
      <div className="database-viewbar">
        <div className="database-tabs">
          {snapshot.views.map((view) => {
            const Icon = view.type === 'table' ? Table2 : view.type === 'board' ? Columns3 : view.type === 'calendar' ? CalendarDays : view.type === 'timeline' ? ChartNoAxesGantt : view.type === 'gallery' ? Images : List
            return <button className={view.id === activeView.id ? 'is-active' : ''} key={view.id} onClick={() => setView(view.id)}><Icon size={13} />{view.name}</button>
          })}
        </div>
        <div className="database-tools">
          <button className={activeView.config.filters?.length ? 'is-active' : ''} onClick={() => setRulesOpen('filters')}><Filter size={13} />筛选{activeView.config.filters?.length ? ` · ${activeView.config.filters.length}` : ''}</button>
          <button className={activeView.config.sorts?.length ? 'is-active' : ''} onClick={() => setRulesOpen('sorts')}><ArrowUpDown size={13} />排序{activeView.config.sorts?.length ? ` · ${activeView.config.sorts.length}` : ''}</button>
          <button className={activeView.config.groupByPropertyId ? 'is-active' : ''} onClick={() => setRulesOpen('group')}><Layers3 size={13} />分组</button>
          <button className="database-automation" onClick={() => setAutomationOpen(true)}><Zap size={13} />自动化 · {automations.filter((rule) => rule.enabled).length}</button>
          <button className="database-new" onClick={addRecord}><Plus size={13} />新建</button>
        </div>
      </div>
      <div className="database-summary"><span>{snapshot.schema.name.toLocaleUpperCase()}</span><span className="database-compute-mark">Δ {projection.recomputedCount} RECALCULATED</span><span>{records.length} / {snapshot.records.length} RECORDS</span></div>
      <ViewRuleSummary config={activeView.config} schema={snapshot.schema} onOpen={setRulesOpen} />
      {recordGroups.length > 0 && <div className="database-group-ledger"><span>GROUP LEDGER</span>{recordGroups.map((group) => <div key={group.key}><strong>{displayGroupLabel(group.label, snapshot.schema, activeView.config.groupByPropertyId)}</strong><em>{group.records.length}</em></div>)}</div>}
      {activeView.type === 'table' && <VirtualTable records={records} allRecords={derivedRecords} updateCell={updateCell} />}
      {activeView.type === 'board' && <BoardView records={records} updateCell={updateCell} />}
      {activeView.type === 'list' && <ListView records={records} updateCell={updateCell} />}
      {activeView.type === 'calendar' && <CalendarView records={records} schema={snapshot.schema} datePropertyId={activeView.config.datePropertyId} updateCell={updateCell} />}
      {activeView.type === 'timeline' && <TimelineView records={records} schema={snapshot.schema} startDatePropertyId={activeView.config.startDatePropertyId} endDatePropertyId={activeView.config.endDatePropertyId} updateCell={updateCell} />}
      {activeView.type === 'gallery' && <GalleryView records={records} schema={snapshot.schema} coverPropertyId={activeView.config.coverPropertyId} visiblePropertyIds={activeView.config.visiblePropertyIds} cardSize={activeView.config.cardSize} updateCell={updateCell} />}
      {rulesOpen && createPortal(<ViewRulesPanel schema={snapshot.schema} config={activeView.config} initialTab={rulesOpen} onClose={() => setRulesOpen(null)} onSave={(config) => { saveViewConfig(config); setRulesOpen(null) }} />, document.body)}
      {automationOpen && <AutomationPanel schema={snapshot.schema} rules={automations} runs={automationRuns} onClose={() => setAutomationOpen(false)} onSave={async (rule) => {
        if (window.notetodo?.automations) { await window.notetodo.automations.save(snapshot.schema.id, rule); setAutomations(await window.notetodo.automations.list(snapshot.schema.id)) }
        else setAutomations((current) => [...current.filter((item) => item.id !== rule.id), rule])
      }} onToggle={async (rule) => {
        if (window.notetodo?.automations) { await window.notetodo.automations.setEnabled(rule.id, !rule.enabled); setAutomations(await window.notetodo.automations.list(snapshot.schema.id)) }
        else setAutomations((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))
      }} onReplay={async (runId) => {
        if (!window.notetodo?.automations) return
        await window.notetodo.automations.replay(runId)
        setAutomationRuns(await window.notetodo.automations.listRuns(snapshot.schema.id))
        setSnapshot(await databaseRepository.loadByPage(pageId))
      }} />}
    </section>
  )
}

function ViewRuleSummary({ config, schema, onOpen }: { config: DatabaseViewConfig; schema: DatabaseSchema; onOpen: (tab: 'filters' | 'sorts' | 'group') => void }) {
  if (!config.filters?.length && !config.sorts?.length && !config.groupByPropertyId) return null
  return <div className="view-rule-summary">
    <span>SAVED VIEW</span>
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
      <header><div><small>VIEW COMPOSITOR / {schema.name.toLocaleUpperCase()}</small><strong>把视图排成一句话</strong></div><button aria-label="关闭视图规则" onClick={onClose}><X size={15} /></button></header>
      <nav>{(['filters', 'sorts', 'group'] as const).map((item) => <button className={tab === item ? 'is-active' : ''} key={item} onClick={() => setTab(item)}>{item === 'filters' ? <Filter size={12} /> : item === 'sorts' ? <ArrowUpDown size={12} /> : <Layers3 size={12} />}{item === 'filters' ? `筛选 ${filters.length}` : item === 'sorts' ? `排序 ${sorts.length}` : '分组'}</button>)}</nav>
      <main>
        {tab === 'filters' && <><div className="rule-logic"><span>显示满足</span><button className={draft.filterMode !== 'or' ? 'is-active' : ''} onClick={() => setDraft({ ...draft, filterMode: 'and' })}>全部条件</button><button className={draft.filterMode === 'or' ? 'is-active' : ''} onClick={() => setDraft({ ...draft, filterMode: 'or' })}>任一条件</button></div><div className="rule-stack">{filters.map((rule, index) => {
          const property = schema.properties.find((candidate) => candidate.id === rule.propertyId) ?? defaultProperty
          return <div className="filter-rule" key={`${index}-${rule.propertyId}`}><em>{String(index + 1).padStart(2, '0')}</em><select aria-label={`筛选 ${index + 1} 属性`} value={rule.propertyId} onChange={(event) => { const nextProperty = schema.properties.find((candidate) => candidate.id === event.target.value)!; setFilter(index, { propertyId: nextProperty.id, value: defaultFilterValue(nextProperty) }) }}>{schema.properties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><select aria-label={`筛选 ${index + 1} 条件`} value={rule.operator} onChange={(event) => setFilter(index, { operator: event.target.value as FilterRule['operator'] })}>{filterOperators.map((operator) => <option key={operator.id} value={operator.id}>{operator.label}</option>)}</select>{!['isEmpty', 'isNotEmpty'].includes(rule.operator) && <FilterValueInput property={property} value={rule.value} onChange={(value) => setFilter(index, { value })} />}<button aria-label={`删除筛选 ${index + 1}`} onClick={() => setDraft({ ...draft, filters: filters.filter((_, candidate) => candidate !== index) })}><Trash2 size={12} /></button></div>
        })}{!filters.length && <RuleEmpty icon={<Filter size={18} />} title="还没有筛选条件" detail="添加条件后，结果会即时按保存视图恢复。" />}</div><button className="rule-add" disabled={filters.length >= 20} onClick={addFilter}><Plus size={12} />添加条件</button></>}
        {tab === 'sorts' && <><div className="rule-intro"><strong>排序优先级</strong><span>从上到下依次比较；同值记录保持原有顺序。</span></div><div className="rule-stack">{sorts.map((sort, index) => <div className="sort-rule" key={sort.propertyId}><em>{String(index + 1).padStart(2, '0')}</em><select aria-label={`排序 ${index + 1} 属性`} value={sort.propertyId} onChange={(event) => setDraft({ ...draft, sorts: sorts.map((candidate, position) => position === index ? { ...candidate, propertyId: event.target.value } : candidate) })}>{schema.properties.map((property) => <option disabled={sorts.some((candidate, position) => position !== index && candidate.propertyId === property.id)} key={property.id} value={property.id}>{property.name}</option>)}</select><select aria-label={`排序 ${index + 1} 方向`} value={sort.direction} onChange={(event) => setDraft({ ...draft, sorts: sorts.map((candidate, position) => position === index ? { ...candidate, direction: event.target.value as SortRule['direction'] } : candidate) })}><option value="asc">升序 / A→Z</option><option value="desc">降序 / Z→A</option></select><button aria-label={`删除排序 ${index + 1}`} onClick={() => setDraft({ ...draft, sorts: sorts.filter((_, candidate) => candidate !== index) })}><Trash2 size={12} /></button></div>)}{!sorts.length && <RuleEmpty icon={<ArrowUpDown size={18} />} title="保留数据库原始顺序" detail="可叠加最多 10 个稳定排序键。" />}</div><button className="rule-add" disabled={sorts.length >= Math.min(10, schema.properties.length)} onClick={addSort}><Plus size={12} />添加排序</button></>}
        {tab === 'group' && <div className="group-rule"><div><Layers3 size={19} /><span><strong>分组目录</strong><small>视图会按属性聚拢记录，并显示每组数量。</small></span></div><label><span>分组依据</span><select value={draft.groupByPropertyId ?? ''} onChange={(event) => setDraft({ ...draft, groupByPropertyId: event.target.value || undefined })}><option value="">不分组</option>{schema.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><p>空值进入“未填写”；多选与关联属性可让记录出现在多个分组。最多生成 100 个分组，其余收纳到“其他”。</p></div>}
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

export function GalleryView({ records, schema, coverPropertyId, visiblePropertyIds, cardSize = 'medium', updateCell }: { records: DatabaseRecord[]; schema: DatabaseSchema; coverPropertyId?: string; visiblePropertyIds?: string[]; cardSize?: 'small' | 'medium' | 'large'; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const titleProperty = schema.properties.find((property) => property.type === 'title')
  const statusProperty = schema.properties.find((property) => property.id === 'task-status' && property.type === 'select') ?? schema.properties.find((property) => property.type === 'select')
  const metadata = (visiblePropertyIds ?? []).map((id) => schema.properties.find((property) => property.id === id)).filter((property): property is DatabaseProperty => Boolean(property && property.id !== statusProperty?.id)).slice(0, 3)
  const gallery = useMemo(() => prepareGalleryRecords(records), [records])

  if (!titleProperty) return <div className="gallery-missing"><Images size={22} /><strong>需要标题属性</strong><span>Gallery 视图使用标题属性生成卡片。</span></div>
  return <div className={`database-gallery size-${cardSize}`}>
    <header className="gallery-masthead"><div><small>PROJECT CONTACT SHEET / {String(gallery.records.length).padStart(2, '0')}</small><strong>把工作摊开来看</strong></div><p>以卡片浏览项目脉络；封面缺失时使用稳定的本地生成图形。</p></header>
    <div className="gallery-grid">{gallery.records.map((record, index) => <GalleryCard key={record.id} record={record} index={index} titleProperty={titleProperty} statusProperty={statusProperty} metadata={metadata} coverPropertyId={coverPropertyId} updateCell={updateCell} />)}</div>
    {gallery.truncatedCount > 0 && <footer className="gallery-foot">已显示前 120 项 · 另有 {gallery.truncatedCount} 项，请使用筛选缩小范围</footer>}
  </div>
}

function GalleryCard({ record, index, titleProperty, statusProperty, metadata, coverPropertyId, updateCell }: { record: DatabaseRecord; index: number; titleProperty: DatabaseProperty; statusProperty?: DatabaseProperty; metadata: DatabaseProperty[]; coverPropertyId?: string; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const [coverFailed, setCoverFailed] = useState(false)
  const cover = coverFailed ? null : safeGalleryCover(coverPropertyId ? record.values[coverPropertyId] : undefined)
  const status = String(statusProperty ? record.values[statusProperty.id] ?? 'todo' : 'todo')
  const title = String(record.values[titleProperty.id] || '无标题')
  const initials = title.replace(/\s+/gu, '').slice(0, 2).toLocaleUpperCase()
  const nextStatus = status === 'todo' ? 'doing' : status === 'doing' ? 'done' : 'todo'
  return <article className={`gallery-card status-${status}`}>
    <div className={`gallery-cover motif-${index % 6}`}>
      {cover ? <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setCoverFailed(true)} /> : <div className="gallery-generated" aria-hidden="true"><i /><b>{initials}</b><em>{String(index + 1).padStart(2, '0')}</em></div>}
      <span>{statusLabel(status)}</span>
    </div>
    <div className="gallery-card-body"><small>FOLIO {String(index + 1).padStart(2, '0')}</small><strong>{title}</strong><dl>{metadata.map((property) => <div key={property.id}><dt>{property.name}</dt><dd>{formatGalleryValue(record.values[property.id], property)}</dd></div>)}</dl></div>
    {statusProperty && <button aria-label={`推进“${title}”的状态`} title="推进状态" onClick={() => updateCell(record.id, statusProperty.id, nextStatus)}><span>{statusLabel(status)}</span><ArrowRight size={13} /></button>}
  </article>
}

function statusLabel(value: string) { return statuses.find((status) => status.id === value)?.label ?? value }
function formatGalleryValue(value: PropertyValue | undefined, property: DatabaseProperty) {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return '—'
  if (property.type === 'date' && typeof value === 'string') return value.slice(5).replace('-', '.')
  return Array.isArray(value) ? value.join('、') : String(value)
}

const TIMELINE_DAYS = 28
const TIMELINE_DAY_WIDTH = 36

export function TimelineView({ records, schema, startDatePropertyId, endDatePropertyId, updateCell }: { records: DatabaseRecord[]; schema: DatabaseSchema; startDatePropertyId?: string; endDatePropertyId?: string; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const dateProperties = schema.properties.filter((property) => property.type === 'date')
  const startProperty = dateProperties.find((property) => property.id === startDatePropertyId) ?? dateProperties.at(-1)
  const endProperty = dateProperties.find((property) => property.id === endDatePropertyId) ?? dateProperties[0]
  const titleProperty = schema.properties.find((property) => property.type === 'title')
  const todayIso = new Date().toISOString().slice(0, 10)
  const [rangeStart, setRangeStart] = useState(() => startOfWeekIso(todayIso))
  const days = useMemo(() => timelineDays(rangeStart, TIMELINE_DAYS), [rangeStart])
  const layout = useMemo(() => startProperty && endProperty ? layoutTimelineRecords(records, startProperty.id, endProperty.id, rangeStart, TIMELINE_DAYS) : { items: [], unscheduled: records, matchingCount: 0, truncatedCount: 0 }, [records, startProperty, endProperty, rangeStart])
  const todayIndex = days.findIndex((day) => day.date === todayIso)
  const rangeLabel = `${formatTimelineDate(days[0]?.date)} — ${formatTimelineDate(days.at(-1)?.date)}`
  const reschedule = (event: DragEvent<HTMLDivElement>) => {
    const recordId = event.dataTransfer.getData('application/x-notetodo-record')
    const duration = Number(event.dataTransfer.getData('application/x-notetodo-duration'))
    if (!recordId || !Number.isFinite(duration)) return
    const rect = event.currentTarget.getBoundingClientRect()
    const pointerX = Number.isFinite(event.clientX) ? event.clientX : rect.left
    const index = Math.max(0, Math.min(TIMELINE_DAYS - 1, Math.floor((pointerX - rect.left) / TIMELINE_DAY_WIDTH)))
    const nextStart = days[index]?.date
    if (!nextStart) return
    // Move both endpoints together so a drag never changes task duration.
    updateCell(recordId, startProperty!.id, nextStart)
    updateCell(recordId, endProperty!.id, shiftIsoDate(nextStart, Math.max(0, duration - 1)))
  }

  if (!startProperty || !endProperty || !titleProperty) return <div className="calendar-missing"><ChartNoAxesGantt size={22} /><strong>需要开始与截止日期</strong><span>Timeline 视图会使用数据库中的日期属性绘制任务范围。</span></div>

  return <div className="database-timeline">
    <header className="timeline-toolbar"><div><small>PRODUCTION RUN / 28 DAYS</small><strong>{rangeLabel}</strong></div><span>{layout.matchingCount} 条带 · {layout.unscheduled.length} 待排期</span><nav aria-label="切换时间范围"><button aria-label="前两周" onClick={() => setRangeStart(shiftIsoDate(rangeStart, -14))}><ChevronLeft size={14} /></button><button onClick={() => setRangeStart(startOfWeekIso(todayIso))}>今天</button><button aria-label="后两周" onClick={() => setRangeStart(shiftIsoDate(rangeStart, 14))}><ChevronRight size={14} /></button></nav></header>
    <div className="timeline-scroll">
      <div className="timeline-canvas" style={{ width: 168 + TIMELINE_DAYS * TIMELINE_DAY_WIDTH }}>
        <div className="timeline-scale"><strong>任务 / OWNER</strong><div>{days.map((day) => <time className={`${day.weekday === 0 || day.weekday === 6 ? 'is-weekend' : ''} ${day.date === todayIso ? 'is-today' : ''}`} dateTime={day.date} key={day.date}><b>{day.month}/{day.day}</b><small>{['日', '一', '二', '三', '四', '五', '六'][day.weekday]}</small></time>)}</div></div>
        <div className="timeline-rows">{layout.items.map((item) => <div className="timeline-row" key={item.record.id}>
          <header><i className={`status-dot status-${item.record.values['task-status'] ?? 'todo'}`} /><span><strong>{item.record.values[titleProperty.id] || '无标题'}</strong><small>{item.record.values['task-owner'] || '未分配'}</small></span></header>
          <div className="timeline-track" onDragOver={(event) => event.preventDefault()} onDrop={reschedule}>
            {todayIndex >= 0 && <i className="timeline-today-line" style={{ left: todayIndex * TIMELINE_DAY_WIDTH + TIMELINE_DAY_WIDTH / 2 }} />}
            <article className={`${item.startsBeforeRange ? 'starts-before' : ''} ${item.endsAfterRange ? 'ends-after' : ''} status-${item.record.values['task-status'] ?? 'todo'}`} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-notetodo-record', item.record.id); event.dataTransfer.setData('application/x-notetodo-duration', String(item.durationDays)) }} style={{ left: item.startIndex * TIMELINE_DAY_WIDTH + 3, width: Math.max(30, (item.endIndex - item.startIndex + 1) * TIMELINE_DAY_WIDTH - 6) }} title={`${item.record.values[startProperty.id] ?? '—'} → ${item.record.values[endProperty.id] ?? '—'}；拖动可整体改期`}><span>{item.record.values[titleProperty.id] || '无标题'}</span><em>{item.durationDays}D</em></article>
          </div>
        </div>)}</div>
      </div>
    </div>
    {(layout.unscheduled.length > 0 || layout.truncatedCount > 0) && <footer className="timeline-foot"><span>{layout.unscheduled.length} 项缺少日期</span>{layout.truncatedCount > 0 && <span>另有 {layout.truncatedCount} 项已裁剪，缩小筛选范围后显示</span>}</footer>}
  </div>
}

function startOfWeekIso(value: string) { const date = new Date(`${value}T00:00:00Z`); const offset = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - offset); return date.toISOString().slice(0, 10) }
function shiftIsoDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
function formatTimelineDate(value?: string) { if (!value) return '—'; const [, month, day] = value.split('-'); return `${month}.${day}` }

const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

function CalendarView({ records, schema, datePropertyId, updateCell }: { records: DatabaseRecord[]; schema: DatabaseSchema; datePropertyId?: string; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const dateProperty = schema.properties.find((property) => property.id === datePropertyId && property.type === 'date') ?? schema.properties.find((property) => property.type === 'date')
  const titleProperty = schema.properties.find((property) => property.type === 'title')
  const today = new Date(); const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }))
  const days = useMemo(() => buildCalendarMonth(cursor.year, cursor.month), [cursor])
  const grouped = useMemo(() => dateProperty ? groupRecordsByDate(records, dateProperty.id) : { groups: {}, unscheduled: records }, [records, dateProperty])
  const moveMonth = (offset: number) => setCursor((current) => { const date = new Date(Date.UTC(current.year, current.month + offset, 1)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() } })
  const monthLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(cursor.year, cursor.month, 1))

  if (!dateProperty || !titleProperty) return <div className="calendar-missing"><CalendarDays size={22} /><strong>需要日期与标题属性</strong><span>Calendar 视图会自动使用数据库中的第一个日期属性。</span></div>

  return <div className="database-calendar">
    <header className="calendar-header">
      <div><small>DELIVERY WINDOW</small><strong>{monthLabel}</strong></div>
      <span>{records.length - grouped.unscheduled.length} 已排期 · {grouped.unscheduled.length} 待排期</span>
      <nav aria-label="切换月份"><button aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft size={14} /></button><button onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}>今天</button><button aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight size={14} /></button></nav>
    </header>
    <div className="calendar-weekdays">{weekdayLabels.map((label, index) => <span className={index > 4 ? 'is-weekend' : ''} key={label}>周{label}</span>)}</div>
    <div className="calendar-grid">{days.map((day) => {
      const scheduled = grouped.groups[day.date] ?? []
      return <section className={`${day.inCurrentMonth ? '' : 'is-outside'} ${day.date === todayIso ? 'is-today' : ''}`} key={day.date} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const recordId = event.dataTransfer.getData('application/x-notetodo-record'); if (recordId) updateCell(recordId, dateProperty.id, day.date) }}>
        <header><time dateTime={day.date}>{day.day}</time>{scheduled.length > 0 && <em>{scheduled.length}</em>}</header>
        <div>{scheduled.slice(0, 4).map((record) => <article draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-notetodo-record', record.id) }} key={record.id} title="拖动卡片可调整截止日期">
          <i className={`status-dot status-${record.values['task-status'] ?? 'todo'}`} />
          <span><strong>{record.values[titleProperty.id] || '无标题'}</strong><small>{record.values['task-owner'] || '未分配'}</small></span>
        </article>)}{scheduled.length > 4 && <button className="calendar-more">+{scheduled.length - 4} 项</button>}</div>
      </section>
    })}</div>
    {grouped.unscheduled.length > 0 && <footer className="calendar-unscheduled"><span><CalendarDays size={12} />待排期</span><div>{grouped.unscheduled.slice(0, 8).map((record) => <article draggable onDragStart={(event) => event.dataTransfer.setData('application/x-notetodo-record', record.id)} key={record.id}>{record.values[titleProperty.id] || '无标题'}</article>)}{grouped.unscheduled.length > 8 && <em>+{grouped.unscheduled.length - 8}</em>}</div></footer>}
  </div>
}

function AutomationPanel({ schema, rules, runs, onClose, onSave, onToggle, onReplay }: { schema: DatabaseSchema; rules: AutomationRule[]; runs: AutomationRun[]; onClose: () => void; onSave: (rule: AutomationRule) => Promise<void>; onToggle: (rule: AutomationRule) => Promise<void>; onReplay: (runId: string) => Promise<void> }) {
  const writable = schema.properties.filter((property) => property.type !== 'formula' && property.type !== 'rollup')
  const defaultTrigger = schema.properties.find((property) => property.type === 'select') ?? writable[0]!
  const defaultAction = schema.properties.find((property) => property.type === 'number') ?? writable[0]!
  const blankRule = (): AutomationRule => ({ id: crypto.randomUUID(), name: '新自动化', enabled: true, trigger: { type: 'propertyChanged', propertyId: defaultTrigger.id }, condition: { propertyId: defaultTrigger.id, operator: 'equals', value: '' }, actions: [{ type: 'setProperty', propertyId: defaultAction.id, value: null }] })
  const [draft, setDraft] = useState<AutomationRule>(() => rules[0] ? structuredClone(rules[0]) : blankRule())
  const [tab, setTab] = useState<'rules' | 'runs'>('rules')
  const [message, setMessage] = useState('')
  const [replayingId, setReplayingId] = useState<string | null>(null)

  const setCondition = (patch: Partial<NonNullable<AutomationRule['condition']>>) => setDraft((current) => ({ ...current, condition: { propertyId: current.condition?.propertyId ?? defaultTrigger.id, operator: current.condition?.operator ?? 'equals', ...current.condition, ...patch } }))
  const setAction = (patch: Partial<AutomationRule['actions'][number]>) => setDraft((current) => ({ ...current, actions: [{ ...current.actions[0]!, ...patch }] }))
  const save = async () => {
    try { await onSave(draft); setMessage('规则已保存，下一次属性变更即生效。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '规则无法保存。') }
  }
  const replay = async (runId: string) => {
    setReplayingId(runId); setMessage('')
    try { await onReplay(runId); setMessage('重放已完成，最新结果已写入执行磁带。') }
    catch (error) { setMessage(error instanceof Error ? error.message : '执行记录无法重放。') }
    finally { setReplayingId(null) }
  }

  return <div className="automation-backdrop" onMouseDown={onClose}>
    <section className="automation-panel" role="dialog" aria-modal="true" aria-label="数据库自动化" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span><Zap size={15} /></span><div><small>AUTOMATION DESK / {schema.name.toLocaleUpperCase()}</small><strong>规则与执行磁带</strong></div></div><button onClick={onClose}><X size={16} /></button></header>
      <nav><button className={tab === 'rules' ? 'is-active' : ''} onClick={() => setTab('rules')}><Zap size={12} />规则 {rules.length}</button><button className={tab === 'runs' ? 'is-active' : ''} onClick={() => setTab('runs')}><Activity size={12} />运行 {runs.length}</button></nav>
      {tab === 'rules' ? <div className="automation-layout">
        <aside><button className="automation-new" onClick={() => setDraft(blankRule())}><Plus size={12} />新建规则</button>{rules.map((rule) => <button className={draft.id === rule.id ? 'is-selected' : ''} key={rule.id} onClick={() => setDraft(structuredClone(rule))}><i className={rule.enabled ? 'is-live' : ''} /><span><strong>{rule.name}</strong><small>{propertyName(schema.properties, rule.trigger.propertyId)} 变更时</small></span><em onClick={(event) => { event.stopPropagation(); void onToggle(rule) }}>{rule.enabled ? 'ON' : 'OFF'}</em></button>)}</aside>
        <main>
          <label className="automation-name"><span>规则名称</span><input value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className="automation-sentence"><b>当</b><label><span>触发属性</span><select value={draft.trigger.propertyId} onChange={(event) => setDraft({ ...draft, trigger: { type: 'propertyChanged', propertyId: event.target.value } })}>{writable.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><output>发生变更</output></div>
          <div className="automation-sentence"><b>如果</b><label><span>条件属性</span><select value={draft.condition?.propertyId} onChange={(event) => setCondition({ propertyId: event.target.value })}>{writable.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label><span>比较</span><select value={draft.condition?.operator} onChange={(event) => setCondition({ operator: event.target.value as NonNullable<AutomationRule['condition']>['operator'] })}><option value="equals">等于</option><option value="notEquals">不等于</option><option value="contains">包含</option><option value="greaterThan">大于</option><option value="lessThan">小于</option><option value="isEmpty">为空</option><option value="isNotEmpty">不为空</option></select></label>{!['isEmpty', 'isNotEmpty'].includes(draft.condition?.operator ?? '') && <label><span>条件值</span><input value={displayAutomationValue(draft.condition?.value)} onChange={(event) => setCondition({ value: parseAutomationValue(schema.properties.find((property) => property.id === draft.condition?.propertyId), event.target.value) })} /></label>}</div>
          <div className="automation-sentence"><b>就</b><label><span>写入属性</span><select value={draft.actions[0]?.propertyId} onChange={(event) => setAction({ propertyId: event.target.value })}>{writable.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label className="automation-grow"><span>写入值</span><input value={displayAutomationValue(draft.actions[0]?.value)} onChange={(event) => setAction({ value: parseAutomationValue(schema.properties.find((property) => property.id === draft.actions[0]?.propertyId), event.target.value) })} /></label></div>
          <footer><span>{message || '规则最多执行 20 个写入动作；公式与 Rollup 始终只读。'}</span><button onClick={() => void save()}>保存规则</button></footer>
        </main>
      </div> : <div className="automation-runs">{message && <div className="automation-run-message">{message}</div>}{runs.map((run) => <article className={`is-${run.status}`} key={run.id}><i>{run.status === 'succeeded' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}</i><span><strong>{run.automationName}</strong><small>{new Date(run.createdAt).toLocaleString('zh-CN')} · {run.recordId}</small><code>{run.status === 'failed' ? run.errorMessage : run.output.map((patch) => `${propertyName(schema.properties, patch.propertyId)} → ${displayAutomationValue(patch.value)}`).join(' · ')}</code></span><em>{run.replayOf ? 'REPLAY' : run.status.toLocaleUpperCase()}</em>{run.status === 'failed' && <button disabled={replayingId !== null} onClick={() => void replay(run.id)}><RotateCcw size={12} />{replayingId === run.id ? '重放中' : '重放'}</button>}</article>)}{!runs.length && <div className="automation-empty"><Activity size={22} /><strong>尚无执行记录</strong><span>数据库属性变更后，运行磁带会在这里留档。</span></div>}</div>}
    </section>
  </div>
}

function propertyName(properties: DatabaseProperty[], id: string) { return properties.find((property) => property.id === id)?.name ?? id }
function displayAutomationValue(value: AutomationValue | undefined) { return Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value) }
function parseAutomationValue(property: DatabaseProperty | undefined, value: string): AutomationValue {
  if (!value) return null
  if (property?.type === 'number') return Number.isFinite(Number(value)) ? Number(value) : null
  if (property?.type === 'checkbox') return ['true', '1', '是'].includes(value.toLocaleLowerCase())
  if (property?.type === 'relation' || property?.type === 'multiSelect') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return value
}

export function VirtualTable({ records, allRecords, updateCell }: { records: DatabaseRecord[]; allRecords: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const { start, end, totalSize } = virtualWindow(records.length, scrollTop, ROW_HEIGHT, VIEWPORT_HEIGHT, OVERSCAN)
  const visible = records.slice(start, end)

  return (
    <div className="database-table">
      <div className="database-grid database-grid-head"><span>任务</span><span>状态</span><span>负责人</span><span>截止日期</span><span>优先级</span><span><Link2 size={11} />依赖</span><span><Sigma size={11} />汇总</span><span>ƒ 风险</span></div>
      <div className="database-viewport" style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(ROW_HEIGHT, records.length * ROW_HEIGHT)) }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div className="database-row-space" style={{ height: totalSize }}>
          {visible.map((record, offset) => (
            <div className="database-grid database-grid-row" key={record.id} style={{ transform: `translateY(${(start + offset) * ROW_HEIGHT}px)` }}>
              <input value={String(record.values['task-title'] ?? '')} onChange={(event) => updateCell(record.id, 'task-title', event.target.value)} />
              <StatusSelect record={record} updateCell={updateCell} />
              <input value={String(record.values['task-owner'] ?? '')} onChange={(event) => updateCell(record.id, 'task-owner', event.target.value)} />
              <input type="date" value={String(record.values['task-due'] ?? '')} onChange={(event) => updateCell(record.id, 'task-due', event.target.value)} />
              <input type="number" min="1" max="3" value={Number(record.values['task-score'] ?? 1)} onChange={(event) => updateCell(record.id, 'task-score', Number(event.target.value))} />
              <RelationCell record={record} records={allRecords} updateCell={updateCell} />
              <output className="derived-number" title="由关联任务的优先级汇总得出">{record.values['task-dependency-score'] ?? '—'}</output>
              <output className={`formula-badge ${record.values['task-risk'] === '需关注' ? 'is-risk' : ''}`}>{record.values['task-risk'] ?? '—'}</output>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RelationCell({ record, records, updateCell }: { record: DatabaseRecord; records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const relatedIds = Array.isArray(record.values['task-dependencies']) ? record.values['task-dependencies'] : []
  const label = relatedIds.map((id) => records.find((candidate) => candidate.id === id)?.values['task-title']).filter(Boolean).join('、')
  // A native select with 10k options multiplied by every visible row defeats
  // table virtualization. Keep a strict DOM budget; a searchable relation
  // picker can page beyond this fast path in a later interaction.
  const candidates: DatabaseRecord[] = []
  for (const candidate of records) {
    if (candidate.id !== record.id && !relatedIds.includes(candidate.id)) candidates.push(candidate)
    if (candidates.length >= 100) break
  }
  return <div className="relation-cell" title={label || '暂无依赖'}>
    <button type="button" disabled={!relatedIds.length} onClick={() => updateCell(record.id, 'task-dependencies', [])}>{relatedIds.length ? `${relatedIds.length} 项` : '无'}</button>
    <select aria-label={`为 ${record.values['task-title']} 添加依赖`} value="" onChange={(event) => event.target.value && updateCell(record.id, 'task-dependencies', [...relatedIds, event.target.value])}>
      <option value="">+关联</option>
      {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.values['task-title']}</option>)}
      {records.length > candidates.length + relatedIds.length + 1 && <option value="" disabled>继续输入以检索更多…</option>}
    </select>
  </div>
}

function StatusSelect({ record, updateCell }: { record: DatabaseRecord; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const value = String(record.values['task-status'] ?? 'todo')
  return <select className={`status-select status-${value}`} value={value} onChange={(event) => updateCell(record.id, 'task-status', event.target.value)}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select>
}

export function BoardView({ records, updateCell }: { records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const groups = new Map(statuses.map((status) => [status.id, [] as DatabaseRecord[]]))
  for (const record of records) groups.get(String(record.values['task-status']))?.push(record)
  return <div className="database-board">{statuses.map((status) => <VirtualBoardColumn key={status.id} status={status} records={groups.get(status.id) ?? []} updateCell={updateCell} />)}</div>
}

function VirtualBoardColumn({ status, records, updateCell }: { status: typeof statuses[number]; records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const { start, end, totalSize } = virtualWindow(records.length, scrollTop, BOARD_CARD_HEIGHT, 360, 3)
  return <div className="board-column"><header><span className={`status-dot status-${status.id}`} />{status.label}<em>{records.length}</em></header><div className="board-card-viewport" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}><div className="board-card-space" style={{ height: Math.max(230, totalSize) }}>{records.slice(start, end).map((record, offset) => <article key={record.id} style={{ transform: `translateY(${(start + offset) * BOARD_CARD_HEIGHT}px)` }}><strong>{record.values['task-title']}</strong><span><i>{record.values['task-owner'] || '未分配'}</i><time>{record.values['task-due']}</time></span><small className={record.values['task-risk'] === '需关注' ? 'is-risk' : ''}>{record.values['task-risk']} · 依赖分 {record.values['task-dependency-score'] ?? 0}</small><button onClick={() => updateCell(record.id, 'task-status', status.id === 'todo' ? 'doing' : status.id === 'doing' ? 'done' : 'todo')}>推进状态 →</button></article>)}</div></div></div>
}

export function ListView({ records, updateCell }: { records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const { start, end, totalSize } = virtualWindow(records.length, scrollTop, LIST_ROW_HEIGHT, VIEWPORT_HEIGHT, OVERSCAN)
  return <div className="database-list" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}><div className="database-list-space" style={{ height: totalSize }}>{records.slice(start, end).map((record, offset) => <div className="database-list-row" key={record.id} style={{ transform: `translateY(${(start + offset) * LIST_ROW_HEIGHT}px)` }}><span className="list-index">{String(start + offset + 1).padStart(2, '0')}</span><input value={String(record.values['task-title'] ?? '')} onChange={(event) => updateCell(record.id, 'task-title', event.target.value)} /><StatusSelect record={record} updateCell={updateCell} /><span>{record.values['task-owner']}</span><time>{record.values['task-due']}</time></div>)}</div></div>
}
