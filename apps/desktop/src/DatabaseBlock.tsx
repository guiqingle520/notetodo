import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ArrowUpDown, CalendarDays, ChartNoAxesGantt, Check, CheckCircle2, CircleAlert, Columns3, Copy, Download, FileUp, Filter, Images, Layers3, LayoutTemplate, List, MoreHorizontal, PencilLine, Plus, RotateCcw, Search, Settings2, SlidersHorizontal, Table2, Trash2, X, Zap } from 'lucide-react'
import { coerceCsvPropertyValue, groupRecordsByProperty, inferCsvPropertyMappings, moveRecordInOrder, normalizeViewConfig, orderRecordsByView, parseDatabaseCsv, queryRecords, resolveDerivedRecordsIncremental, searchDatabaseRecords, serializeDatabaseCsv, type DatabaseProperty, type DatabaseRecord, type DatabaseSchema, type DatabaseSnapshot, type DatabaseTemplate, type DatabaseTrashRecord, type DatabaseView, type DatabaseViewConfig, type ParsedDatabaseCsv, type PropertyValue } from '@notetodo/database-core'
import type { AutomationRule } from '@notetodo/automation-core'
import { databaseRepository } from './data/database-repository'
import { BoardView, GenericTable, ListView, RecordDetailPanel, propertyTypeLabel } from './DatabaseViews'
import { DatabaseNameEditor, defaultViewConfig } from './DatabaseBlockHelpers'
import { QuickFilterMenu, quickFilterLabel } from './DatabaseQuickFilter'
import { ViewLayoutMenu } from './DatabaseViewLayoutMenu'
import { ViewManagementMenu } from './DatabaseViewManagementMenu'
import { GroupLedger, SchemaPanel, ViewRuleSummary, ViewRulesPanel, propertyTypeName } from './DatabaseSchemaPanels'
import { AutomationPanel, CalendarView, GalleryView, TimelineView } from './DatabaseSpecialViews'
import { useDialogFocus } from './use-dialog-focus'
export { BoardView, GenericTable, ListView, RecordDetailPanel, VirtualTable } from './DatabaseViews'
export { QuickFilterMenu } from './DatabaseQuickFilter'
export { ViewLayoutMenu } from './DatabaseViewLayoutMenu'
export { ViewManagementMenu } from './DatabaseViewManagementMenu'
export { GroupLedger, SchemaPanel, ViewRulesPanel } from './DatabaseSchemaPanels'
export { GalleryView, TimelineView } from './DatabaseSpecialViews'

type AutomationRun = Awaited<ReturnType<NonNullable<typeof window.notetodo>['automations']['listRuns']>>[number]
const previewAutomation: AutomationRule = { id: 'completed-task-priority', name: '完成后归档优先级', enabled: true, trigger: { type: 'propertyChanged', propertyId: 'task-status' }, condition: { propertyId: 'task-status', operator: 'equals', value: 'done' }, actions: [{ type: 'setProperty', propertyId: 'task-score', value: 1 }] }

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
  useEffect(() => { if (!schemaOpen) return; void databaseRepository.listSources().then(async (sources) => { setDatabaseSources(sources); const loaded = await Promise.all(sources.map(async (source) => [source.id, await databaseRepository.loadByPage(source.pageId)] as const)); setRelationTargets(Object.fromEntries(loaded.filter((entry): entry is readonly [string, DatabaseSnapshot] => Boolean(entry[1])).map(([id, target]) => [id, { schema: target.schema, records: target.records }]))) }) }, [schemaOpen])
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
      <header className="database-summary">
        <DatabaseNameEditor name={snapshot.schema.name} onRename={async (name) => { const next = await databaseRepository.rename(snapshot, name); setSnapshot(next); setDatabaseSources((current) => current.map((source) => source.id === next.schema.id ? { ...source, name: next.schema.name } : source)) }} />
        <span className="database-compute-mark">已更新 {projection.recomputedCount} 项</span>
        <span>{records.length} / {snapshot.records.length} 条记录</span>
      </header>
      <div className="database-viewbar">
        <nav className="database-tabs" aria-label="数据库视图">
          {snapshot.views.map((view) => {
            const Icon = view.type === 'table' ? Table2 : view.type === 'board' ? Columns3 : view.type === 'calendar' ? CalendarDays : view.type === 'timeline' ? ChartNoAxesGantt : view.type === 'gallery' ? Images : List
            return <button className={view.id === activeView.id ? 'is-active' : ''} key={view.id} onClick={() => setView(view.id)}><Icon size={13} />{view.name}</button>
          })}
          <button className="database-view-add" aria-label="新建数据库视图" onClick={() => setViewMenuOpen('create')}><Plus size={14} /></button>
        </nav>
        <div className="database-tools" role="toolbar" aria-label="数据库工具">
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
      {openRecordId && derivedRecords.find((record) => record.id === openRecordId) && createPortal(<RecordDetailPanel key={openRecordId} record={derivedRecords.find((record) => record.id === openRecordId)!} schema={snapshot.schema} relationTargets={{ ...relationTargets, [snapshot.schema.id]: { schema: snapshot.schema, records: derivedRecords } }} onClose={() => setOpenRecordId(null)} onUpdateCell={updateCell} onUpdateContent={updateRecordContent} onListHistory={() => databaseRepository.listRecordHistory(openRecordId)} onRestoreHistory={async (historyId) => { setSnapshot(await databaseRepository.restoreRecordHistory(snapshot, historyId)); setOpenRecordId(null) }} onListComments={(unresolvedOnly) => databaseRepository.listRecordComments(openRecordId, unresolvedOnly)} onCreateComment={(propertyId, body) => databaseRepository.createRecordComment(openRecordId, propertyId, snapshot.schema.properties.find((property) => property.id === propertyId)?.name ?? '整条记录', body)} onResolveComment={(id, resolved) => databaseRepository.resolveRecordComment(openRecordId, id, resolved)} onDeleteComment={(id) => databaseRepository.deleteRecordComment(openRecordId, id)} onListReminders={() => databaseRepository.listRecordReminders(openRecordId)} onCreateReminder={(propertyId, dueAt, note) => databaseRepository.saveRecordReminder(openRecordId, propertyId, snapshot.schema.properties.find((property) => property.id === propertyId)?.name ?? '日期', dueAt, note)} onCompleteReminder={(id, completed) => databaseRepository.completeRecordReminder(openRecordId, id, completed)} onDeleteReminder={(id) => databaseRepository.deleteRecordReminder(openRecordId, id)} />, document.body)}
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

