import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Activity, ArrowRight, ArrowUpDown, BookOpen, Calculator, CalendarDays, ChartNoAxesGantt, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Columns3, Copy, Database, Download, Eye, EyeOff, FileUp, Filter, GripVertical, Images, Layers3, LayoutTemplate, Link2, List, Lock, MoreHorizontal, PencilLine, Plus, RotateCcw, Rows3, Search, Settings2, Sigma, SlidersHorizontal, Star, Table2, Trash2, X, Zap } from 'lucide-react'
import { buildCalendarMonth, calculateColumn, coerceCsvPropertyValue, evaluateFormula, groupRecordsByDate, groupRecordsByProperty, inferCsvPropertyMappings, layoutTimelineRecords, moveRecordInOrder, normalizeViewConfig, orderRecordsByView, parseDatabaseCsv, prepareGalleryRecords, queryRecords, resolveDerivedRecordsIncremental, safeGalleryCover, searchDatabaseRecords, serializeDatabaseCsv, timelineDays, validColumnCalculations, validateFormulaExpression, virtualWindow, type ColumnCalculation, type DatabaseProperty, type DatabaseRecord, type DatabaseRecordHistory, type DatabaseSchema, type DatabaseSnapshot, type DatabaseTemplate, type DatabaseTrashRecord, type DatabaseView, type DatabaseViewConfig, type FilterRule, type ParsedDatabaseCsv, type PropertyType, type PropertyValue, type SelectOption, type SortRule } from '@notetodo/database-core'
import type { AutomationRule, AutomationValue } from '@notetodo/automation-core'
import { databaseRepository } from './data/database-repository'
import { BoardView, GenericTable, ListView, RecordDetailPanel, VirtualTable, propertyTypeLabel, type RelationTargets } from './DatabaseViews'
export { BoardView, GenericTable, ListView, RecordDetailPanel, VirtualTable } from './DatabaseViews'

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

export function PageDatabaseMount({ pageId, pageTitle, canEdit, fullPage = false }: { pageId: string; pageTitle: string; canEdit: boolean; fullPage?: boolean }) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    setSnapshot(undefined)
    void databaseRepository.loadByPage(pageId).then((loaded) => { if (active) setSnapshot(loaded) })
    return () => { active = false }
  }, [pageId])
  if (snapshot === undefined) return null
  if (snapshot) return <div className={fullPage ? 'database-page-surface' : undefined}><DatabaseBlock pageId={pageId} initialSnapshot={snapshot} /></div>
  return canEdit ? <div className={fullPage ? 'database-page-surface is-empty' : undefined}><DatabaseCreationPrompt pageTitle={pageTitle} fullPage={fullPage} onCreate={async (name) => setSnapshot(await databaseRepository.createOnPage(pageId, name))} /></div> : null
}

export function DatabaseCreationPrompt({ pageTitle, onCreate, fullPage = false }: { pageTitle: string; onCreate: (name: string) => Promise<void>; fullPage?: boolean }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(`${pageTitle || '未命名'} 数据库`)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    const normalized = name.trim()
    if (!normalized || busy) return
    setBusy(true)
    try { await onCreate(normalized) } finally { setBusy(false) }
  }
  if (!open && !fullPage) return <button className="database-create-trigger" onClick={() => setOpen(true)}><Database size={14} /><span><strong>创建数据库</strong><small>在当前页面建立结构化集合</small></span><Plus size={13} /></button>
  return <section className="database-create-composer">
    <div><Database size={18} /><span><strong>{fullPage ? '创建整页数据库' : '创建数据库'}</strong><small>{fullPage ? '从表格开始，之后随时切换看板、日历或画廊' : '为此页面添加一个内联数据库'}</small></span></div>
    <label><span>数据库名称</span><input autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void create(); if (event.key === 'Escape') setOpen(false) }} /></label>
    <p>包含名称、状态和日期属性。创建后可以继续添加属性与视图。</p>
    <footer>{!fullPage && <button onClick={() => setOpen(false)}>取消</button>}<button disabled={!name.trim() || busy} onClick={() => void create()}>{busy ? '正在创建…' : '创建数据库'}</button></footer>
  </section>
}

