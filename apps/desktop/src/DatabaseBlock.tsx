import { useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpDown, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Columns3, Filter, Link2, List, Plus, RotateCcw, Sigma, Table2, X, Zap } from 'lucide-react'
import { buildCalendarMonth, groupRecordsByDate, queryRecords, resolveDerivedRecords, type DatabaseProperty, type DatabaseRecord, type DatabaseSchema, type DatabaseSnapshot, type PropertyValue } from '@notetodo/database-core'
import type { AutomationRule, AutomationValue } from '@notetodo/automation-core'
import { databaseRepository } from './data/database-repository'

const ROW_HEIGHT = 42
const VIEWPORT_HEIGHT = 336
const OVERSCAN = 5
const statuses = [
  { id: 'todo', label: '待开始' },
  { id: 'doing', label: '进行中' },
  { id: 'done', label: '已完成' },
]
type AutomationRun = Awaited<ReturnType<NonNullable<typeof window.notetodo>['automations']['listRuns']>>[number]
const previewAutomation: AutomationRule = { id: 'completed-task-priority', name: '完成后归档优先级', enabled: true, trigger: { type: 'propertyChanged', propertyId: 'task-status' }, condition: { propertyId: 'task-status', operator: 'equals', value: 'done' }, actions: [{ type: 'setProperty', propertyId: 'task-score', value: 1 }] }

export function DatabaseBlock({ pageId }: { pageId: string }) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dueAscending, setDueAscending] = useState(true)
  const [automationOpen, setAutomationOpen] = useState(false)
  const [automations, setAutomations] = useState<AutomationRule[]>([])
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([])

  useEffect(() => { void databaseRepository.loadByPage(pageId).then(setSnapshot) }, [pageId])
  useEffect(() => {
    if (!snapshot) return
    if (window.notetodo?.automations) void Promise.all([window.notetodo.automations.list(snapshot.schema.id), window.notetodo.automations.listRuns(snapshot.schema.id)]).then(([rules, runs]) => { setAutomations(rules); setAutomationRuns(runs) })
    else setAutomations([previewAutomation])
  }, [snapshot?.schema.id])

  // Rollups and formulas are computed once per snapshot, never persisted back.
  // This keeps sort/filter cheap while making every view consume identical data.
  const derivedRecords = useMemo(() => snapshot ? resolveDerivedRecords(snapshot.schema, snapshot.records) : [], [snapshot])
  const records = useMemo(() => snapshot ? queryRecords(
    derivedRecords,
    statusFilter === 'all' ? [] : [{ propertyId: 'task-status', operator: 'equals', value: statusFilter }],
    [{ propertyId: 'task-due', direction: dueAscending ? 'asc' : 'desc' }],
  ) : [], [snapshot, derivedRecords, statusFilter, dueAscending])

  if (!snapshot) return <div className="database-loading">正在打开本地数据库…</div>
  const activeView = snapshot.views.find((view) => view.id === snapshot.activeViewId) ?? snapshot.views[0]

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
      values: { 'task-title': '新任务', 'task-status': 'todo', 'task-owner': '', 'task-due': '', 'task-score': 1, 'task-dependencies': [] },
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

  return (
    <section className="database-block">
      <div className="database-viewbar">
        <div className="database-tabs">
          {snapshot.views.map((view) => {
            const Icon = view.type === 'table' ? Table2 : view.type === 'board' ? Columns3 : view.type === 'calendar' ? CalendarDays : List
            return <button className={view.id === activeView.id ? 'is-active' : ''} key={view.id} onClick={() => setView(view.id)}><Icon size={13} />{view.name}</button>
          })}
        </div>
        <div className="database-tools">
          <button className={statusFilter !== 'all' ? 'is-active' : ''} onClick={() => setStatusFilter((value) => value === 'all' ? 'doing' : value === 'doing' ? 'done' : 'all')}><Filter size={13} />{statusFilter === 'all' ? '筛选' : statuses.find((status) => status.id === statusFilter)?.label}</button>
          <button onClick={() => setDueAscending((value) => !value)}><ArrowUpDown size={13} />截止日期</button>
          <button className="database-automation" onClick={() => setAutomationOpen(true)}><Zap size={13} />自动化 · {automations.filter((rule) => rule.enabled).length}</button>
          <button className="database-new" onClick={addRecord}><Plus size={13} />新建</button>
        </div>
      </div>
      <div className="database-summary"><span>{snapshot.schema.name.toLocaleUpperCase()}</span><span>{records.length} / {snapshot.records.length} RECORDS</span></div>
      {activeView.type === 'table' && <VirtualTable records={records} allRecords={derivedRecords} updateCell={updateCell} />}
      {activeView.type === 'board' && <BoardView records={records} updateCell={updateCell} />}
      {activeView.type === 'list' && <ListView records={records} updateCell={updateCell} />}
      {activeView.type === 'calendar' && <CalendarView records={records} schema={snapshot.schema} datePropertyId={activeView.config.datePropertyId} updateCell={updateCell} />}
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

function VirtualTable({ records, allRecords, updateCell }: { records: DatabaseRecord[]; allRecords: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(records.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN)
  const visible = records.slice(start, end)

  return (
    <div className="database-table">
      <div className="database-grid database-grid-head"><span>任务</span><span>状态</span><span>负责人</span><span>截止日期</span><span>优先级</span><span><Link2 size={11} />依赖</span><span><Sigma size={11} />汇总</span><span>ƒ 风险</span></div>
      <div className="database-viewport" style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(ROW_HEIGHT, records.length * ROW_HEIGHT)) }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div className="database-row-space" style={{ height: records.length * ROW_HEIGHT }}>
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
  const candidates = records.filter((candidate) => candidate.id !== record.id && !relatedIds.includes(candidate.id))
  return <div className="relation-cell" title={label || '暂无依赖'}>
    <button type="button" disabled={!relatedIds.length} onClick={() => updateCell(record.id, 'task-dependencies', [])}>{relatedIds.length ? `${relatedIds.length} 项` : '无'}</button>
    <select aria-label={`为 ${record.values['task-title']} 添加依赖`} value="" onChange={(event) => event.target.value && updateCell(record.id, 'task-dependencies', [...relatedIds, event.target.value])}>
      <option value="">+关联</option>
      {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.values['task-title']}</option>)}
    </select>
  </div>
}

