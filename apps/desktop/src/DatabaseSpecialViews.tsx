import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Activity, ArrowRight, CalendarDays, ChartNoAxesGantt, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Images, Plus, RotateCcw, X, Zap } from 'lucide-react'
import { buildCalendarMonth, groupRecordsByDate, layoutTimelineRecords, prepareGalleryRecords, safeGalleryCover, timelineDays, type DatabaseProperty, type DatabaseRecord, type DatabaseSchema, type PropertyValue } from '@notetodo/database-core'
import type { AutomationRule, AutomationValue } from '@notetodo/automation-core'
import { useDialogFocus } from './use-dialog-focus'

const statuses = [{ id: 'todo', label: '待开始' }, { id: 'doing', label: '进行中' }, { id: 'done', label: '已完成' }]
type AutomationRun = Awaited<ReturnType<NonNullable<typeof window.notetodo>['automations']['listRuns']>>[number]

export function GalleryView({ records, schema, coverPropertyId, visiblePropertyIds, cardSize = 'medium', updateCell }: { records: DatabaseRecord[]; schema: DatabaseSchema; coverPropertyId?: string; visiblePropertyIds?: string[]; cardSize?: 'small' | 'medium' | 'large'; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const titleProperty = schema.properties.find((property) => property.type === 'title')
  const statusProperty = schema.properties.find((property) => property.id === 'task-status' && property.type === 'select') ?? schema.properties.find((property) => property.type === 'select')
  const metadata = (visiblePropertyIds ?? []).map((id) => schema.properties.find((property) => property.id === id)).filter((property): property is DatabaseProperty => Boolean(property && property.id !== statusProperty?.id)).slice(0, 3)
  const gallery = useMemo(() => prepareGalleryRecords(records), [records])

  if (!titleProperty) return <div className="gallery-missing"><Images size={22} /><strong>需要标题属性</strong><span>Gallery 视图使用标题属性生成卡片。</span></div>
  return <div className={`database-gallery size-${cardSize}`} role="region" aria-label="画廊视图">
    <header className="gallery-masthead"><div><small>{gallery.records.length} 张卡片</small><strong>画廊</strong></div><p>以卡片浏览记录；没有封面时显示本地生成的占位图。</p></header>
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
      <div className="gallery-card-body"><small>记录 {String(index + 1).padStart(2, '0')}</small><strong>{title}</strong><dl>{metadata.map((property) => <div key={property.id}><dt>{property.name}</dt><dd>{formatGalleryValue(record.values[property.id], property)}</dd></div>)}</dl></div>
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

  return <div className="database-timeline" role="region" aria-label="时间轴视图">
    <header className="timeline-toolbar"><div><small>28 天时间范围</small><strong>{rangeLabel}</strong></div><span>{layout.matchingCount} 条记录 · {layout.unscheduled.length} 待排期</span><nav aria-label="切换时间范围"><button aria-label="前两周" onClick={() => setRangeStart(shiftIsoDate(rangeStart, -14))}><ChevronLeft size={14} /></button><button onClick={() => setRangeStart(startOfWeekIso(todayIso))}>今天</button><button aria-label="后两周" onClick={() => setRangeStart(shiftIsoDate(rangeStart, 14))}><ChevronRight size={14} /></button></nav></header>
    <div className="timeline-scroll" tabIndex={0} aria-label="横向滚动时间轴">
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

export function CalendarView({ records, schema, datePropertyId, updateCell }: { records: DatabaseRecord[]; schema: DatabaseSchema; datePropertyId?: string; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const dateProperty = schema.properties.find((property) => property.id === datePropertyId && property.type === 'date') ?? schema.properties.find((property) => property.type === 'date')
  const titleProperty = schema.properties.find((property) => property.type === 'title')
  const today = new Date(); const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }))
  const days = useMemo(() => buildCalendarMonth(cursor.year, cursor.month), [cursor])
  const grouped = useMemo(() => dateProperty ? groupRecordsByDate(records, dateProperty.id) : { groups: {}, unscheduled: records }, [records, dateProperty])
  const moveMonth = (offset: number) => setCursor((current) => { const date = new Date(Date.UTC(current.year, current.month + offset, 1)); return { year: date.getUTCFullYear(), month: date.getUTCMonth() } })
  const monthLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(cursor.year, cursor.month, 1))

  if (!dateProperty || !titleProperty) return <div className="calendar-missing"><CalendarDays size={22} /><strong>需要日期与标题属性</strong><span>Calendar 视图会自动使用数据库中的第一个日期属性。</span></div>

  return <div className="database-calendar" role="region" aria-label="日历视图" tabIndex={0}>
    <header className="calendar-header">
      <div><small>日历</small><strong>{monthLabel}</strong></div>
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

export function AutomationPanel({ schema, rules, runs, onClose, onSave, onToggle, onReplay }: { schema: DatabaseSchema; rules: AutomationRule[]; runs: AutomationRun[]; onClose: () => void; onSave: (rule: AutomationRule) => Promise<void>; onToggle: (rule: AutomationRule) => Promise<void>; onReplay: (runId: string) => Promise<void> }) {
  const dialogRef = useDialogFocus<HTMLElement>()
  const writable = schema.properties.filter((property) => property.type !== 'formula' && property.type !== 'rollup')
  const defaultTrigger = schema.properties.find((property) => property.type === 'select') ?? writable[0]!
  const defaultAction = schema.properties.find((property) => property.type === 'number') ?? writable[0]!
  const blankRule = (): AutomationRule => ({ id: crypto.randomUUID(), name: '新自动化', enabled: true, trigger: { type: 'propertyChanged', propertyId: defaultTrigger.id }, condition: { propertyId: defaultTrigger.id, operator: 'equals', value: '' }, actions: [{ type: 'setProperty', propertyId: defaultAction.id, value: null }] })
  const [draft, setDraft] = useState<AutomationRule>(() => rules[0] ? structuredClone(rules[0]) : blankRule())
  const [tab, setTab] = useState<'rules' | 'runs'>('rules')
  const [message, setMessage] = useState('')
  const [replayingId, setReplayingId] = useState<string | null>(null)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

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
    <section ref={dialogRef} className="automation-panel" role="dialog" aria-modal="true" aria-label="数据库自动化" tabIndex={-1} onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span><Zap size={15} /></span><div><small>{schema.name}</small><strong>数据库自动化</strong></div></div><button aria-label="关闭数据库自动化" onClick={onClose}><X size={16} /></button></header>
      <nav aria-label="自动化视图" role="tablist"><button aria-selected={tab === 'rules'} className={tab === 'rules' ? 'is-active' : ''} role="tab" onClick={() => setTab('rules')}><Zap size={12} />规则 {rules.length}</button><button aria-selected={tab === 'runs'} className={tab === 'runs' ? 'is-active' : ''} role="tab" onClick={() => setTab('runs')}><Activity size={12} />运行 {runs.length}</button></nav>
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