export function DatabaseBlock({ pageId, initialSnapshot }: { pageId: string; initialSnapshot?: DatabaseSnapshot }) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null>(initialSnapshot ?? null)
  const [rulesOpen, setRulesOpen] = useState<'filters' | 'sorts' | 'group' | null>(null)
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [quickFilterOpen, setQuickFilterOpen] = useState(false)
  const [databaseSources, setDatabaseSources] = useState<Array<{ id: string; pageId: string; name: string; pageTitle: string; recordCount: number }>>([])
  const [relationTargets, setRelationTargets] = useState<Record<string, { schema: DatabaseSchema; records: DatabaseRecord[] }>>({})
  const [automationOpen, setAutomationOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState<'create' | 'manage' | null>(null)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<DatabaseTemplate | 'new' | null>(null)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [recordTrashOpen, setRecordTrashOpen] = useState(false)
  const [trashedRecords, setTrashedRecords] = useState<DatabaseTrashRecord[]>([])
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(() => new Set())
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done'>('idle')
  const [openRecordId, setOpenRecordId] = useState<string | null>(null)
  const [automations, setAutomations] = useState<AutomationRule[]>([])
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([])
  const [constraintNotice, setConstraintNotice] = useState<string | null>(null)
  const projectionCache = useRef<{ schemaId: string; records: DatabaseRecord[]; targets: typeof relationTargets }>({ schemaId: '', records: [], targets: {} })
  const changedRecordIds = useRef(new Set<string>())

  useEffect(() => {
    if (initialSnapshot) { setSnapshot(initialSnapshot); return }
    void databaseRepository.loadByPage(pageId).then(setSnapshot)
  }, [pageId, initialSnapshot])
  useEffect(() => {
    if (!snapshot) return
    if (window.notetodo?.automations) void Promise.all([window.notetodo.automations.list(snapshot.schema.id), window.notetodo.automations.listRuns(snapshot.schema.id)]).then(([rules, runs]) => { setAutomations(rules); setAutomationRuns(runs) })
    else setAutomations(snapshot.schema.id === 'roadmap-db' ? [previewAutomation] : [])
  }, [snapshot?.schema.id])
  useEffect(() => { if (schemaOpen) void databaseRepository.listSources().then(setDatabaseSources) }, [schemaOpen])
  useEffect(() => {
    if (!snapshot) return
    const targetIds = [...new Set(snapshot.schema.properties.filter((property) => property.type === 'relation').map((property) => property.relation?.databaseId).filter((id): id is string => Boolean(id && id !== snapshot.schema.id)))]
    if (!targetIds.length) { setRelationTargets({}); return }
    let active = true
    void databaseRepository.listSources().then(async (sources) => {
      const loaded = await Promise.all(targetIds.map(async (databaseId) => {
        const source = sources.find((candidate) => candidate.id === databaseId)
        return [databaseId, source ? await databaseRepository.loadByPage(source.pageId) : null] as const
      }))
      if (active) setRelationTargets(Object.fromEntries(loaded.filter((entry): entry is readonly [string, DatabaseSnapshot] => Boolean(entry[1])).map(([id, target]) => [id, { schema: target.schema, records: target.records }])))
    })
    return () => { active = false }
  }, [snapshot?.schema.properties])

  // Rollups and formulas are computed once per snapshot, never persisted back.
  // This keeps sort/filter cheap while making every view consume identical data.
  const projection = useMemo(() => {
    if (!snapshot) return { records: [], recomputedCount: 0 }
    const previous = projectionCache.current.schemaId === snapshot.schema.id && projectionCache.current.targets === relationTargets ? projectionCache.current.records : undefined
    const result = resolveDerivedRecordsIncremental(snapshot.schema, snapshot.records, previous, changedRecordIds.current, relationTargets)
    projectionCache.current = { schemaId: snapshot.schema.id, records: result.records, targets: relationTargets }
    changedRecordIds.current.clear()
    return result
  }, [snapshot, relationTargets])
  const derivedRecords = projection.records
  const activeView = snapshot ? snapshot.views.find((view) => view.id === snapshot.activeViewId) ?? snapshot.views[0] : undefined
  useEffect(() => { setSearchOpen(false); setSearchQuery(''); setQuickFilterOpen(false) }, [activeView?.id])
  const orderedDerivedRecords = useMemo(() => orderRecordsByView(derivedRecords, activeView?.config.recordOrder), [derivedRecords, activeView?.config.recordOrder])
  const filteredRecords = useMemo(() => snapshot && activeView ? queryRecords(
    orderedDerivedRecords,
    activeView.config.filters,
    activeView.config.sorts,
    activeView.config.filterMode,
  ) : [], [snapshot, activeView, orderedDerivedRecords])
  const quickFilteredRecords = useMemo(() => activeView ? queryRecords(filteredRecords, activeView.config.quickFilters, [], 'and') : [], [activeView, filteredRecords])
  const queriedRecords = useMemo(() => snapshot ? searchDatabaseRecords(quickFilteredRecords, snapshot.schema, searchQuery) : [], [quickFilteredRecords, searchQuery, snapshot])
  const recordGroups = useMemo(() => activeView?.config.groupByPropertyId ? groupRecordsByProperty(queriedRecords, activeView.config.groupByPropertyId) : [], [queriedRecords, activeView])
  const collapsedGroups = useMemo(() => new Set(activeView?.config.collapsedGroupKeys ?? []), [activeView?.config.collapsedGroupKeys])
  const records = recordGroups.length ? recordGroups.filter((group) => !collapsedGroups.has(group.key)).flatMap((group) => group.records) : queriedRecords

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
    void databaseRepository.updateCell(next, recordId, propertyId, value, sourceRecord.values[propertyId] ?? null).then(async (result) => {
      // Desktop automation runs in the same SQLite transaction as the user's
      // edit. Reload only when a rule actually ran so normal typing stays cheap.
      if (result?.automationRuns?.length) setSnapshot(await databaseRepository.loadByPage(pageId))
      if (result?.automationRuns?.length && window.notetodo?.automations) setAutomationRuns(await window.notetodo.automations.listRuns(snapshot.schema.id))
    }).catch((error: unknown) => { setSnapshot(snapshot); setConstraintNotice(error instanceof Error ? error.message : '属性值不符合约束。'); window.setTimeout(() => setConstraintNotice(null), 3200) })
  }

  const addRecord = () => {
    const id = crypto.randomUUID()
    const values = Object.fromEntries(snapshot.schema.properties
      .filter((property) => !['formula', 'rollup'].includes(property.type))
      .map((property) => [property.id, defaultPropertyValue(property)]))
    const record: DatabaseRecord = {
      id,
      values,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const next = { ...snapshot, records: [...snapshot.records, record] }
    setSnapshot(next)
    void databaseRepository.createRecord(next, id)
    for (const [propertyId, value] of Object.entries(record.values)) void databaseRepository.updateCell(next, id, propertyId, value)
  }

  const updateRecordContent = (recordId: string, content: string) => {
    const previous = snapshot.records.find((record) => record.id === recordId)?.content ?? ''
    const next = { ...snapshot, records: snapshot.records.map((record) => record.id === recordId ? { ...record, content, updatedAt: new Date().toISOString() } : record) }
    setSnapshot(next)
    void databaseRepository.updateRecordContent(next, recordId, content, previous)
  }

  const setView = (viewId: string) => {
    const next = { ...snapshot, activeViewId: viewId }
    setSnapshot(next)
    setSelectedRecordIds(new Set())
    setLayoutOpen(false)
    void databaseRepository.setActiveView(next, viewId)
  }

  const saveViewConfig = (config: DatabaseViewConfig) => {
    const normalized = normalizeViewConfig(snapshot.schema, config)
    const next = { ...snapshot, views: snapshot.views.map((view) => view.id === activeView.id ? { ...view, config: normalized } : view) }
    setSnapshot(next)
    void databaseRepository.updateViewConfig(next, activeView.id, normalized)
  }

  const toggleGroup = (groupKey: string) => {
    const collapsed = new Set(activeView.config.collapsedGroupKeys ?? [])
    if (collapsed.has(groupKey)) collapsed.delete(groupKey); else collapsed.add(groupKey)
    saveViewConfig({ ...activeView.config, collapsedGroupKeys: [...collapsed] })
  }

  const moveRecord = (recordId: string, targetId?: string, groupChange?: { propertyId: string; value: PropertyValue }) => {
    // Explicit sort rules remain authoritative. Manual order is only available
    // when the current view is in its natural, user-controlled order.
    if (activeView.config.sorts?.length) return
    const recordOrder = moveRecordInOrder(orderedDerivedRecords.map((record) => record.id), recordId, targetId)
    const config = normalizeViewConfig(snapshot.schema, { ...activeView.config, recordOrder })
    let records = snapshot.records
    if (groupChange) {
      records = records.map((record) => record.id === recordId ? { ...record, values: { ...record.values, [groupChange.propertyId]: groupChange.value }, updatedAt: new Date().toISOString() } : record)
      changedRecordIds.current.add(recordId)
    }
    const next = { ...snapshot, records, views: snapshot.views.map((view) => view.id === activeView.id ? { ...view, config } : view) }
    setSnapshot(next)
    if (groupChange) void databaseRepository.updateCell(next, recordId, groupChange.propertyId, groupChange.value)
    void databaseRepository.updateViewConfig(next, activeView.id, config)
  }

  const createView = async (name: string, type: DatabaseView['type']) => {
    const view: DatabaseView = { id: crypto.randomUUID(), databaseId: snapshot.schema.id, name, type, config: defaultViewConfig(snapshot.schema, type) }
    setSnapshot(await databaseRepository.createView(snapshot, view))
    setViewMenuOpen(null)
  }

  const duplicateView = async () => {
    const view: DatabaseView = { ...activeView, id: crypto.randomUUID(), name: `${activeView.name} 的副本`, config: structuredClone(activeView.config) }
    setSnapshot(await databaseRepository.createView(snapshot, view))
    setViewMenuOpen(null)
  }

  const toggleRecord = (recordId: string) => setSelectedRecordIds((current) => {
    const next = new Set(current); if (next.has(recordId)) next.delete(recordId); else if (next.size < 1000) next.add(recordId); return next
  })
  const toggleAllRecords = () => setSelectedRecordIds((current) => current.size === records.length ? new Set() : new Set(records.slice(0, 1000).map((record) => record.id)))
  const createFromTemplate = async (templateId: string) => {
    setSnapshot(await databaseRepository.createFromTemplate(snapshot, templateId, crypto.randomUUID()))
    setTemplateMenuOpen(false)
  }
  const saveSelectionAsTemplate = async (name: string) => {
    const source = snapshot.records.find((record) => selectedRecordIds.has(record.id))
    if (!source) return
    const values = Object.fromEntries(snapshot.schema.properties.filter((property) => property.type !== 'title' && !['formula', 'rollup'].includes(property.type)).map((property) => [property.id, source.values[property.id] ?? defaultPropertyValue(property)]))
    const now = new Date().toISOString()
    const template: DatabaseTemplate = { id: crypto.randomUUID(), databaseId: snapshot.schema.id, name, values, content: source.content ?? '', createdAt: now, updatedAt: now }
    setSnapshot(await databaseRepository.saveTemplate(snapshot, template)); setTemplateMenuOpen(false)
  }
  const exportCsv = async () => {
    if (exportState === 'working') return
    setExportState('working')
    try { if (await databaseRepository.exportCsv(`${snapshot.schema.name}-${activeView.name}`, serializeDatabaseCsv(snapshot.schema, records))) { setExportState('done'); window.setTimeout(() => setExportState('idle'), 1800) } else setExportState('idle') }
    catch { setExportState('idle') }
  }
  const saveEditedTemplate = async (draft: Pick<DatabaseTemplate, 'name' | 'values' | 'content'>) => {
    const now = new Date().toISOString()
    const existing = editingTemplate && editingTemplate !== 'new' ? editingTemplate : null
    const template: DatabaseTemplate = { id: existing?.id ?? crypto.randomUUID(), databaseId: snapshot.schema.id, ...draft, createdAt: existing?.createdAt ?? now, updatedAt: now }
    setSnapshot(await databaseRepository.saveTemplate(snapshot, template)); setEditingTemplate(null)
  }
  const importCsvRecords = async (rows: Array<Record<string, PropertyValue>>) => {
    const now = new Date().toISOString()
    const imported = rows.map((values): DatabaseRecord => ({ id: crypto.randomUUID(), values, content: '', createdAt: now, updatedAt: now }))
    setSnapshot(await databaseRepository.importRecords(snapshot, imported)); setCsvImportOpen(false)
  }
  const duplicateSelectedRecord = async () => {
    const sourceId = [...selectedRecordIds][0]
    if (!sourceId || selectedRecordIds.size !== 1) return
    setSnapshot(await databaseRepository.duplicateRecord(snapshot, sourceId, crypto.randomUUID())); setSelectedRecordIds(new Set())
  }
  const trashSelectedRecords = async () => {
    if (!selectedRecordIds.size) return
    setSnapshot(await databaseRepository.trashRecords(snapshot, [...selectedRecordIds])); setSelectedRecordIds(new Set()); setOpenRecordId(null)
  }
  const openRecordTrash = async () => { setTrashedRecords(await databaseRepository.listTrashedRecords(snapshot.schema.id)); setRecordTrashOpen(true) }
  const restoreTrashedRecords = async (recordIds: string[]) => {
    setSnapshot(await databaseRepository.restoreRecords(snapshot, recordIds)); setTrashedRecords(await databaseRepository.listTrashedRecords(snapshot.schema.id))
  }
  const deleteTrashedRecords = async (recordIds: string[]) => {
    await databaseRepository.deleteRecordsPermanently(snapshot.schema.id, recordIds); setTrashedRecords(await databaseRepository.listTrashedRecords(snapshot.schema.id))
  }

  return (
    <section className="database-block">
      {constraintNotice && <div className="database-constraint-notice" role="alert"><CircleAlert size={14} />{constraintNotice}</div>}
      <div className="database-viewbar">
        <div className="database-tabs">
          {snapshot.views.map((view) => {
            const Icon = view.type === 'table' ? Table2 : view.type === 'board' ? Columns3 : view.type === 'calendar' ? CalendarDays : view.type === 'timeline' ? ChartNoAxesGantt : view.type === 'gallery' ? Images : List
            return <button className={view.id === activeView.id ? 'is-active' : ''} key={view.id} onClick={() => setView(view.id)}><Icon size={13} />{view.name}</button>
          })}
          <button className="database-view-add" aria-label="新建数据库视图" onClick={() => setViewMenuOpen('create')}><Plus size={14} /></button>
        </div>
        <div className="database-tools">
          {searchOpen ? <label className="database-inline-search"><Search size={13} /><input autoFocus aria-label="搜索当前数据库" value={searchQuery} placeholder="搜索" onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setSearchQuery(''); setSearchOpen(false) } }} /><button aria-label="关闭数据库搜索" onClick={() => { setSearchQuery(''); setSearchOpen(false) }}><X size={12} /></button></label> : <button aria-label="搜索当前数据库" onClick={() => { setQuickFilterOpen(false); setSearchOpen(true) }}><Search size={13} /></button>}
          <button className={viewMenuOpen === 'manage' ? 'is-active' : ''} aria-label="管理当前视图" onClick={() => { setLayoutOpen(false); setViewMenuOpen((current) => current === 'manage' ? null : 'manage') }}><MoreHorizontal size={14} /></button>
          <button className={schemaOpen ? 'is-active' : ''} onClick={() => { setLayoutOpen(false); setSchemaOpen(true) }}><Settings2 size={13} />属性 · {snapshot.schema.properties.length}</button>
          {activeView.type === 'table' && <button className={layoutOpen ? 'is-active' : ''} onClick={() => { setViewMenuOpen(null); setTemplateMenuOpen(false); setLayoutOpen((open) => !open) }}><SlidersHorizontal size={13} />布局</button>}
          <button className={activeView.config.filters?.length ? 'is-active' : ''} onClick={() => setRulesOpen('filters')}><Filter size={13} />筛选{activeView.config.filters?.length ? ` · ${activeView.config.filters.length}` : ''}</button>
          <button className={activeView.config.quickFilters?.length || quickFilterOpen ? 'is-active' : ''} onClick={() => { setLayoutOpen(false); setQuickFilterOpen((open) => !open) }}><Zap size={13} />快速{activeView.config.quickFilters?.length ? ` · ${activeView.config.quickFilters.length}` : ''}</button>
          <button className={activeView.config.sorts?.length ? 'is-active' : ''} onClick={() => setRulesOpen('sorts')}><ArrowUpDown size={13} />排序{activeView.config.sorts?.length ? ` · ${activeView.config.sorts.length}` : ''}</button>
          <button className={activeView.config.groupByPropertyId ? 'is-active' : ''} onClick={() => setRulesOpen('group')}><Layers3 size={13} />分组</button>
          <button className={templateMenuOpen ? 'is-active' : ''} onClick={() => { setLayoutOpen(false); setTemplateMenuOpen((open) => !open) }}><LayoutTemplate size={13} />模板{snapshot.templates?.length ? ` · ${snapshot.templates.length}` : ''}</button>
          <button className={csvImportOpen ? 'is-active' : ''} onClick={() => setCsvImportOpen(true)}><FileUp size={13} />导入</button>
          <button className={recordTrashOpen ? 'is-active' : ''} onClick={() => void openRecordTrash()}><Trash2 size={13} />回收站</button>
          <button onClick={() => void exportCsv()} disabled={exportState === 'working'}><Download size={13} />{exportState === 'working' ? '导出中' : exportState === 'done' ? '已导出' : 'CSV'}</button>
          <button className="database-automation" onClick={() => setAutomationOpen(true)}><Zap size={13} />自动化 · {automations.filter((rule) => rule.enabled).length}</button>
          <button className="database-new" onClick={addRecord}><Plus size={13} />新建</button>
        </div>
        {viewMenuOpen && <ViewManagementMenu key={`${viewMenuOpen}-${activeView.id}`} mode={viewMenuOpen} views={snapshot.views} activeView={activeView} defaultViewId={snapshot.views[0]!.id} onClose={() => setViewMenuOpen(null)} onCreate={createView} onRename={async (name) => { setSnapshot(await databaseRepository.renameView(snapshot, activeView.id, name)); setViewMenuOpen(null) }} onDuplicate={duplicateView} onDelete={async () => { setSnapshot(await databaseRepository.deleteView(snapshot, activeView.id)); setViewMenuOpen(null) }} onSetDefault={async () => { setSnapshot(await databaseRepository.setDefaultView(snapshot, activeView.id)); setViewMenuOpen(null) }} />}
        {templateMenuOpen && <DatabaseTemplateMenu templates={snapshot.templates ?? []} selectedCount={selectedRecordIds.size} onClose={() => setTemplateMenuOpen(false)} onCreateBlank={addRecord} onApply={createFromTemplate} onEdit={(template) => { setTemplateMenuOpen(false); setEditingTemplate(template ?? 'new') }} onSaveSelection={saveSelectionAsTemplate} onDelete={async (templateId) => setSnapshot(await databaseRepository.deleteTemplate(snapshot, templateId))} />}
        {quickFilterOpen && <QuickFilterMenu schema={snapshot.schema} filters={activeView.config.quickFilters ?? []} onClose={() => setQuickFilterOpen(false)} onChange={(quickFilters) => saveViewConfig({ ...activeView.config, quickFilters })} />}
        {layoutOpen && <ViewLayoutMenu schema={snapshot.schema} config={activeView.config} onClose={() => setLayoutOpen(false)} onSave={saveViewConfig} />}
      </div>
      {selectedRecordIds.size > 0 && <BulkEditToolbar schema={snapshot.schema} count={selectedRecordIds.size} onClear={() => setSelectedRecordIds(new Set())} onDuplicate={duplicateSelectedRecord} onTrash={trashSelectedRecords} onApply={async (propertyId, value) => { setSnapshot(await databaseRepository.bulkUpdate(snapshot, [...selectedRecordIds], propertyId, value)); setSelectedRecordIds(new Set()) }} />}
      <div className="database-summary"><DatabaseNameEditor name={snapshot.schema.name} onRename={async (name) => { const next = await databaseRepository.rename(snapshot, name); setSnapshot(next); setDatabaseSources((current) => current.map((source) => source.id === next.schema.id ? { ...source, name: next.schema.name } : source)) }} /><span className="database-compute-mark">已更新 {projection.recomputedCount} 项</span><span>{records.length} / {snapshot.records.length} 条记录</span></div>
      {(activeView.config.quickFilters?.length || searchQuery) && <div className="database-active-query">{searchQuery && <span><Search size={11} />“{searchQuery}”<button aria-label="清除数据库搜索" onClick={() => setSearchQuery('')}><X size={10} /></button></span>}{activeView.config.quickFilters?.map((filter, index) => <span key={`${filter.propertyId}-${index}`}><Filter size={11} />{quickFilterLabel(snapshot.schema, filter)}<button aria-label={`移除快速筛选 ${index + 1}`} onClick={() => saveViewConfig({ ...activeView.config, quickFilters: activeView.config.quickFilters?.filter((_, candidate) => candidate !== index) })}><X size={10} /></button></span>)}</div>}
      <ViewRuleSummary config={activeView.config} schema={snapshot.schema} onOpen={setRulesOpen} />
      {recordGroups.length > 0 && <GroupLedger groups={recordGroups} schema={snapshot.schema} propertyId={activeView.config.groupByPropertyId} collapsedKeys={collapsedGroups} onToggle={toggleGroup} />}
      {activeView.type === 'table' && <GenericTable records={records} schema={snapshot.schema} config={activeView.config} onConfigChange={saveViewConfig} relationTargets={{ ...relationTargets, [snapshot.schema.id]: { schema: snapshot.schema, records: derivedRecords } }} updateCell={updateCell} onOpenRecord={setOpenRecordId} selectedIds={selectedRecordIds} onToggleRecord={toggleRecord} onToggleAll={toggleAllRecords} onReorder={(recordId, targetId) => moveRecord(recordId, targetId)} />}
      {activeView.type === 'board' && <BoardView records={records} schema={snapshot.schema} groupByPropertyId={activeView.config.groupByPropertyId} updateCell={updateCell} onMove={(recordId, groupValue, targetId) => activeView.config.groupByPropertyId && moveRecord(recordId, targetId, { propertyId: activeView.config.groupByPropertyId, value: groupValue })} manualOrderEnabled={!activeView.config.sorts?.length} />}
      {activeView.type === 'list' && <ListView records={records} updateCell={updateCell} />}
      {activeView.type === 'calendar' && <CalendarView records={records} schema={snapshot.schema} datePropertyId={activeView.config.datePropertyId} updateCell={updateCell} />}
      {activeView.type === 'timeline' && <TimelineView records={records} schema={snapshot.schema} startDatePropertyId={activeView.config.startDatePropertyId} endDatePropertyId={activeView.config.endDatePropertyId} updateCell={updateCell} />}
      {activeView.type === 'gallery' && <GalleryView records={records} schema={snapshot.schema} coverPropertyId={activeView.config.coverPropertyId} visiblePropertyIds={activeView.config.visiblePropertyIds} cardSize={activeView.config.cardSize} updateCell={updateCell} />}
      {rulesOpen && createPortal(<ViewRulesPanel schema={snapshot.schema} config={activeView.config} initialTab={rulesOpen} onClose={() => setRulesOpen(null)} onSave={(config) => { saveViewConfig(config); setRulesOpen(null) }} />, document.body)}
      {schemaOpen && createPortal(<SchemaPanel schema={snapshot.schema} previewRecord={derivedRecords[0]} databaseSources={databaseSources} relationTargets={{ ...relationTargets, [snapshot.schema.id]: { schema: snapshot.schema, records: derivedRecords } }} onClose={() => setSchemaOpen(false)} onAdd={async (name, type) => setSnapshot(await databaseRepository.addProperty(snapshot, name, type))} onRename={async (propertyId, name) => setSnapshot(await databaseRepository.renameProperty(snapshot, propertyId, name))} onReorder={async (propertyIds) => setSnapshot(await databaseRepository.reorderProperties(snapshot, propertyIds))} onConfigure={async (propertyId, config) => setSnapshot(await databaseRepository.updatePropertyConfig(snapshot, propertyId, config))} onDelete={async (propertyId) => setSnapshot(await databaseRepository.deleteProperty(snapshot, propertyId))} />, document.body)}
      {editingTemplate && createPortal(<TemplateEditorPanel schema={snapshot.schema} template={editingTemplate === 'new' ? null : editingTemplate} onClose={() => setEditingTemplate(null)} onSave={saveEditedTemplate} />, document.body)}
      {csvImportOpen && createPortal(<CsvImportPanel schema={snapshot.schema} onClose={() => setCsvImportOpen(false)} onImport={importCsvRecords} />, document.body)}
      {recordTrashOpen && createPortal(<RecordTrashPanel records={trashedRecords} onClose={() => setRecordTrashOpen(false)} onRestore={restoreTrashedRecords} onDeletePermanently={deleteTrashedRecords} />, document.body)}
      {openRecordId && derivedRecords.find((record) => record.id === openRecordId) && createPortal(<RecordDetailPanel key={openRecordId} record={derivedRecords.find((record) => record.id === openRecordId)!} schema={snapshot.schema} relationTargets={{ ...relationTargets, [snapshot.schema.id]: { schema: snapshot.schema, records: derivedRecords } }} onClose={() => setOpenRecordId(null)} onUpdateCell={updateCell} onUpdateContent={updateRecordContent} onListHistory={() => databaseRepository.listRecordHistory(openRecordId)} onRestoreHistory={async (historyId) => { setSnapshot(await databaseRepository.restoreRecordHistory(snapshot, historyId)); setOpenRecordId(null) }} onListComments={(unresolvedOnly) => databaseRepository.listRecordComments(openRecordId, unresolvedOnly)} onCreateComment={(propertyId, body) => databaseRepository.createRecordComment(openRecordId, propertyId, snapshot.schema.properties.find((property) => property.id === propertyId)?.name ?? '整条记录', body)} onResolveComment={(id, resolved) => databaseRepository.resolveRecordComment(openRecordId, id, resolved)} onDeleteComment={(id) => databaseRepository.deleteRecordComment(openRecordId, id)} />, document.body)}
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