function StatusSelect({ record, updateCell }: { record: DatabaseRecord; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const value = String(record.values['task-status'] ?? 'todo')
  return <select className={`status-select status-${value}`} value={value} onChange={(event) => updateCell(record.id, 'task-status', event.target.value)}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select>
}

function BoardView({ records, updateCell }: { records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  return <div className="database-board">{statuses.map((status) => {
    const group = records.filter((record) => record.values['task-status'] === status.id)
    return <div className="board-column" key={status.id}><header><span className={`status-dot status-${status.id}`} />{status.label}<em>{group.length}</em></header><div>{group.map((record) => <article key={record.id}><strong>{record.values['task-title']}</strong><span><i>{record.values['task-owner'] || '未分配'}</i><time>{record.values['task-due']}</time></span><small className={record.values['task-risk'] === '需关注' ? 'is-risk' : ''}>{record.values['task-risk']} · 依赖分 {record.values['task-dependency-score'] ?? 0}</small><button onClick={() => updateCell(record.id, 'task-status', status.id === 'todo' ? 'doing' : status.id === 'doing' ? 'done' : 'todo')}>推进状态 →</button></article>)}</div></div>
  })}</div>
}

function ListView({ records, updateCell }: { records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  return <div className="database-list">{records.map((record, index) => <div key={record.id}><span className="list-index">{String(index + 1).padStart(2, '0')}</span><input value={String(record.values['task-title'] ?? '')} onChange={(event) => updateCell(record.id, 'task-title', event.target.value)} /><StatusSelect record={record} updateCell={updateCell} /><span>{record.values['task-owner']}</span><time>{record.values['task-due']}</time></div>)}</div>
}
