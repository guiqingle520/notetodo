import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ArrowRight, Bell, BookOpen, Calculator, Check, Database, GripVertical, Link2, MessageSquare, RotateCcw, Sigma, Trash2, X } from 'lucide-react'
import { calculateColumn, validColumnCalculations, virtualWindow, type ColumnCalculation, type DatabaseProperty, type DatabaseRecord, type DatabaseRecordComment, type DatabaseRecordHistory, type DatabaseRecordReminder, type DatabaseSchema, type DatabaseViewConfig, type PropertyValue } from '@notetodo/database-core'

const ROW_HEIGHT = 42
const VIEWPORT_HEIGHT = 336
const OVERSCAN = 5
const LIST_ROW_HEIGHT = 43
const BOARD_CARD_HEIGHT = 122
const statuses = [{ id: 'todo', label: '待开始' }, { id: 'doing', label: '进行中' }, { id: 'done', label: '已完成' }]

export type RelationTargets = Record<string, { schema: DatabaseSchema; records: DatabaseRecord[] }>

export function GenericTable({ records, schema, config = {}, onConfigChange, relationTargets = {}, updateCell, onOpenRecord, selectedIds = new Set<string>(), onToggleRecord, onToggleAll, onReorder }: { records: DatabaseRecord[]; schema: DatabaseSchema; config?: DatabaseViewConfig; onConfigChange?: (config: DatabaseViewConfig) => void; relationTargets?: RelationTargets; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void; onOpenRecord?: (recordId: string) => void; selectedIds?: Set<string>; onToggleRecord?: (recordId: string) => void; onToggleAll?: () => void; onReorder?: (recordId: string, targetId?: string) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const headerScrollRef = useRef<HTMLDivElement | null>(null)
  const footerScrollRef = useRef<HTMLDivElement | null>(null)
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>(() => ({ ...config.propertyWidths }))
  useEffect(() => setLiveWidths({ ...config.propertyWidths }), [config.propertyWidths])
  const visibleIds = config.visiblePropertyIds ? new Set(config.visiblePropertyIds) : null
  const propertyById = new Map(schema.properties.map((property) => [property.id, property]))
  const orderedIds = [...new Set([...(config.propertyOrder ?? []), ...schema.properties.map((property) => property.id)])]
  const properties = orderedIds.map((id) => propertyById.get(id)).filter((property): property is DatabaseProperty => Boolean(property && (property.type === 'title' || !visibleIds || visibleIds.has(property.id)))).slice(0, 20)
  const rowHeight = config.rowHeight === 'compact' ? 34 : config.rowHeight === 'comfortable' ? 52 : ROW_HEIGHT
  const { start, end, totalSize } = virtualWindow(records.length, scrollTop, rowHeight, VIEWPORT_HEIGHT, OVERSCAN)
  const propertyWidth = (property: DatabaseProperty) => liveWidths[property.id] ?? (property.type === 'title' ? 220 : 140)
  const template = `52px ${properties.map((property) => `${propertyWidth(property)}px`).join(' ')}`
  const minWidth = 52 + properties.reduce((sum, property) => sum + propertyWidth(property), 0)
  const manualOrderEnabled = Boolean(onReorder && !config.sorts?.length)
  const titlePropertyId = properties.find((property) => property.type === 'title')?.id ?? ''
  const calculationValues = useMemo(() => Object.fromEntries(properties.map((property) => {
    const calculation = config.calculations?.[property.id]
    return [property.id, calculation ? calculateColumn(records, property.id, calculation) : null]
  })), [records, config.calculations, config.propertyOrder, config.visiblePropertyIds, schema.properties])
  const setCalculation = (propertyId: string, calculation: ColumnCalculation | '') => {
    const calculations = { ...config.calculations }
    if (calculation) calculations[propertyId] = calculation; else delete calculations[propertyId]
    onConfigChange?.({ ...config, calculations })
  }
  const beginResize = (event: ReactMouseEvent<HTMLButtonElement>, property: DatabaseProperty) => {
    event.preventDefault(); event.stopPropagation()
    const startX = event.clientX; const startWidth = propertyWidth(property)
    let pendingWidth = startWidth; let animationFrame = 0
    const move = (moveEvent: MouseEvent) => {
      pendingWidth = Math.max(80, Math.min(600, Math.round(startWidth + moveEvent.clientX - startX)))
      if (animationFrame) return
      animationFrame = window.requestAnimationFrame(() => { animationFrame = 0; setLiveWidths((current) => ({ ...current, [property.id]: pendingWidth })) })
    }
    const end = (endEvent: MouseEvent) => {
      const width = Math.max(80, Math.min(600, Math.round(startWidth + endEvent.clientX - startX)))
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end)
      const propertyWidths = { ...liveWidths, [property.id]: width }
      setLiveWidths(propertyWidths); onConfigChange?.({ ...config, propertyWidths })
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', end)
  }
  return <div className={`generic-database-table ${config.freezeFirstColumn ? 'is-first-column-frozen' : ''}`} style={{ '--database-row-height': `${rowHeight}px` } as CSSProperties}>
    <div className="generic-database-sync" ref={headerScrollRef}><div className="generic-database-grid generic-database-head" style={{ gridTemplateColumns: template, minWidth }}><label className="database-row-select"><input aria-label="选择全部记录" type="checkbox" checked={records.length > 0 && selectedIds.size === records.length} onChange={() => onToggleAll?.()} /><span /></label>{properties.map((property) => <span key={property.id}><i>{propertyTypeLabel(property.type)}</i><b>{property.name}</b><button className="database-column-resizer" aria-label={`调整列宽 ${property.name}`} onMouseDown={(event) => beginResize(event, property)} /></span>)}</div></div>
    <div className="generic-database-viewport" style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(rowHeight, records.length * rowHeight)) }} onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop); if (headerScrollRef.current) headerScrollRef.current.scrollLeft = event.currentTarget.scrollLeft; if (footerScrollRef.current) footerScrollRef.current.scrollLeft = event.currentTarget.scrollLeft }}>
      <div className="generic-database-space" style={{ height: totalSize, minWidth }}>{records.slice(start, end).map((record, offset) => { const title = String(record.values[titlePropertyId] || record.id); return <div className={`generic-database-grid generic-database-row ${selectedIds.has(record.id) ? 'is-selected' : ''} ${draggedRecordId === record.id ? 'is-dragging' : ''} ${dropTargetId === record.id ? 'is-drop-target' : ''}`} key={record.id} style={{ gridTemplateColumns: template, height: rowHeight, transform: `translateY(${(start + offset) * rowHeight}px)` }} onDragOver={(event) => { if (!manualOrderEnabled || draggedRecordId === record.id) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTargetId(record.id) }} onDrop={(event) => { if (!manualOrderEnabled) return; event.preventDefault(); const sourceId = event.dataTransfer.getData('application/x-notetodo-record-order') || draggedRecordId; if (sourceId && sourceId !== record.id) onReorder?.(sourceId, record.id); setDraggedRecordId(null); setDropTargetId(null) }}><div className="database-row-select database-row-control"><label><input aria-label={`选择记录 ${title}`} type="checkbox" checked={selectedIds.has(record.id)} onChange={() => onToggleRecord?.(record.id)} /><span /></label><button type="button" draggable={manualOrderEnabled} disabled={!manualOrderEnabled} aria-label={`拖动记录 ${title}`} title={manualOrderEnabled ? '拖动调整当前视图顺序' : '存在排序规则时无法手动排序'} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-notetodo-record-order', record.id); setDraggedRecordId(record.id) }} onDragEnd={() => { setDraggedRecordId(null); setDropTargetId(null) }}><GripVertical size={12} /></button></div>{properties.map((property) => <GenericCell key={property.id} record={record} property={property} relationTargets={relationTargets} updateCell={updateCell} onOpenRecord={onOpenRecord} />)}</div> })}</div>
    </div>
    <div className="generic-database-sync" ref={footerScrollRef}><div className="generic-database-grid generic-database-footer" style={{ gridTemplateColumns: template, minWidth }}><span><Calculator size={12} /></span>{properties.map((property) => { const calculation = config.calculations?.[property.id]; const value = calculationValues[property.id]; return <label key={property.id}><select aria-label={`${property.name} 列底计算`} value={calculation ?? ''} onChange={(event) => setCalculation(property.id, event.target.value as ColumnCalculation | '')}><option value="">计算</option>{validColumnCalculations(property).map((candidate) => <option key={candidate} value={candidate}>{columnCalculationLabel(candidate)}</option>)}</select>{calculation && <output>{formatCalculationValue(value, calculation)}</output>}</label> })}</div></div>
    {!records.length && <div className="generic-database-empty"><Database size={17} /><span>还没有记录</span><small>点击右上角“新建”写入第一行</small></div>}
  </div>
}

function columnCalculationLabel(calculation: ColumnCalculation) {
  return ({ count: '记录数', countValues: '已填写', sum: '求和', average: '平均值', min: '最小值', max: '最大值', earliest: '最早日期', latest: '最晚日期', percentChecked: '勾选比例' } as const)[calculation]
}

function formatCalculationValue(value: PropertyValue | undefined, calculation: ColumnCalculation) {
  if (value === null || value === undefined) return '—'
  if (calculation === 'percentChecked') return `${value}%`
  if (typeof value === 'number' && !Number.isInteger(value)) return String(Math.round(value * 100) / 100)
  return String(value)
}

function GenericCell({ record, property, relationTargets, updateCell, onOpenRecord }: { record: DatabaseRecord; property: DatabaseProperty; relationTargets: RelationTargets; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void; onOpenRecord?: (recordId: string) => void }) {
  const value = record.values[property.id]
  if (property.type === 'select') return <select className={`generic-select select-color-${property.options?.find((option) => option.id === value)?.color ?? 'empty'}`} value={String(value ?? '')} onChange={(event) => updateCell(record.id, property.id, event.target.value || null)}><option value="">未选择</option>{property.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
  if (property.type === 'checkbox') return <label className="generic-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => updateCell(record.id, property.id, event.target.checked)} /><span /></label>
  if (property.type === 'number') return <input type="number" value={typeof value === 'number' ? value : ''} onChange={(event) => updateCell(record.id, property.id, event.target.value === '' ? null : Number(event.target.value))} />
  if (property.type === 'date') return <input type="date" value={typeof value === 'string' ? value : ''} onChange={(event) => updateCell(record.id, property.id, event.target.value || null)} />
  if (property.type === 'multiSelect') return <input value={Array.isArray(value) ? value.join(', ') : ''} placeholder="逗号分隔" onChange={(event) => updateCell(record.id, property.id, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} />
  if (property.type === 'relation') return <RelationValueEditor value={Array.isArray(value) ? value : []} target={property.relation?.databaseId ? relationTargets[property.relation.databaseId] : undefined} onChange={(next) => updateCell(record.id, property.id, next)} />
  if (property.type === 'formula' || property.type === 'rollup') return <output>{Array.isArray(value) ? value.join('、') : value === null || value === undefined ? '—' : String(value)}</output>
  if (property.type === 'title') return <div className="generic-title-cell"><input className="is-title" value={typeof value === 'string' ? value : ''} onChange={(event) => updateCell(record.id, property.id, event.target.value)} /><button aria-label={`打开 ${String(value || '无标题')}`} title="打开记录详情" onClick={() => onOpenRecord?.(record.id)}><BookOpen size={12} /></button></div>
  return <input type={property.type === 'url' ? 'url' : 'text'} value={typeof value === 'string' ? value : ''} onChange={(event) => updateCell(record.id, property.id, event.target.value)} />
}

function RelationValueEditor({ value, target, onChange }: { value: string[]; target?: RelationTargets[string]; onChange: (value: string[]) => void }) {
  const titleId = target?.schema.properties.find((property) => property.type === 'title')?.id
  const names = new Map(target?.records.map((record) => [record.id, String(record.values[titleId ?? ''] || '无标题')]) ?? [])
  return <details className="relation-value-editor"><summary>{value.length ? value.slice(0, 2).map((id) => names.get(id) ?? id).join('、') + (value.length > 2 ? ` +${value.length - 2}` : '') : '添加关联'}</summary><div>{target?.records.slice(0, 100).map((candidate) => <label key={candidate.id}><input type="checkbox" checked={value.includes(candidate.id)} onChange={() => onChange(value.includes(candidate.id) ? value.filter((id) => id !== candidate.id) : [...value, candidate.id].slice(0, 100))} /><span>{names.get(candidate.id)}</span></label>)}{!target?.records.length && <p>目标数据库还没有记录。</p>}</div></details>
}

export function RecordDetailPanel({ record, schema, relationTargets = {}, onClose, onUpdateCell, onUpdateContent, onListHistory, onRestoreHistory, onListComments, onCreateComment, onResolveComment, onDeleteComment, onListReminders, onCreateReminder, onCompleteReminder, onDeleteReminder }: { record: DatabaseRecord; schema: DatabaseSchema; relationTargets?: RelationTargets; onClose: () => void; onUpdateCell: (recordId: string, propertyId: string, value: PropertyValue) => void; onUpdateContent: (recordId: string, content: string) => void; onListHistory?: () => Promise<DatabaseRecordHistory[]>; onRestoreHistory?: (historyId: string) => Promise<void>; onListComments?: (unresolvedOnly: boolean) => Promise<DatabaseRecordComment[]>; onCreateComment?: (propertyId: string | null, body: string) => Promise<DatabaseRecordComment[]>; onResolveComment?: (id: string, resolved: boolean) => Promise<DatabaseRecordComment[]>; onDeleteComment?: (id: string) => Promise<DatabaseRecordComment[]>; onListReminders?: () => Promise<DatabaseRecordReminder[]>; onCreateReminder?: (propertyId: string, dueAt: string, note: string) => Promise<DatabaseRecordReminder[]>; onCompleteReminder?: (id: string, completed: boolean) => Promise<DatabaseRecordReminder[]>; onDeleteReminder?: (id: string) => Promise<DatabaseRecordReminder[]> }) {
  const titleProperty = schema.properties.find((property) => property.type === 'title')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestContent = useRef(record.content ?? '')
  const savedContent = useRef(record.content ?? '')
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const [sideMode, setSideMode] = useState<'properties' | 'history' | 'comments' | 'reminders'>('properties')
  const [history, setHistory] = useState<DatabaseRecordHistory[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const openHistory = async () => { persist(); setSideMode('history'); if (onListHistory) setHistory(await onListHistory()) }
  const persist = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (latestContent.current === savedContent.current) return
    savedContent.current = latestContent.current
    onUpdateContent(record.id, latestContent.current)
    setSaveState('saved')
  }
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: '输入正文，或键入 / 唤起内容块…' })],
    content: record.content || '<p></p>',
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': '记录正文' } },
    onUpdate: ({ editor: current }) => {
      latestContent.current = current.isEmpty ? '' : current.getHTML()
      setSaveState('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      // Coalesce rapid keystrokes so SQLite receives one small write per pause.
      saveTimer.current = setTimeout(persist, 450)
    },
  })
  useEffect(() => () => persist(), [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { persist(); onClose() } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const close = () => { persist(); onClose() }
  const title = titleProperty ? String(record.values[titleProperty.id] ?? '') : ''
  return <div className="record-detail-backdrop" onMouseDown={close}>
    <section className="record-detail-panel" role="dialog" aria-modal="true" aria-label={`记录详情：${title || '无标题'}`} onMouseDown={(event) => event.stopPropagation()}>
      <header><span><BookOpen size={13} />{schema.name}<i>/</i>{record.id.slice(0, 8)}</span><div><em className={`is-${saveState}`}>{saveState === 'saving' ? '正在保存…' : '已保存到本地'}</em><button aria-label="记录提醒" className={sideMode === 'reminders' ? 'is-active' : ''} onClick={() => setSideMode(sideMode === 'reminders' ? 'properties' : 'reminders')}><Bell size={14} /></button><button aria-label="记录讨论" className={sideMode === 'comments' ? 'is-active' : ''} onClick={() => setSideMode(sideMode === 'comments' ? 'properties' : 'comments')}><MessageSquare size={14} /></button><button aria-label="记录历史" className={sideMode === 'history' ? 'is-active' : ''} onClick={() => sideMode === 'history' ? setSideMode('properties') : void openHistory()}><RotateCcw size={14} /></button><button aria-label="关闭记录详情" onClick={close}><X size={16} /></button></div></header>
      <div className="record-detail-layout">
        <main>
          <small>DATABASE RECORD / LOCAL-FIRST</small>
          <input className="record-detail-title" aria-label="记录标题" placeholder="无标题" value={title} onChange={(event) => titleProperty && onUpdateCell(record.id, titleProperty.id, event.target.value)} />
          <nav className="record-editor-toolbar" aria-label="正文格式">
            <button className={editor?.isActive('bold') ? 'is-active' : ''} onClick={() => editor?.chain().focus().toggleBold().run()}>B</button>
            <button className={editor?.isActive('italic') ? 'is-active' : ''} onClick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></button>
            <button className={editor?.isActive('heading', { level: 2 }) ? 'is-active' : ''} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
            <button className={editor?.isActive('bulletList') ? 'is-active' : ''} onClick={() => editor?.chain().focus().toggleBulletList().run()}>• 列表</button>
            <button className={editor?.isActive('blockquote') ? 'is-active' : ''} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>“ 引用</button>
          </nav>
          <EditorContent editor={editor} className="record-detail-editor" />
        </main>
        <aside>{sideMode === 'history' ? <div className="record-history"><header><span>变更历史</span><em>{history.length}</em></header>{history.map((entry) => <article key={entry.id}><div><strong>{entry.propertyName}</strong><time>{formatRecordTime(entry.createdAt)}</time></div><p><del>{formatHistoryValue(entry.previous)}</del><ArrowRight size={11} /><ins>{formatHistoryValue(entry.next)}</ins></p><button disabled={restoringId !== null} onClick={async () => { if (!onRestoreHistory) return; setRestoringId(entry.id); try { await onRestoreHistory(entry.id) } finally { setRestoringId(null) } }}>{restoringId === entry.id ? '恢复中…' : '恢复此值'}</button></article>)}{!history.length && <div className="record-history-empty"><RotateCcw size={18} /><span>还没有可恢复的变更</span></div>}</div> : sideMode === 'comments' ? <RecordComments schema={schema} onList={onListComments} onCreate={onCreateComment} onResolve={onResolveComment} onDelete={onDeleteComment} /> : sideMode === 'reminders' ? <RecordReminders record={record} schema={schema} onList={onListReminders} onCreate={onCreateReminder} onComplete={onCompleteReminder} onDelete={onDeleteReminder} /> : <>
          <div className="record-property-heading"><span>属性</span><em>{schema.properties.length}</em></div>
          {schema.properties.filter((property) => property.type !== 'title').map((property) => <RecordPropertyField key={property.id} record={record} property={property} relationTargets={relationTargets} onUpdate={onUpdateCell} />)}
          <footer><span>创建</span><time>{formatRecordTime(record.createdAt)}</time><span>更新</span><time>{formatRecordTime(record.updatedAt)}</time></footer></>}
        </aside>
      </div>
    </section>
  </div>
}

function RecordComments({ schema, onList, onCreate, onResolve, onDelete }: { schema: DatabaseSchema; onList?: (unresolvedOnly: boolean) => Promise<DatabaseRecordComment[]>; onCreate?: (propertyId: string | null, body: string) => Promise<DatabaseRecordComment[]>; onResolve?: (id: string, resolved: boolean) => Promise<DatabaseRecordComment[]>; onDelete?: (id: string) => Promise<DatabaseRecordComment[]> }) {
  const [comments, setComments] = useState<DatabaseRecordComment[]>([]); const [body, setBody] = useState(''); const [propertyId, setPropertyId] = useState(''); const [unresolvedOnly, setUnresolvedOnly] = useState(false)
  useEffect(() => { if (onList) void onList(unresolvedOnly).then(setComments) }, [onList, unresolvedOnly])
  const create = async () => { if (!body.trim() || !onCreate) return; setComments(await onCreate(propertyId || null, body)); setBody('') }
  return <div className="record-comments"><header><span>讨论</span><label><input type="checkbox" checked={unresolvedOnly} onChange={(event) => setUnresolvedOnly(event.target.checked)} />仅未解决</label></header><div className="record-comment-composer"><select aria-label="评论属性" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">整条记录</option>{schema.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><textarea aria-label="记录评论" maxLength={10_000} placeholder="添加评论…" value={body} onChange={(event) => setBody(event.target.value)} /><button disabled={!body.trim()} onClick={() => void create()}>发送</button></div>{comments.map((comment) => <article className={comment.resolvedAt ? 'is-resolved' : ''} key={comment.id}><div><strong>{comment.authorName}</strong><time>{formatRecordTime(comment.createdAt)}</time></div><small>{comment.propertyName}</small><p>{comment.body}</p><footer><button onClick={async () => onResolve && setComments(await onResolve(comment.id, !comment.resolvedAt))}><Check size={11} />{comment.resolvedAt ? '重新打开' : '解决'}</button><button aria-label="删除记录评论" onClick={async () => onDelete && setComments(await onDelete(comment.id))}><Trash2 size={11} /></button></footer></article>)}{!comments.length && <div className="record-history-empty"><MessageSquare size={18} /><span>还没有讨论</span></div>}</div>
}

function RecordReminders({ record, schema, onList, onCreate, onComplete, onDelete }: { record: DatabaseRecord; schema: DatabaseSchema; onList?: () => Promise<DatabaseRecordReminder[]>; onCreate?: (propertyId: string, dueAt: string, note: string) => Promise<DatabaseRecordReminder[]>; onComplete?: (id: string, completed: boolean) => Promise<DatabaseRecordReminder[]>; onDelete?: (id: string) => Promise<DatabaseRecordReminder[]> }) {
  const dateProperties = schema.properties.filter((property) => property.type === 'date'); const [propertyId, setPropertyId] = useState(dateProperties[0]?.id ?? ''); const [reminders, setReminders] = useState<DatabaseRecordReminder[]>([]); const [note, setNote] = useState('')
  const dateValue = record.values[propertyId]; const defaultLocal = typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(dateValue) ? `${dateValue}T09:00` : new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)
  const [dueAt, setDueAt] = useState(defaultLocal)
  useEffect(() => { if (onList) void onList().then(setReminders) }, [onList])
  useEffect(() => { const value = record.values[propertyId]; if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) setDueAt(`${value}T09:00`) }, [propertyId])
  const create = async () => { if (!propertyId || !dueAt || !onCreate) return; setReminders(await onCreate(propertyId, dueAt, note)); setNote('') }
  return <div className="record-reminders"><header><span>提醒</span><em>{reminders.filter((reminder) => !reminder.completedAt).length}</em></header>{dateProperties.length ? <div className="record-reminder-composer"><select aria-label="提醒日期属性" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>{dateProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select><input aria-label="提醒时间" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /><input aria-label="提醒备注" maxLength={500} placeholder="提醒内容（可选）" value={note} onChange={(event) => setNote(event.target.value)} /><button disabled={!dueAt} onClick={() => void create()}>创建提醒</button></div> : <div className="record-history-empty"><Bell size={18} /><span>请先添加日期属性</span></div>}{reminders.map((reminder) => <article className={`${reminder.completedAt ? 'is-completed' : ''} ${reminder.overdue ? 'is-overdue' : ''}`} key={reminder.id}><div><strong>{reminder.propertyName}</strong><small>{reminder.overdue ? '已到期' : reminder.completedAt ? '已完成' : '待提醒'}</small></div><time>{new Date(reminder.dueAt).toLocaleString('zh-CN')}</time>{reminder.note && <p>{reminder.note}</p>}<footer><button onClick={async () => onComplete && setReminders(await onComplete(reminder.id, !reminder.completedAt))}><Check size={11} />{reminder.completedAt ? '重新打开' : '完成'}</button><button aria-label="删除记录提醒" onClick={async () => onDelete && setReminders(await onDelete(reminder.id))}><Trash2 size={11} /></button></footer></article>)}</div>
}

function formatHistoryValue(value: PropertyValue | string) {
  if (Array.isArray(value)) return value.length ? value.join('、') : '空'
  if (value === null || value === '') return '空'
  if (typeof value === 'string' && value.startsWith('<')) return value.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 80) || '空正文'
  return String(value).slice(0, 100)
}