export function DatabaseTemplateMenu({ templates, selectedCount, onClose, onCreateBlank, onApply, onEdit, onSaveSelection, onDelete }: {
  templates: DatabaseTemplate[]; selectedCount: number; onClose: () => void; onCreateBlank: () => void
  onApply: (templateId: string) => Promise<void>; onEdit: (template: DatabaseTemplate | null) => void; onSaveSelection: (name: string) => Promise<void>; onDelete: (templateId: string) => Promise<void>
}) {
  const [name, setName] = useState('新模板')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])
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
  const dialogRef = useDialogFocus<HTMLElement>()
  const properties = schema.properties.filter((property) => !['title', 'formula', 'rollup', 'relation'].includes(property.type))
  const [name, setName] = useState(template?.name ?? '新模板')
  const [values, setValues] = useState<Record<string, PropertyValue>>(() => Object.fromEntries(properties.map((property) => [property.id, template?.values[property.id] ?? defaultPropertyValue(property)])))
  const [content, setContent] = useState(template?.content ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [busy, onClose])
  return <div className="schema-panel-backdrop template-editor-backdrop" onMouseDown={onClose}><section ref={dialogRef} className="template-editor-panel" role="dialog" aria-modal="true" aria-label="编辑数据库模板" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="template-editor-icon"><LayoutTemplate size={18} /></span><span><small>{template ? '数据库模板' : '新建模板'}</small><strong>{template ? '编辑记录模板' : '创建记录模板'}</strong></span></div><button aria-label="关闭模板编辑器" onClick={onClose}><X size={15} /></button></header>
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
  const dialogRef = useDialogFocus<HTMLElement>()
  const writable = schema.properties.filter((property) => !['formula', 'rollup', 'relation'].includes(property.type))
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedDatabaseCsv | null>(null)
  const [mappings, setMappings] = useState<Array<string | null>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [busy, onClose])
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
  return <div className="schema-panel-backdrop csv-import-backdrop" onMouseDown={onClose}><section ref={dialogRef} className="csv-import-panel" role="dialog" aria-modal="true" aria-label="导入 CSV" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span><FileUp size={18} /></span><div><small>从文件导入</small><strong>把表格带进数据库</strong></div></div><button aria-label="关闭 CSV 导入" onClick={onClose}><X size={15} /></button></header>
    <main>
      <label className={`csv-dropzone ${parsed ? 'has-file' : ''}`}><input autoFocus aria-label="选择 CSV 文件" type="file" accept=".csv,text/csv" onChange={(event) => void choose(event.target.files?.[0])} /><span>{parsed ? <CheckCircle2 size={20} /> : <FileUp size={20} />}</span><strong>{parsed ? fileName : '选择 CSV 文件'}</strong><small>{parsed ? `${parsed.rows.length} 行 · ${parsed.headers.length} 列${parsed.truncated ? ' · 已截取前 10,000 行' : ''}` : '支持 Excel、Numbers 与 Notion 导出的 UTF-8 CSV，最大 10 MB'}</small></label>
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
  const dialogRef = useDialogFocus<HTMLElement>()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [onClose])
  const restore = async (id: string) => { setBusyId(id); try { await onRestore([id]) } finally { setBusyId(null) } }
  const remove = async (id: string) => {
    if (confirmId !== id) { setConfirmId(id); return }
    setBusyId(id); try { await onDeletePermanently([id]); setConfirmId(null) } finally { setBusyId(null) }
  }
  return <div className="record-trash-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialogRef} className="record-trash-panel" role="dialog" aria-modal="true" aria-label="数据库记录回收站" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
    <header><span><Trash2 size={15} /><div><small>数据库记录</small><strong>记录回收站</strong></div></span><button aria-label="关闭记录回收站" onClick={onClose}><X size={15} /></button></header>
    <main>{records.map((record) => <article key={record.id}><span><strong>{record.title || '无标题'}</strong><small>删除于 {new Date(record.trashedAt).toLocaleString('zh-CN')}</small></span><button disabled={busyId !== null} onClick={() => void restore(record.id)}><RotateCcw size={12} />恢复</button><button className={confirmId === record.id ? 'is-confirm' : ''} disabled={busyId !== null} onClick={() => void remove(record.id)}><Trash2 size={12} />{confirmId === record.id ? '确认永久删除' : '永久删除'}</button></article>)}{!records.length && <div className="record-trash-empty"><Trash2 size={20} /><strong>回收站是空的</strong><span>删除的数据库记录会保留在这里，直到永久删除。</span></div>}</main>
    <footer><span>{records.length} 条已删除记录</span><button onClick={onClose}>完成</button></footer>
  </section></div>
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