function DatabaseNameEditor({ name, onRename }: { name: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(name), [name])
  const save = async () => {
    const normalized = draft.trim()
    if (!normalized || normalized === name) { setDraft(name); setEditing(false); return }
    setBusy(true); try { await onRename(normalized); setEditing(false) } finally { setBusy(false) }
  }
  return editing ? <span className="database-name-editor"><input aria-label="数据库名称" autoFocus maxLength={200} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => void save()} onKeyDown={(event) => { if (event.key === 'Enter') void save(); if (event.key === 'Escape') { setDraft(name); setEditing(false) } }} /><i>{busy ? '保存中' : 'Enter 保存'}</i></span>
    : <button className="database-name-trigger" title="重命名数据库" onClick={() => setEditing(true)}><span>{name}</span><PencilLine size={10} /></button>
}

const databaseViewTypes: Array<{ type: DatabaseView['type']; label: string; description: string; icon: typeof Table2 }> = [
  { type: 'table', label: '表格', description: '按属性列查看记录', icon: Table2 },
  { type: 'board', label: '看板', description: '按状态分组卡片', icon: Columns3 },
  { type: 'list', label: '列表', description: '紧凑浏览记录', icon: List },
  { type: 'calendar', label: '日历', description: '按日期安排记录', icon: CalendarDays },
  { type: 'timeline', label: '时间轴', description: '查看日期范围', icon: ChartNoAxesGantt },
  { type: 'gallery', label: '画廊', description: '以卡片展示内容', icon: Images },
]