function RecordPropertyField({ record, property, relationTargets, onUpdate }: { record: DatabaseRecord; property: DatabaseProperty; relationTargets: RelationTargets; onUpdate: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const value = record.values[property.id]
  let field: ReactNode
  if (property.type === 'select') field = <select value={String(value ?? '')} onChange={(event) => onUpdate(record.id, property.id, event.target.value || null)}><option value="">未选择</option>{property.options?.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
  else if (property.type === 'checkbox') field = <label className="record-property-check"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onUpdate(record.id, property.id, event.target.checked)} /><span>{value ? '已勾选' : '未勾选'}</span></label>
  else if (property.type === 'number') field = <input type="number" value={typeof value === 'number' ? value : ''} onChange={(event) => onUpdate(record.id, property.id, event.target.value === '' ? null : Number(event.target.value))} />
  else if (property.type === 'date') field = <input type="date" value={typeof value === 'string' ? value : ''} onChange={(event) => onUpdate(record.id, property.id, event.target.value || null)} />
  else if (property.type === 'multiSelect') field = <input value={Array.isArray(value) ? value.join(', ') : ''} placeholder="逗号分隔" onChange={(event) => onUpdate(record.id, property.id, event.target.value.split(',').map((item) => item.trim()).filter(Boolean))} />
  else if (property.type === 'relation') field = <RelationValueEditor value={Array.isArray(value) ? value : []} target={property.relation?.databaseId ? relationTargets[property.relation.databaseId] : undefined} onChange={(next) => onUpdate(record.id, property.id, next)} />
  else if (['formula', 'rollup'].includes(property.type)) field = <output>{Array.isArray(value) ? value.join('、') : value === null || value === undefined ? '—' : String(value)}</output>
  else field = <input type={property.type === 'url' ? 'url' : 'text'} value={typeof value === 'string' ? value : ''} placeholder="空" onChange={(event) => onUpdate(record.id, property.id, event.target.value)} />
  return <label className="record-property-field"><span><i>{propertyTypeLabel(property.type)}</i>{property.name}</span>{field}</label>
}

function formatRecordTime(value: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function propertyTypeLabel(type: DatabaseProperty['type']) {
  return ({ title: 'Aa', text: 'Tx', number: '#', checkbox: '✓', select: '◉', multiSelect: '◎', date: '◫', url: '↗', relation: '↔', rollup: '∑', formula: 'ƒ' } as const)[type]
}

export function VirtualTable({ records, allRecords, updateCell, onOpenRecord, selectedIds = new Set<string>(), onToggleRecord, onToggleAll }: { records: DatabaseRecord[]; allRecords: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void; onOpenRecord?: (recordId: string) => void; selectedIds?: Set<string>; onToggleRecord?: (recordId: string) => void; onToggleAll?: () => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const { start, end, totalSize } = virtualWindow(records.length, scrollTop, ROW_HEIGHT, VIEWPORT_HEIGHT, OVERSCAN)
  const visible = records.slice(start, end)

  return (
    <div className="database-table">
      <div className="database-grid database-grid-head"><label className="database-row-select"><input aria-label="选择全部记录" type="checkbox" checked={records.length > 0 && selectedIds.size === records.length} onChange={() => onToggleAll?.()} /><span /></label><span>任务</span><span>状态</span><span>负责人</span><span>截止日期</span><span>优先级</span><span><Link2 size={11} />依赖</span><span><Sigma size={11} />汇总</span><span>ƒ 风险</span></div>
      <div className="database-viewport" style={{ height: Math.min(VIEWPORT_HEIGHT, Math.max(ROW_HEIGHT, records.length * ROW_HEIGHT)) }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        <div className="database-row-space" style={{ height: totalSize }}>
          {visible.map((record, offset) => (
            <div className={`database-grid database-grid-row ${selectedIds.has(record.id) ? 'is-selected' : ''}`} key={record.id} style={{ transform: `translateY(${(start + offset) * ROW_HEIGHT}px)` }}>
              <label className="database-row-select"><input aria-label={`选择记录 ${String(record.values['task-title'] || record.id)}`} type="checkbox" checked={selectedIds.has(record.id)} onChange={() => onToggleRecord?.(record.id)} /><span /></label>
              <div className="generic-title-cell"><input value={String(record.values['task-title'] ?? '')} onChange={(event) => updateCell(record.id, 'task-title', event.target.value)} /><button aria-label={`打开 ${String(record.values['task-title'] || '无标题')}`} title="打开记录详情" onClick={() => onOpenRecord?.(record.id)}><BookOpen size={12} /></button></div>
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

export function BoardView({ records, schema, groupByPropertyId, updateCell, onMove, manualOrderEnabled = true }: { records: DatabaseRecord[]; schema?: DatabaseSchema; groupByPropertyId?: string; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void; onMove?: (recordId: string, groupValue: string, targetId?: string) => void; manualOrderEnabled?: boolean }) {
  const [draggedRecordId, setDraggedRecordId] = useState<string | null>(null)
  const groupProperty = schema?.properties.find((property) => property.id === groupByPropertyId && property.type === 'select')
  const boardGroups = groupProperty?.options?.length ? groupProperty.options.map((option) => ({ id: option.id, label: option.name })) : statuses
  const propertyId = groupProperty?.id ?? 'task-status'
  const titlePropertyId = schema?.properties.find((property) => property.type === 'title')?.id ?? 'task-title'
  const groups = new Map(boardGroups.map((status) => [status.id, [] as DatabaseRecord[]]))
  for (const record of records) groups.get(String(record.values[propertyId]))?.push(record)
  return <div className="database-board">{boardGroups.map((status, index) => <VirtualBoardColumn key={status.id} status={status} propertyId={propertyId} titlePropertyId={titlePropertyId} nextGroupId={boardGroups[(index + 1) % boardGroups.length]?.id ?? status.id} records={groups.get(status.id) ?? []} updateCell={updateCell} draggedRecordId={draggedRecordId} manualOrderEnabled={manualOrderEnabled && Boolean(onMove)} onDragStart={setDraggedRecordId} onDragEnd={() => setDraggedRecordId(null)} onMove={(recordId, targetId) => onMove?.(recordId, status.id, targetId)} />)}</div>
}

function VirtualBoardColumn({ status, propertyId, titlePropertyId, nextGroupId, records, updateCell, draggedRecordId, manualOrderEnabled, onDragStart, onDragEnd, onMove }: { status: { id: string; label: string }; propertyId: string; titlePropertyId: string; nextGroupId: string; records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void; draggedRecordId: string | null; manualOrderEnabled: boolean; onDragStart: (recordId: string) => void; onDragEnd: () => void; onMove: (recordId: string, targetId?: string) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const { start, end, totalSize } = virtualWindow(records.length, scrollTop, BOARD_CARD_HEIGHT, 360, 3)
  return <div className={`board-column ${dragOver ? 'is-drag-over' : ''}`} onDragOver={(event) => { if (!manualOrderEnabled || !draggedRecordId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOver(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false) }} onDrop={(event) => { if (!manualOrderEnabled || !draggedRecordId) return; event.preventDefault(); onMove(draggedRecordId); setDragOver(false); onDragEnd() }}><header><span className={`status-dot status-${status.id}`} />{status.label}<em>{records.length}</em></header><div className="board-card-viewport" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}><div className="board-card-space" style={{ height: Math.max(230, totalSize) }}>{records.slice(start, end).map((record, offset) => <article className={draggedRecordId === record.id ? 'is-dragging' : ''} draggable={manualOrderEnabled} key={record.id} style={{ transform: `translateY(${(start + offset) * BOARD_CARD_HEIGHT}px)` }} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-notetodo-record-order', record.id); onDragStart(record.id) }} onDragEnd={() => { setDragOver(false); onDragEnd() }} onDragOver={(event) => { if (!manualOrderEnabled || draggedRecordId === record.id) return; event.preventDefault(); event.stopPropagation() }} onDrop={(event) => { if (!manualOrderEnabled || !draggedRecordId || draggedRecordId === record.id) return; event.preventDefault(); event.stopPropagation(); onMove(draggedRecordId, record.id); setDragOver(false); onDragEnd() }}><div className="board-card-title"><GripVertical size={12} /><strong>{record.values[titlePropertyId] ?? '无标题'}</strong></div><span><i>{record.values['task-owner'] || '未分配'}</i><time>{record.values['task-due']}</time></span><small className={record.values['task-risk'] === '需关注' ? 'is-risk' : ''}>{record.values['task-risk'] ?? '拖动卡片调整分组'} · 依赖分 {record.values['task-dependency-score'] ?? 0}</small><button onClick={() => updateCell(record.id, propertyId, nextGroupId)}>推进状态 →</button></article>)}</div></div></div>
}

export function ListView({ records, updateCell }: { records: DatabaseRecord[]; updateCell: (recordId: string, propertyId: string, value: PropertyValue) => void }) {
  const [scrollTop, setScrollTop] = useState(0)
  const { start, end, totalSize } = virtualWindow(records.length, scrollTop, LIST_ROW_HEIGHT, VIEWPORT_HEIGHT, OVERSCAN)
  return <div className="database-list" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}><div className="database-list-space" style={{ height: totalSize }}>{records.slice(start, end).map((record, offset) => <div className="database-list-row" key={record.id} style={{ transform: `translateY(${(start + offset) * LIST_ROW_HEIGHT}px)` }}><span className="list-index">{String(start + offset + 1).padStart(2, '0')}</span><input value={String(record.values['task-title'] ?? '')} onChange={(event) => updateCell(record.id, 'task-title', event.target.value)} /><StatusSelect record={record} updateCell={updateCell} /><span>{record.values['task-owner']}</span><time>{record.values['task-due']}</time></div>)}</div></div>
}
