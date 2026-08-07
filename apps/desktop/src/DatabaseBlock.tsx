import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, Columns3, Filter, Link2, List, Plus, Sigma, Table2, Zap } from 'lucide-react'
import { queryRecords, resolveDerivedRecords, runDatabaseAutomations, type DatabaseAutomation, type DatabaseRecord, type DatabaseSnapshot, type PropertyValue } from '@notetodo/database-core'
import { databaseRepository } from './data/database-repository'

const ROW_HEIGHT = 42
const VIEWPORT_HEIGHT = 336
const OVERSCAN = 5
const statuses = [
  { id: 'todo', label: '待开始' },
  { id: 'doing', label: '进行中' },
  { id: 'done', label: '已完成' },
]
const databaseAutomations: DatabaseAutomation[] = [{
  id: 'completed-task-priority',
  name: '完成后归档优先级',
  enabled: true,
  trigger: { type: 'propertyChanged', propertyId: 'task-status' },
  condition: { propertyId: 'task-status', operator: 'equals', value: 'done' },
  actions: [{ type: 'setProperty', propertyId: 'task-score', value: 1 }],
}]

export function DatabaseBlock({ pageId }: { pageId: string }) {
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [dueAscending, setDueAscending] = useState(true)

  useEffect(() => { void databaseRepository.loadByPage(pageId).then(setSnapshot) }, [pageId])

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
    const automated = runDatabaseAutomations(snapshot.schema, editedRecord, propertyId, databaseAutomations)
    const next: DatabaseSnapshot = {
      ...snapshot,
      records: snapshot.records.map((record) => record.id === recordId
        ? automated.record
        : record),
    }
    setSnapshot(next)
    void databaseRepository.updateCell(next, recordId, propertyId, value)
    for (const execution of automated.executions) void databaseRepository.updateCell(next, recordId, execution.propertyId, execution.value)
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
            const Icon = view.type === 'table' ? Table2 : view.type === 'board' ? Columns3 : List
            return <button className={view.id === activeView.id ? 'is-active' : ''} key={view.id} onClick={() => setView(view.id)}><Icon size={13} />{view.name}</button>
          })}
        </div>
        <div className="database-tools">
          <button className={statusFilter !== 'all' ? 'is-active' : ''} onClick={() => setStatusFilter((value) => value === 'all' ? 'doing' : value === 'doing' ? 'done' : 'all')}><Filter size={13} />{statusFilter === 'all' ? '筛选' : statuses.find((status) => status.id === statusFilter)?.label}</button>
          <button onClick={() => setDueAscending((value) => !value)}><ArrowUpDown size={13} />截止日期</button>
          <button className="database-automation" title="规则：任务进入已完成时，优先级自动归档为 1"><Zap size={13} />自动化 · 1</button>
          <button className="database-new" onClick={addRecord}><Plus size={13} />新建</button>
        </div>
      </div>
      <div className="database-summary"><span>{snapshot.schema.name.toLocaleUpperCase()}</span><span>{records.length} / {snapshot.records.length} RECORDS</span></div>
      {activeView.type === 'table' && <VirtualTable records={records} allRecords={derivedRecords} updateCell={updateCell} />}
      {activeView.type === 'board' && <BoardView records={records} updateCell={updateCell} />}
      {activeView.type === 'list' && <ListView records={records} updateCell={updateCell} />}
    </section>
  )
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