function defaultViewConfig(schema: DatabaseSchema, type: DatabaseView['type']): DatabaseViewConfig {
  const dates = schema.properties.filter((property) => property.type === 'date')
  const selectable = schema.properties.find((property) => ['select', 'multiSelect'].includes(property.type))
  const cover = schema.properties.find((property) => property.type === 'url')
  if (type === 'board') return selectable ? { groupByPropertyId: selectable.id } : {}
  if (type === 'calendar') return dates[0] ? { datePropertyId: dates[0].id } : {}
  if (type === 'timeline') return { startDatePropertyId: dates[0]?.id, endDatePropertyId: dates[1]?.id ?? dates[0]?.id }
  if (type === 'gallery') return { coverPropertyId: cover?.id, visiblePropertyIds: schema.properties.filter((property) => property.type !== 'title').slice(0, 3).map((property) => property.id), cardSize: 'medium' }
  return {}
}

export function QuickFilterMenu({ schema, filters, onClose, onChange }: { schema: DatabaseSchema; filters: FilterRule[]; onClose: () => void; onChange: (filters: FilterRule[]) => void }) {
  const available = schema.properties.filter((property) => !filters.some((filter) => filter.propertyId === property.id))
  const initialProperty = available.find((property) => property.type === 'select') ?? available.find((property) => property.type === 'checkbox') ?? available[0] ?? schema.properties[0]!
  const [propertyId, setPropertyId] = useState(initialProperty.id)
  const property = schema.properties.find((candidate) => candidate.id === propertyId) ?? initialProperty
  const [value, setValue] = useState<PropertyValue>(() => quickFilterDefaultValue(initialProperty))
  const selectProperty = (nextId: string) => {
    const next = schema.properties.find((candidate) => candidate.id === nextId) ?? initialProperty
    setPropertyId(next.id); setValue(quickFilterDefaultValue(next))
  }
  const add = () => {
    if (filters.length >= 5 || filters.some((filter) => filter.propertyId === property.id)) return
    const nextFilters = [...filters, { propertyId: property.id, operator: quickFilterOperator(property), value }]
    onChange(nextFilters)
    const nextProperty = schema.properties.find((candidate) => !nextFilters.some((filter) => filter.propertyId === candidate.id))
    if (nextProperty) selectProperty(nextProperty.id)
  }
  return <section className="quick-filter-menu" role="dialog" aria-label="快速筛选">
    <header><span><Filter size={13} /><strong>快速筛选</strong></span><button aria-label="关闭快速筛选" onClick={onClose}><X size={13} /></button></header>
    {filters.length > 0 && <div className="quick-filter-list">{filters.map((filter, index) => <span key={`${filter.propertyId}-${index}`}>{quickFilterLabel(schema, filter)}<button aria-label={`删除快速筛选 ${index + 1}`} onClick={() => onChange(filters.filter((_, candidate) => candidate !== index))}><X size={11} /></button></span>)}</div>}
    {available.length > 0 && filters.length < 5 ? <div className="quick-filter-composer"><select aria-label="快速筛选属性" value={property.id} onChange={(event) => selectProperty(event.target.value)}>{available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><QuickFilterValueInput property={property} value={value} onChange={setValue} /><button onClick={add}><Plus size={12} />添加</button></div> : <p>当前视图已添加全部可用的快速筛选。</p>}
    <footer>快速筛选按“全部满足”组合，并随当前视图保存。</footer>
  </section>
}

function QuickFilterValueInput({ property, value, onChange }: { property: DatabaseProperty; value: PropertyValue; onChange: (value: PropertyValue) => void }) {
  if (['select', 'multiSelect'].includes(property.type) && property.options?.length) return <select aria-label="快速筛选值" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>{property.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
  if (property.type === 'checkbox') return <select aria-label="快速筛选值" value={String(value)} onChange={(event) => onChange(event.target.value === 'true')}><option value="true">已勾选</option><option value="false">未勾选</option></select>
  return <input aria-label="快速筛选值" type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'} value={String(value ?? '')} placeholder="输入值" onChange={(event) => onChange(property.type === 'number' ? Number(event.target.value) : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.closest('.quick-filter-composer')?.querySelector<HTMLButtonElement>('button')?.click() }} />
}

function quickFilterOperator(property: DatabaseProperty): FilterRule['operator'] { return ['title', 'text', 'url', 'multiSelect', 'relation'].includes(property.type) ? 'contains' : 'equals' }
function quickFilterDefaultValue(property: DatabaseProperty): PropertyValue { return ['select', 'multiSelect'].includes(property.type) ? property.options?.[0]?.id ?? '' : property.type === 'checkbox' ? true : property.type === 'number' ? 0 : '' }
function quickFilterLabel(schema: DatabaseSchema, filter: FilterRule) {
  const property = schema.properties.find((candidate) => candidate.id === filter.propertyId)
  const raw = Array.isArray(filter.value) ? filter.value.join(', ') : filter.value
  const value = property?.options?.find((option) => option.id === raw)?.name ?? (typeof raw === 'boolean' ? raw ? '已勾选' : '未勾选' : String(raw ?? ''))
  return `${property?.name ?? filter.propertyId} · ${value}`
}

export function ViewLayoutMenu({ schema, config, onClose, onSave }: { schema: DatabaseSchema; config: DatabaseViewConfig; onClose: () => void; onSave: (config: DatabaseViewConfig) => void }) {
  const [draft, setDraft] = useState<DatabaseViewConfig>(() => structuredClone(config))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const titleId = schema.properties.find((property) => property.type === 'title')?.id
  const propertyById = new Map(schema.properties.map((property) => [property.id, property]))
  const orderedIds = [...new Set([...(draft.propertyOrder ?? []), ...schema.properties.map((property) => property.id)])].filter((id) => propertyById.has(id))
  const orderedProperties = orderedIds.map((id) => propertyById.get(id)!)
  const visible = new Set(draft.visiblePropertyIds ?? schema.properties.map((property) => property.id))
  if (titleId) visible.add(titleId)
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  const commit = (next: DatabaseViewConfig) => { setDraft(next); onSave(next) }
  const toggle = (propertyId: string) => {
    if (propertyId === titleId) return
    const nextVisible = new Set(visible)
    if (nextVisible.has(propertyId)) nextVisible.delete(propertyId); else nextVisible.add(propertyId)
    commit({ ...draft, visiblePropertyIds: orderedProperties.filter((property) => nextVisible.has(property.id)).map((property) => property.id) })
  }
  const reorder = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return
    const ids = [...orderedIds]; const from = ids.indexOf(draggingId); const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0]!); setDraggingId(null); commit({ ...draft, propertyOrder: ids })
  }
  const visibleCount = schema.properties.filter((property) => visible.has(property.id)).length
  return <section className="database-layout-menu" role="dialog" aria-label="表格布局">
    <header><div><strong>表格布局</strong><small>仅作用于当前视图</small></div><button aria-label="关闭表格布局" onClick={onClose}><X size={14} /></button></header>
    <div className="layout-density"><span><Rows3 size={14} />行高</span><div>{(['compact', 'default', 'comfortable'] as const).map((density) => <button aria-pressed={(draft.rowHeight ?? 'default') === density} className={(draft.rowHeight ?? 'default') === density ? 'is-selected' : ''} key={density} onClick={() => commit({ ...draft, rowHeight: density })}>{density === 'compact' ? '紧凑' : density === 'default' ? '标准' : '宽松'}</button>)}</div></div>
    <button className={`layout-freeze ${draft.freezeFirstColumn ? 'is-active' : ''}`} aria-pressed={Boolean(draft.freezeFirstColumn)} onClick={() => commit({ ...draft, freezeFirstColumn: !draft.freezeFirstColumn })}><Lock size={14} /><span><strong>冻结首列</strong><small>横向滚动时保持第一列可见</small></span><i /></button>
    <div className="layout-property-heading"><span>显示与排序</span><em>{visibleCount} / {schema.properties.length}</em></div>
    <div className="layout-property-list">{orderedProperties.map((property) => { const shown = visible.has(property.id); return <div className={`layout-property-row ${draggingId === property.id ? 'is-dragging' : ''}`} key={property.id} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(property.id)}><button className="layout-property-drag" draggable aria-label={`调整视图属性顺序 ${property.name}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggingId(property.id) }} onDragEnd={() => setDraggingId(null)}><GripVertical size={13} /></button><i>{propertyTypeLabel(property.type)}</i><span>{property.name}</span><button className="layout-property-visibility" aria-label={`${shown ? '隐藏' : '显示'}属性 ${property.name}`} disabled={property.id === titleId} onClick={() => toggle(property.id)}>{shown ? <Eye size={14} /> : <EyeOff size={14} />}</button></div> })}</div>
    <footer><button onClick={() => commit({ ...draft, propertyWidths: {}, propertyOrder: schema.properties.map((property) => property.id) })}>重置布局</button><span>列底可选择计算方式</span></footer>
  </section>
}

export function ViewManagementMenu({ mode, views, activeView, defaultViewId, onClose, onCreate, onRename, onDuplicate, onDelete, onSetDefault }: {
  mode: 'create' | 'manage'; views: DatabaseView[]; activeView: DatabaseView; defaultViewId: string; onClose: () => void
  onCreate: (name: string, type: DatabaseView['type']) => Promise<void>; onRename: (name: string) => Promise<void>
  onDuplicate: () => Promise<void>; onDelete: () => Promise<void>; onSetDefault: () => Promise<void>
}) {
  const [name, setName] = useState(mode === 'create' ? '新视图' : activeView.name)
  const [type, setType] = useState<DatabaseView['type']>('table')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close)
  }, [onClose])
  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。') } finally { setBusy(false) }
  }
  if (mode === 'create') return <section className="database-view-menu is-create" role="dialog" aria-label="新建数据库视图">
    <header><strong>新建视图</strong><button aria-label="关闭新建视图" onClick={onClose}><X size={14} /></button></header>
    <label><span>视图名称</span><input autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) void run(() => onCreate(name.trim(), type)) }} /></label>
    <div className="database-view-types">{databaseViewTypes.map((candidate) => { const Icon = candidate.icon; return <button className={type === candidate.type ? 'is-selected' : ''} key={candidate.type} onClick={() => setType(candidate.type)}><Icon size={16} /><span><strong>{candidate.label}</strong><small>{candidate.description}</small></span>{type === candidate.type && <Check size={14} />}</button> })}</div>
    {error && <p>{error}</p>}
    <footer><button onClick={onClose}>取消</button><button disabled={!name.trim() || busy} onClick={() => void run(() => onCreate(name.trim(), type))}>{busy ? '创建中…' : '创建'}</button></footer>
  </section>
  return <section className="database-view-menu is-manage" role="dialog" aria-label="管理数据库视图">
    <header><strong>视图选项</strong><button aria-label="关闭视图选项" onClick={onClose}><X size={14} /></button></header>
    <label><span>名称</span><input autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && name.trim() && name.trim() !== activeView.name) void run(() => onRename(name.trim())) }} /></label>
    <div className="database-view-actions">
      <button disabled={busy || name.trim() === activeView.name || !name.trim()} onClick={() => void run(() => onRename(name.trim()))}><Check size={14} /><span>保存名称</span></button>
      <button disabled={busy} onClick={() => void run(onDuplicate)}><Copy size={14} /><span>复制视图</span></button>
      <button disabled={busy || activeView.id === defaultViewId} onClick={() => void run(onSetDefault)}><Star size={14} /><span>{activeView.id === defaultViewId ? '当前默认视图' : '设为默认视图'}</span></button>
      <button className={confirmDelete ? 'is-confirm-delete' : 'is-danger'} disabled={busy || views.length <= 1} onClick={() => { if (!confirmDelete) return setConfirmDelete(true); void run(onDelete) }}><Trash2 size={14} /><span>{views.length <= 1 ? '至少保留一个视图' : confirmDelete ? '确认删除此视图' : '删除视图'}</span></button>
    </div>
    {error && <p>{error}</p>}
  </section>
}

export function DatabaseTemplateMenu({ templates, selectedCount, onClose, onCreateBlank, onApply, onEdit, onSaveSelection, onDelete }: {
  templates: DatabaseTemplate[]; selectedCount: number; onClose: () => void; onCreateBlank: () => void
  onApply: (templateId: string) => Promise<void>; onEdit: (template: DatabaseTemplate | null) => void; onSaveSelection: (name: string) => Promise<void>; onDelete: (templateId: string) => Promise<void>
}) {
  const [name, setName] = useState('新模板')
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<void>) => { if (busy) return; setBusy(true); try { await action() } finally { setBusy(false) } }
  return <section className="database-template-menu" role="dialog" aria-label="数据库模板">
    <header><strong>新建记录</strong><button aria-label="关闭数据库模板" onClick={onClose}><X size={14} /></button></header>
    <button className="template-blank" onClick={() => { onCreateBlank(); onClose() }}><Plus size={15} /><span><strong>空白记录</strong><small>使用数据库默认值</small></span></button>
    <button className="template-blank is-template" onClick={() => onEdit(null)}><LayoutTemplate size={15} /><span><strong>新建模板</strong><small>编辑属性预设与页面正文</small></span></button>
    <div className="database-template-list">
      <small>模板</small>
      {templates.map((template) => <div key={template.id}><button disabled={busy} onClick={() => void run(() => onApply(template.id))}><LayoutTemplate size={15} /><span><strong>{template.name}</strong><small>{Object.keys(template.values).length} 个预设属性</small></span></button><button aria-label={`编辑模板 ${template.name}`} onClick={() => onEdit(template)}><PencilLine size={13} /></button><button aria-label={`删除模板 ${template.name}`} disabled={busy} onClick={() => void run(() => onDelete(template.id))}><Trash2 size={13} /></button></div>)}
      {!templates.length && <p>还没有模板。选中一条记录后，可以将它保存为模板。</p>}
    </div>
    <footer><input aria-label="模板名称" value={name} maxLength={200} disabled={!selectedCount} onChange={(event) => setName(event.target.value)} /><button disabled={!selectedCount || !name.trim() || busy} onClick={() => void run(() => onSaveSelection(name.trim()))}>保存所选记录{selectedCount > 1 ? '中的第一条' : ''}</button></footer>
  </section>
}

export function TemplateEditorPanel({ schema, template, onClose, onSave }: {
  schema: DatabaseSchema; template: DatabaseTemplate | null; onClose: () => void
  onSave: (draft: Pick<DatabaseTemplate, 'name' | 'values' | 'content'>) => Promise<void>
}) {
  const properties = schema.properties.filter((property) => !['title', 'formula', 'rollup', 'relation'].includes(property.type))
  const [name, setName] = useState(template?.name ?? '新模板')
  const [values, setValues] = useState<Record<string, PropertyValue>>(() => Object.fromEntries(properties.map((property) => [property.id, template?.values[property.id] ?? defaultPropertyValue(property)])))
  const [content, setContent] = useState(template?.content ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [busy, onClose])
  return <div className="schema-panel-backdrop template-editor-backdrop" onMouseDown={onClose}><section className="template-editor-panel" role="dialog" aria-modal="true" aria-label="编辑数据库模板" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="template-editor-icon"><LayoutTemplate size={18} /></span><span><small>{template ? 'EDIT DATABASE TEMPLATE' : 'NEW DATABASE TEMPLATE'}</small><strong>{template ? '编辑记录模板' : '创建记录模板'}</strong></span></div><button aria-label="关闭模板编辑器" onClick={onClose}><X size={15} /></button></header>
    <main>
      <label className="template-name-field"><span>模板名称</span><input autoFocus maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <section className="template-property-section"><div><strong>属性预设</strong><small>使用模板新建记录时自动填入</small></div>{properties.map((property) => <label key={property.id}><span><i>{propertyTypeLabel(property.type)}</i>{property.name}</span><TemplateValueInput property={property} value={values[property.id] ?? null} onChange={(value) => setValues((current) => ({ ...current, [property.id]: value }))} /></label>)}</section>
      <section className="template-content-field"><span><strong>页面正文</strong><small>标题、清单与段落会原样带入新记录</small></span><TemplateContentEditor initialContent={content} onChange={setContent} /></section>
    </main>
    <footer><span>模板只保存预设，不会修改已有记录。</span><div><button onClick={onClose}>取消</button><button disabled={!name.trim() || busy} onClick={() => { setBusy(true); void onSave({ name: name.trim(), values, content }).finally(() => setBusy(false)) }}>{busy ? '保存中…' : '保存模板'}</button></div></footer>
  </section></div>
}

function TemplateContentEditor({ initialContent, onChange }: { initialContent: string; onChange: (content: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: "输入 '/' 的体验会在后续扩展；现在可以直接编写模板正文…" })],
    content: initialContent || '<p></p>', immediatelyRender: false,
    onUpdate: ({ editor: activeEditor }) => onChange(activeEditor.getHTML()),
  })
  return <div className="template-rich-editor"><EditorContent editor={editor} /></div>
}

function TemplateValueInput({ property, value, onChange }: { property: DatabaseProperty; value: PropertyValue; onChange: (value: PropertyValue) => void }) {
  const label = `${property.name} 模板预设`
  if (property.type === 'checkbox') return <input aria-label={label} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
  if (property.type === 'select') return <select aria-label={label} value={String(value ?? '')} onChange={(event) => onChange(event.target.value || null)}><option value="">未选择</option>{property.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
  const textValue = Array.isArray(value) ? value.join(', ') : String(value ?? '')
  return <input aria-label={label} type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : property.type === 'url' ? 'url' : 'text'} value={textValue} placeholder="留空" onChange={(event) => onChange(property.type === 'number' ? (event.target.value ? Number(event.target.value) : null) : property.type === 'multiSelect' ? event.target.value.split(/[,，]/u).map((item) => item.trim()).filter(Boolean) : event.target.value || null)} />
}

export function CsvImportPanel({ schema, onClose, onImport }: {
  schema: DatabaseSchema; onClose: () => void; onImport: (rows: Array<Record<string, PropertyValue>>) => Promise<void>
}) {
  const writable = schema.properties.filter((property) => !['formula', 'rollup', 'relation'].includes(property.type))
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedDatabaseCsv | null>(null)
  const [mappings, setMappings] = useState<Array<string | null>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const choose = async (file?: File) => {
    if (!file) return
    setError('')
    try {
      const result = parseDatabaseCsv(await file.text())
      if (!result.headers.length || !result.rows.length) throw new TypeError('CSV 至少需要表头和一行数据。')
      setFileName(file.name); setParsed(result); setMappings(inferCsvPropertyMappings(result.headers, schema))
    } catch (reason) { setParsed(null); setError(reason instanceof Error ? reason.message : '无法读取 CSV。') }
  }
  const mappedCount = mappings.filter(Boolean).length
  const submit = async () => {
    if (!parsed || !mappedCount || busy) return
    const rows = parsed.rows.map((row) => Object.fromEntries(mappings.flatMap((propertyId, columnIndex) => {
      const property = writable.find((candidate) => candidate.id === propertyId)
      return property ? [[property.id, coerceCsvPropertyValue(property, row[columnIndex] ?? '')] as const] : []
    })))
    setBusy(true); setError('')
    try { await onImport(rows) } catch (reason) { setError(reason instanceof Error ? reason.message.split('Error: ').at(-1) ?? reason.message : '导入失败。'); setBusy(false) }
  }
  return <div className="schema-panel-backdrop csv-import-backdrop" onMouseDown={onClose}><section className="csv-import-panel" role="dialog" aria-modal="true" aria-label="导入 CSV" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span><FileUp size={18} /></span><div><small>IMPORT / CSV</small><strong>把表格带进数据库</strong></div></div><button aria-label="关闭 CSV 导入" onClick={onClose}><X size={15} /></button></header>
    <main>
      <label className={`csv-dropzone ${parsed ? 'has-file' : ''}`}><input type="file" accept=".csv,text/csv" onChange={(event) => void choose(event.target.files?.[0])} /><span>{parsed ? <CheckCircle2 size={20} /> : <FileUp size={20} />}</span><strong>{parsed ? fileName : '选择 CSV 文件'}</strong><small>{parsed ? `${parsed.rows.length} 行 · ${parsed.headers.length} 列${parsed.truncated ? ' · 已截取前 10,000 行' : ''}` : '支持 Excel、Numbers 与 Notion 导出的 UTF-8 CSV，最大 10 MB'}</small></label>
      {parsed && <><section className="csv-mapping"><div className="csv-mapping-head"><span>CSV 列</span><span>示例</span><span>数据库属性</span></div>{parsed.headers.map((header, index) => <label key={`${header}-${index}`}><strong>{header}</strong><span>{parsed.rows[0]?.[index] || '—'}</span><select aria-label={`${header} 映射属性`} value={mappings[index] ?? ''} onChange={(event) => setMappings((current) => current.map((value, candidate) => candidate === index ? event.target.value || null : value))}><option value="">不导入</option>{writable.map((property) => <option key={property.id} value={property.id}>{property.name} · {propertyTypeName(property.type)}</option>)}</select></label>)}</section><div className="csv-import-note"><CircleAlert size={14} /><span>导入会新增 {parsed.rows.length} 条记录，不覆盖已有内容。全部写入在一个本地事务中完成。</span></div></>}
      {error && <p className="csv-import-error">{error}</p>}
    </main>
    <footer><span>{parsed ? `已映射 ${mappedCount} / ${parsed.headers.length} 列` : '等待选择文件'}</span><div><button onClick={onClose}>取消</button><button disabled={!parsed || !mappedCount || busy} onClick={() => void submit()}>{busy ? '正在导入…' : parsed ? `导入 ${parsed.rows.length} 条记录` : '导入'}</button></div></footer>
  </section></div>
}

export function BulkEditToolbar({ schema, count, onClear, onApply, onDuplicate, onTrash }: { schema: DatabaseSchema; count: number; onClear: () => void; onApply: (propertyId: string, value: PropertyValue) => Promise<void>; onDuplicate?: () => Promise<void>; onTrash?: () => Promise<void> }) {
  const properties = schema.properties.filter((property) => !['formula', 'rollup', 'relation'].includes(property.type))
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '')
  const property = properties.find((candidate) => candidate.id === propertyId)
  const [value, setValue] = useState<string | boolean>('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setValue(property?.type === 'checkbox' ? false : ''), [propertyId])
  const parsedValue = (): PropertyValue => {
    if (property?.type === 'checkbox') return Boolean(value)
    if (property?.type === 'number') return value === '' ? null : Number(value)
    if (property?.type === 'multiSelect') return String(value).split(',').map((item) => item.trim()).filter(Boolean)
    return value === '' ? null : String(value)
  }
  return <div className="database-bulk-toolbar" role="toolbar" aria-label={`批量编辑 ${count} 条记录`}>
    <span><Check size={13} />已选择 {count} 条</span>
    <select aria-label="批量编辑属性" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>{properties.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
    {property?.type === 'select' ? <select aria-label="批量编辑值" value={String(value)} onChange={(event) => setValue(event.target.value)}><option value="">清空</option>{property.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
      : property?.type === 'checkbox' ? <label><input aria-label="批量编辑值" type="checkbox" checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} /><span>{value ? '已勾选' : '未勾选'}</span></label>
        : <input aria-label="批量编辑值" type={property?.type === 'number' ? 'number' : property?.type === 'date' ? 'date' : 'text'} value={String(value)} placeholder={property?.type === 'multiSelect' ? '用逗号分隔多个值' : '输入统一值'} onChange={(event) => setValue(event.target.value)} />}
    <button disabled={!propertyId || busy} onClick={() => { setBusy(true); void onApply(propertyId, parsedValue()).finally(() => setBusy(false)) }}>{busy ? '应用中…' : '应用'}</button>
    {onDuplicate && <button className="bulk-secondary" disabled={count !== 1 || busy} onClick={() => { setBusy(true); void onDuplicate().finally(() => setBusy(false)) }}><Copy size={12} />复制</button>}
    {onTrash && <button className="bulk-danger" disabled={busy} onClick={() => { setBusy(true); void onTrash().finally(() => setBusy(false)) }}><Trash2 size={12} />删除</button>}
    <button aria-label="取消批量选择" onClick={onClear}><X size={14} /></button>
  </div>
}

export function RecordTrashPanel({ records, onClose, onRestore, onDeletePermanently }: { records: DatabaseTrashRecord[]; onClose: () => void; onRestore: (recordIds: string[]) => Promise<void>; onDeletePermanently: (recordIds: string[]) => Promise<void> }) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  const restore = async (id: string) => { setBusyId(id); try { await onRestore([id]) } finally { setBusyId(null) } }
  const remove = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); return }
    setBusyId(id); try { await onDeletePermanently([id]); setConfirmId(null) } finally { setBusyId(null) }
  }
  return <div className="record-trash-backdrop" onMouseDown={onClose}><section className="record-trash-panel" role="dialog" aria-modal="true" aria-label="数据库记录回收站" onMouseDown={(event) => event.stopPropagation()}>
    <header><span><Trash2 size={15} /><div><small>DATABASE TRASH</small><strong>记录回收站</strong></div></span><button aria-label="关闭记录回收站" onClick={onClose}><X size={15} /></button></header>
    <main>{records.map((record) => <article key={record.id}><span><strong>{record.title || '无标题'}</strong><small>删除于 {new Date(record.trashedAt).toLocaleString('zh-CN')}</small></span><button disabled={busyId !== null} onClick={() => void restore(record.id)}><RotateCcw size={12} />恢复</button><button className={confirmId === record.id ? 'is-confirm' : ''} disabled={busyId !== null} onClick={() => void remove(record.id)}><Trash2 size={12} />{confirmId === record.id ? '确认永久删除' : '永久删除'}</button></article>)}{!records.length && <div className="record-trash-empty"><Trash2 size={20} /><strong>回收站是空的</strong><span>删除的数据库记录会保留在这里，直到永久删除。</span></div>}</main>
    <footer><span>{records.length} 条已删除记录</span><button onClick={onClose}>完成</button></footer>
  </section></div>
}

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
  const [deletePending, setDeletePending] = useState<string | null>(null)
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
    <header><div><small>SCHEMA DESK / {schema.name.toLocaleUpperCase()}</small><strong>定义资料的骨架</strong></div><button aria-label="关闭属性管理" onClick={onClose}><X size={15} /></button></header>
    <main className="schema-workbench"><section className="schema-ledger"><div className="schema-ledger-head"><span>序号</span><span>属性名称</span><span>类型</span><span>操作</span></div>{schema.properties.map((property, index) => {
      const configurable = true
      return <div className={`schema-ledger-row ${editingPropertyId === property.id ? 'is-selected' : ''} ${draggingPropertyId === property.id ? 'is-dragging' : ''}`} key={property.id} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(property.id)}><em><button draggable aria-label={`拖动排序 ${property.name}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; setDraggingPropertyId(property.id) }} onDragEnd={() => setDraggingPropertyId(null)}><GripVertical size={13} /></button>{String(index + 1).padStart(2, '0')}</em><input aria-label={`${property.name} 属性名称`} defaultValue={property.name} maxLength={100} onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== property.name) void onRename(property.id, next) }} /><span><i>{propertyTypeLabel(property.type)}</i>{propertyTypeName(property.type)}</span><div>{configurable && <button aria-label={`配置 ${property.name}`} onClick={() => setEditingPropertyId(property.id)}><Settings2 size={12} /></button>}{property.type === 'title' ? <small>主属性</small> : <button aria-label={`删除属性 ${property.name}`} className={deletePending === property.id ? 'is-confirm' : ''} onClick={() => { if (deletePending !== property.id) return setDeletePending(property.id); void onDelete(property.id).then(() => setDeletePending(null)) }}><Trash2 size={11} /></button>}</div></div>
    })}</section>{editingProperty && <PropertyConfigEditor key={editingProperty.id} property={editingProperty} schema={schema} previewRecord={previewRecord} databaseSources={databaseSources} relationTargets={relationTargets} onClose={() => setEditingPropertyId(null)} onSave={async (config) => { setBusy(true); try { await onConfigure(editingProperty.id, config); setEditingPropertyId(null) } finally { setBusy(false) } }} />}</main>
    <footer><div><input aria-label="新属性名称" placeholder="属性名称" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void add() }} /><select aria-label="新属性类型" value={type} onChange={(event) => setType(event.target.value as typeof type)}>{writablePropertyTypes.map((candidate) => <option disabled={candidate.id === 'rollup' && !schema.properties.some((property) => property.type === 'relation')} key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select><button disabled={!name.trim() || busy || schema.properties.length >= 50 || (type === 'rollup' && !schema.properties.some((property) => property.type === 'relation'))} onClick={() => void add()}><Plus size={12} />{busy ? '添加中' : '添加属性'}</button></div><span>{schema.properties.length} / 50 个属性 · 拖动手柄调整顺序 · 标题属性受保护</span></footer>
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
  const [expression, setExpression] = useState(property.formula?.expression ?? '""')
  const derived = ['formula', 'rollup'].includes(property.type)
  const uniqueSupported = !['checkbox', 'multiSelect', 'relation', 'formula', 'rollup'].includes(property.type)
  const [required, setRequired] = useState(property.constraints?.required ?? false)
  const [unique, setUnique] = useState(property.constraints?.unique ?? false)
  const [defaultValue, setDefaultValue] = useState<PropertyValue>(() => property.constraints && Object.hasOwn(property.constraints, 'defaultValue') ? property.constraints.defaultValue ?? null : null)
  const relationProperties = schema.properties.filter((candidate) => candidate.type === 'relation' && candidate.relation)
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
    const base: PropertyConfig = ['select', 'multiSelect'].includes(property.type) ? { options } : property.type === 'relation' ? { relation: { databaseId: relationDatabaseId } } : property.type === 'rollup' ? { rollup: { relationPropertyId: rollupRelationId, targetPropertyId: rollupTargetPropertyId, aggregation: rollupAggregation } } : property.type === 'formula' ? { formula: { expression: expression.trim() } } : {}
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
    {property.type === 'relation' && <div className="relation-config"><p>选择要关联的数据库。已有不属于新目标的关联值将保留显示，但再次编辑时需要重新选择。</p><label><span>目标数据库</span><select aria-label="关联目标数据库" value={relationDatabaseId} onChange={(event) => setRelationDatabaseId(event.target.value)}>{databaseSources.map((source) => <option key={source.id} value={source.id}>{source.name} · {source.recordCount} 条</option>)}</select></label><div className="relation-preview"><Link2 size={15} /><span><small>RELATION TARGET</small><strong>{databaseSources.find((source) => source.id === relationDatabaseId)?.pageTitle ?? schema.name}</strong></span></div></div>}
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

function propertyTypeName(type: PropertyType) {
  return ({ title: '标题', text: '文本', number: '数字', checkbox: '复选框', select: '单选', multiSelect: '多选', date: '日期', url: '网址', relation: '关联', rollup: '汇总', formula: '公式' } as const)[type]
}

function ViewRuleSummary({ config, schema, onOpen }: { config: DatabaseViewConfig; schema: DatabaseSchema; onOpen: (tab: 'filters' | 'sorts' | 'group') => void }) {
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
      <header><div><small>VIEW COMPOSITOR / {schema.name.toLocaleUpperCase()}</small><strong>把视图排成一句话</strong></div><button aria-label="关闭视图规则" onClick={onClose}><X size={15} /></button></header>
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
      <header><div><span><Zap size={15} /></span><div><small>{schema.name}</small><strong>数据库自动化</strong></div></div><button onClick={onClose}><X size={16} /></button></header>
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
function formatPropertyValue(value: PropertyValue | undefined) { return Array.isArray(value) ? value.join('、') : value === null || value === undefined || value === '' ? '' : String(value) }
function displayAutomationValue(value: AutomationValue | undefined) { return Array.isArray(value) ? value.join(', ') : value === null || value === undefined ? '' : String(value) }
function parseAutomationValue(property: DatabaseProperty | undefined, value: string): AutomationValue {
  if (!value) return null
  if (property?.type === 'number') return Number.isFinite(Number(value)) ? Number(value) : null
  if (property?.type === 'checkbox') return ['true', '1', '是'].includes(value.toLocaleLowerCase())
  if (property?.type === 'relation' || property?.type === 'multiSelect') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return value
}

function defaultPropertyValue(property: DatabaseProperty): PropertyValue {
  if (property.constraints && Object.hasOwn(property.constraints, 'defaultValue')) return property.constraints.defaultValue ?? null
  if (property.type === 'title') return '新记录'
  if (property.type === 'select') return property.options?.[0]?.id ?? null
  if (property.type === 'date') return new Date().toISOString().slice(0, 10)
  if (property.type === 'checkbox') return false
  if (property.type === 'multiSelect' || property.type === 'relation') return []
  return null
}
