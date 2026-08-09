import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEvent, fireEvent, render, waitFor } from '@testing-library/react'
import type { DatabaseRecord, DatabaseSchema, DatabaseView } from '@notetodo/database-core'
import { BoardView, BulkEditToolbar, DatabaseCreationPrompt, DatabaseTemplateMenu, GalleryView, GenericTable, GroupLedger, ListView, QuickFilterMenu, RecordDetailPanel, SchemaPanel, TemplateEditorPanel, TimelineView, ViewLayoutMenu, ViewManagementMenu, ViewRulesPanel, VirtualTable } from './DatabaseBlock'

const schema: DatabaseSchema = { id: 'tasks', name: 'Tasks', properties: [
  { id: 'title', name: 'Title', type: 'title' },
  { id: 'start', name: 'Start', type: 'date' },
  { id: 'end', name: 'End', type: 'date' },
] }
const record: DatabaseRecord = { id: 'task-1', values: { title: 'Timeline task', start: '2026-08-03', end: '2026-08-05' }, createdAt: '', updatedAt: '' }

afterEach(() => vi.useRealTimers())

describe('TimelineView', () => {
  it('moves both dates while preserving duration when a bar is dropped', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-07T08:00:00Z'))
    const updateCell = vi.fn()
    const { container } = render(<TimelineView records={[record]} schema={schema} startDatePropertyId="start" endDatePropertyId="end" updateCell={updateCell} />)
    const bar = container.querySelector<HTMLElement>('.timeline-track article')!
    const track = container.querySelector<HTMLElement>('.timeline-track')!
    const values = new Map<string, string>()
    const dataTransfer = { effectAllowed: 'none', setData: (type: string, value: string) => values.set(type, value), getData: (type: string) => values.get(type) ?? '' }
    fireEvent.dragStart(bar, { dataTransfer })
    // Monday 2026-08-03 is index 0; x=73 lands on Wednesday, index 2.
    const drop = createEvent.drop(track, { dataTransfer })
    Object.defineProperty(drop, 'clientX', { value: 73 })
    fireEvent(track, drop)
    expect(updateCell).toHaveBeenNthCalledWith(1, 'task-1', 'start', '2026-08-05')
    expect(updateCell).toHaveBeenNthCalledWith(2, 'task-1', 'end', '2026-08-07')
  })
})

describe('GalleryView', () => {
  it('rejects remote covers and advances the card status', () => {
    const updateCell = vi.fn()
    const gallerySchema: DatabaseSchema = { id: 'gallery', name: 'Gallery', properties: [
      { id: 'title', name: 'Title', type: 'title' },
      { id: 'status', name: 'Status', type: 'select' },
      { id: 'owner', name: 'Owner', type: 'text' },
      { id: 'cover', name: 'Cover', type: 'url' },
    ] }
    const galleryRecord: DatabaseRecord = { id: 'card-1', values: { title: 'Editorial card', status: 'todo', owner: 'Lin', cover: 'https://tracker.example/image.png' }, createdAt: '', updatedAt: '' }
    const { container, getByRole } = render(<GalleryView records={[galleryRecord]} schema={gallerySchema} coverPropertyId="cover" visiblePropertyIds={['owner']} updateCell={updateCell} />)
    expect(container.querySelector('.gallery-generated')).not.toBeNull()
    expect(container.querySelector('.gallery-cover img')).toBeNull()
    fireEvent.click(getByRole('button', { name: /推进/ }))
    expect(updateCell).toHaveBeenCalledWith('card-1', 'status', 'doing')
  })
})

describe('ViewRulesPanel', () => {
  it('composes OR filters and returns the saved view configuration', () => {
    const onSave = vi.fn()
    const ruleSchema: DatabaseSchema = { id: 'rules', name: 'Rules', properties: [
      { id: 'title', name: '任务', type: 'title' },
      { id: 'status', name: '状态', type: 'select', options: [{ id: 'todo', name: '待开始', color: 'slate' }, { id: 'doing', name: '进行中', color: 'amber' }] },
      { id: 'score', name: '优先级', type: 'number' },
    ] }
    const { getByRole } = render(<ViewRulesPanel schema={ruleSchema} config={{ filters: [{ propertyId: 'status', operator: 'equals', value: 'todo' }] }} initialTab="filters" onClose={vi.fn()} onSave={onSave} />)
    fireEvent.click(getByRole('button', { name: '任一条件' }))
    fireEvent.click(getByRole('button', { name: /添加条件/ }))
    fireEvent.click(getByRole('button', { name: '保存到当前视图' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ filterMode: 'or', filters: expect.arrayContaining([expect.objectContaining({ propertyId: 'status', value: 'todo' })]) }))
    expect(onSave.mock.calls[0]?.[0].filters).toHaveLength(2)
  })
})

describe('database quick queries and groups', () => {
  const querySchema: DatabaseSchema = { id: 'query', name: 'Query', properties: [
    { id: 'title', name: '名称', type: 'title' },
    { id: 'status', name: '状态', type: 'select', options: [{ id: 'todo', name: '待开始', color: 'slate' }, { id: 'doing', name: '进行中', color: 'blue' }] },
  ] }

  it('builds and removes persisted quick-filter chips', () => {
    const onChange = vi.fn()
    const menu = render(<QuickFilterMenu schema={querySchema} filters={[]} onClose={vi.fn()} onChange={onChange} />)
    fireEvent.change(menu.getByRole('combobox', { name: '快速筛选值' }), { target: { value: 'doing' } })
    fireEvent.click(menu.getByRole('button', { name: '添加' }))
    expect(onChange).toHaveBeenCalledWith([{ propertyId: 'status', operator: 'equals', value: 'doing' }])
    menu.unmount()
    const saved = [{ propertyId: 'status', operator: 'equals', value: 'doing' }] as const
    const persisted = render(<QuickFilterMenu schema={querySchema} filters={[...saved]} onClose={vi.fn()} onChange={onChange} />)
    fireEvent.click(persisted.getByRole('button', { name: '删除快速筛选 1' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('renders saved collapsed groups and reports toggle intent', () => {
    const onToggle = vi.fn()
    const groups = [{ key: 'doing', label: 'doing', records: [record] }]
    const { getByRole } = render(<GroupLedger groups={groups} schema={querySchema} propertyId="status" collapsedKeys={new Set(['doing'])} onToggle={onToggle} />)
    const button = getByRole('button', { name: '展开分组 进行中' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledWith('doing')
  })
})

describe('table view layout', () => {
  const layoutSchema: DatabaseSchema = { id: 'layout', name: 'Layout', properties: [
    { id: 'title', name: '名称', type: 'title' }, { id: 'status', name: '状态', type: 'text' }, { id: 'score', name: '分数', type: 'number' },
  ] }

  it('persists per-view property visibility and density choices', () => {
    const onSave = vi.fn()
    const { getByRole } = render(<ViewLayoutMenu schema={layoutSchema} config={{}} onClose={vi.fn()} onSave={onSave} />)
    fireEvent.click(getByRole('button', { name: '隐藏属性 状态' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ visiblePropertyIds: ['title', 'score'] }))
    fireEvent.click(getByRole('button', { name: '宽松' }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ rowHeight: 'comfortable' }))
    fireEvent.click(getByRole('button', { name: /^冻结首列/ }))
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ freezeFirstColumn: true }))
    fireEvent.dragStart(getByRole('button', { name: '调整视图属性顺序 分数' }), { dataTransfer: { effectAllowed: 'none' } })
    fireEvent.dragOver(getByRole('button', { name: '调整视图属性顺序 名称' }).closest('.layout-property-row')!)
    fireEvent.drop(getByRole('button', { name: '调整视图属性顺序 名称' }).closest('.layout-property-row')!)
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ propertyOrder: ['score', 'title', 'status'] }))
    expect(getByRole('button', { name: '隐藏属性 名称' })).toBeDisabled()
  })

  it('renders only visible properties and persists resized widths', () => {
    const onConfigChange = vi.fn()
    const record: DatabaseRecord = { id: 'row', values: { title: '文档', status: '进行中', score: 3 }, createdAt: '', updatedAt: '' }
    const { container, getByRole } = render(<GenericTable records={[record]} schema={layoutSchema} config={{ visiblePropertyIds: ['title', 'score'], propertyOrder: ['score', 'title', 'status'], rowHeight: 'compact', freezeFirstColumn: true, calculations: { score: 'sum' } }} onConfigChange={onConfigChange} updateCell={vi.fn()} />)
    expect([...container.querySelectorAll('.generic-database-head > span > b')].map((node) => node.textContent)).toEqual(['分数', '名称'])
    expect(container.querySelector<HTMLElement>('.generic-database-row')?.style.height).toBe('34px')
    expect(container.querySelector('.generic-database-table')?.classList.contains('is-first-column-frozen')).toBe(true)
    expect(container.querySelector('.generic-database-footer output')?.textContent).toBe('3')
    const viewport = container.querySelector<HTMLElement>('.generic-database-viewport')!; viewport.scrollLeft = 120; fireEvent.scroll(viewport)
    expect([...container.querySelectorAll<HTMLElement>('.generic-database-sync')].every((element) => element.scrollLeft === 120)).toBe(true)
    fireEvent.mouseDown(getByRole('button', { name: '调整列宽 名称' }), { clientX: 100 })
    fireEvent.mouseMove(window, { clientX: 150 })
    fireEvent.mouseUp(window, { clientX: 150 })
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ propertyWidths: { title: 270 }, calculations: { score: 'sum' } }))
  })

  it('keeps calculated generic tables virtualized at 10k records', () => {
    const records = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({ id: String(index), values: { title: `记录 ${index}`, score: index }, createdAt: '', updatedAt: '' }))
    const { container } = render(<GenericTable records={records} schema={layoutSchema} config={{ visiblePropertyIds: ['title', 'score'], calculations: { score: 'sum' } }} updateCell={vi.fn()} />)
    expect(container.querySelectorAll('.generic-database-row').length).toBeLessThanOrEqual(18)
    expect(container.querySelector('.generic-database-footer output')?.textContent).toBe('49995000')
  })
})

describe('large database DOM budgets', () => {
  const manyRecords = Array.from({ length: 10_000 }, (_, index): DatabaseRecord => ({
    id: `task-${index}`,
    values: { 'task-title': `Task ${index}`, 'task-status': ['todo', 'doing', 'done'][index % 3]!, 'task-owner': 'Lin', 'task-due': '2026-08-07' },
    createdAt: '', updatedAt: '',
  }))

  it('windows List rows instead of mounting all records', () => {
    const { container } = render(<ListView records={manyRecords} updateCell={vi.fn()} />)
    expect(container.querySelectorAll('.database-list-row').length).toBeLessThanOrEqual(14)
    expect(container.querySelector<HTMLElement>('.database-list-space')?.style.height).toBe('430000px')
  })

  it('windows each Board column independently', () => {
    const { container } = render(<BoardView records={manyRecords} updateCell={vi.fn()} />)
    expect(container.querySelectorAll('.board-column')).toHaveLength(3)
    expect(container.querySelectorAll('.board-column article').length).toBeLessThanOrEqual(18)
    expect(container.querySelectorAll('.board-card-space')).toHaveLength(3)
  })

  it('bounds Table rows and relation options together', () => {
    const { container } = render(<VirtualTable records={manyRecords} allRecords={manyRecords} updateCell={vi.fn()} />)
    expect(container.querySelectorAll('.database-grid-row').length).toBeLessThanOrEqual(14)
    expect(container.querySelectorAll('.relation-cell option').length).toBeLessThanOrEqual(1_430)
  })
})

describe('database authoring', () => {
  it('creates a database from the current page with a validated name', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const { getByRole } = render(<DatabaseCreationPrompt pageTitle="研究计划" onCreate={onCreate} />)
    fireEvent.click(getByRole('button', { name: /创建数据库/ }))
    const input = getByRole('textbox', { name: '数据库名称' })
    fireEvent.change(input, { target: { value: '研究资料库' } })
    fireEvent.click(getByRole('button', { name: '创建数据库' }))
    expect(onCreate).toHaveBeenCalledWith('研究资料库')
  })

  it('edits schema-driven title, select and date cells', () => {
    const updateCell = vi.fn()
    const authoringSchema: DatabaseSchema = { id: 'research-db', name: '研究', properties: [
      { id: 'name', name: '名称', type: 'title' },
      { id: 'status', name: '状态', type: 'select', options: [{ id: 'todo', name: '待开始', color: 'slate' }, { id: 'done', name: '已完成', color: 'green' }] },
      { id: 'date', name: '日期', type: 'date' },
    ] }
    const authored: DatabaseRecord = { id: 'r1', values: { name: '资料 A', status: 'todo', date: '2026-08-07' }, createdAt: '', updatedAt: '' }
    const { container, getByDisplayValue } = render(<GenericTable records={[authored]} schema={authoringSchema} updateCell={updateCell} />)
    fireEvent.change(getByDisplayValue('资料 A'), { target: { value: '资料 B' } })
    fireEvent.change(container.querySelector('.generic-select')!, { target: { value: 'done' } })
    expect(updateCell).toHaveBeenCalledWith('r1', 'name', '资料 B')
    expect(updateCell).toHaveBeenCalledWith('r1', 'status', 'done')
  })

  it('adds, renames and confirms deletion of schema properties', () => {
    const onAdd = vi.fn().mockResolvedValue(undefined); const onRename = vi.fn().mockResolvedValue(undefined); const onDelete = vi.fn().mockResolvedValue(undefined); const onConfigure = vi.fn().mockResolvedValue(undefined); const onReorder = vi.fn().mockResolvedValue(undefined)
    const authoringSchema: DatabaseSchema = { id: 'research-db', name: '研究', properties: [
      { id: 'name', name: '名称', type: 'title' }, { id: 'notes', name: '备注', type: 'text' },
      { id: 'status', name: '状态', type: 'select', options: [{ id: 'todo', name: '待开始', color: 'slate' }] },
    ] }
    const { getByRole } = render(<SchemaPanel schema={authoringSchema} databaseSources={[{ id: 'research-db', pageId: 'research', name: '研究', pageTitle: '研究', recordCount: 1 }]} relationTargets={{ 'research-db': { schema: authoringSchema, records: [] } }} onClose={vi.fn()} onAdd={onAdd} onRename={onRename} onReorder={onReorder} onConfigure={onConfigure} onDelete={onDelete} />)
    fireEvent.dragStart(getByRole('button', { name: '拖动排序 备注' }), { dataTransfer: { effectAllowed: 'none' } })
    fireEvent.dragOver(getByRole('textbox', { name: '状态 属性名称' }).closest('.schema-ledger-row')!)
    fireEvent.drop(getByRole('textbox', { name: '状态 属性名称' }).closest('.schema-ledger-row')!)
    fireEvent.change(getByRole('textbox', { name: '新属性名称' }), { target: { value: '评分' } })
    fireEvent.change(getByRole('combobox', { name: '新属性类型' }), { target: { value: 'number' } })
    fireEvent.click(getByRole('button', { name: /添加属性/ }))
    fireEvent.change(getByRole('textbox', { name: '备注 属性名称' }), { target: { value: '研究备注' } })
    fireEvent.blur(getByRole('textbox', { name: '备注 属性名称' }))
    fireEvent.click(getByRole('button', { name: '删除属性 备注' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(getByRole('button', { name: '删除属性 备注' }))
    fireEvent.click(getByRole('button', { name: '配置 状态' }))
    fireEvent.change(getByRole('textbox', { name: '选项 1 名称' }), { target: { value: '待处理' } })
    fireEvent.click(getByRole('button', { name: '保存配置' }))
    expect(onAdd).toHaveBeenCalledWith('评分', 'number')
    expect(onReorder).toHaveBeenCalledWith(['name', 'status', 'notes'])
    expect(onRename).toHaveBeenCalledWith('notes', '研究备注')
    expect(onDelete).toHaveBeenCalledWith('notes')
    expect(onConfigure).toHaveBeenCalledWith('status', { options: [{ id: 'todo', name: '待处理', color: 'slate' }] })
  })

  it('configures a Rollup through relation, target property and aggregation selectors', () => {
    const onConfigure = vi.fn().mockResolvedValue(undefined)
    const rollupSchema: DatabaseSchema = { id: 'projects', name: '项目', properties: [
      { id: 'name', name: '名称', type: 'title' },
      { id: 'tasks', name: '任务', type: 'relation', relation: { databaseId: 'tasks-db' } },
      { id: 'points', name: '任务分值', type: 'rollup', rollup: { relationPropertyId: 'tasks', targetPropertyId: 'score', aggregation: 'sum' } },
    ] }
    const taskSchema: DatabaseSchema = { id: 'tasks-db', name: '任务', properties: [{ id: 'title', name: '任务', type: 'title' }, { id: 'score', name: '分值', type: 'number' }] }
    const record: DatabaseRecord = { id: 'project-1', values: { name: '发布', tasks: ['task-1'] }, createdAt: '', updatedAt: '' }
    const targets = { 'tasks-db': { schema: taskSchema, records: [{ id: 'task-1', values: { title: '测试', score: 5 }, createdAt: '', updatedAt: '' }] } }
    const { getByRole, getByText } = render(<SchemaPanel schema={rollupSchema} previewRecord={record} databaseSources={[]} relationTargets={targets} onClose={vi.fn()} onAdd={vi.fn()} onRename={vi.fn()} onReorder={vi.fn()} onConfigure={onConfigure} onDelete={vi.fn()} />)
    fireEvent.click(getByRole('button', { name: '配置 任务分值' }))
    expect(getByText('5')).toBeTruthy()
    fireEvent.change(getByRole('combobox', { name: '汇总计算方式' }), { target: { value: 'average' } })
    fireEvent.click(getByRole('button', { name: '保存配置' }))
    expect(onConfigure).toHaveBeenCalledWith('points', { rollup: { relationPropertyId: 'tasks', targetPropertyId: 'score', aggregation: 'average' } })
  })

  it('opens a record detail surface with body and editable properties', () => {
    const onUpdateCell = vi.fn(); const onUpdateContent = vi.fn()
    const detailSchema: DatabaseSchema = { id: 'research-db', name: '研究资料', properties: [
      { id: 'name', name: '名称', type: 'title' },
      { id: 'status', name: '状态', type: 'select', options: [{ id: 'todo', name: '待开始', color: 'slate' }, { id: 'done', name: '已完成', color: 'green' }] },
    ] }
    const detailRecord: DatabaseRecord = { id: 'detail-1', values: { name: '离线知识图谱', status: 'todo' }, content: '<p>记录正文</p>', createdAt: '2026-08-07T08:00:00Z', updatedAt: '2026-08-07T08:00:00Z' }
    const { container, getByRole, getByText } = render(<RecordDetailPanel record={detailRecord} schema={detailSchema} onClose={vi.fn()} onUpdateCell={onUpdateCell} onUpdateContent={onUpdateContent} />)
    expect(getByText('记录正文')).toBeTruthy()
    fireEvent.change(getByRole('textbox', { name: '记录标题' }), { target: { value: '知识图谱 v2' } })
    fireEvent.change(container.querySelector('.record-property-field select')!, { target: { value: 'done' } })
    expect(onUpdateCell).toHaveBeenCalledWith('detail-1', 'name', '知识图谱 v2')
    expect(onUpdateCell).toHaveBeenCalledWith('detail-1', 'status', 'done')
  })

  it('creates and manages database views through the compact view menu', async () => {
    const activeView: DatabaseView = { id: 'view-table', databaseId: 'research-db', name: '全部资料', type: 'table', config: {} }
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const createMenu = render(<ViewManagementMenu mode="create" views={[activeView]} activeView={activeView} defaultViewId={activeView.id} onClose={vi.fn()} onCreate={onCreate} onRename={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} onSetDefault={vi.fn()} />)
    fireEvent.change(createMenu.getByRole('textbox', { name: '视图名称' }), { target: { value: '发布日历' } })
    fireEvent.click(createMenu.getByRole('button', { name: /日历/ }))
    fireEvent.click(createMenu.getByRole('button', { name: '创建' }))
    expect(onCreate).toHaveBeenCalledWith('发布日历', 'calendar')
    createMenu.unmount()

    const onDelete = vi.fn().mockResolvedValue(undefined); const onSetDefault = vi.fn().mockResolvedValue(undefined)
    const secondView: DatabaseView = { id: 'view-board', databaseId: 'research-db', name: '状态看板', type: 'board', config: {} }
    const manageMenu = render(<ViewManagementMenu mode="manage" views={[activeView, secondView]} activeView={secondView} defaultViewId={activeView.id} onClose={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} onSetDefault={onSetDefault} />)
    fireEvent.click(manageMenu.getByRole('button', { name: '设为默认视图' }))
    await waitFor(() => expect(onSetDefault).toHaveBeenCalledOnce())
    await waitFor(() => expect(manageMenu.getByRole('button', { name: '删除视图' })).toBeEnabled())
    fireEvent.click(manageMenu.getByRole('button', { name: '删除视图' }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(manageMenu.getByRole('button', { name: '确认删除此视图' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('selects rows, applies a bulk property value and saves a record template', async () => {
    const updateCell = vi.fn()
    const authoringSchema: DatabaseSchema = { id: 'bulk-db', name: '批量资料', properties: [
      { id: 'title', name: '名称', type: 'title' },
      { id: 'status', name: '状态', type: 'select', options: [{ id: 'todo', name: '待开始', color: 'slate' }, { id: 'done', name: '已完成', color: 'green' }] },
    ] }
    const rows: DatabaseRecord[] = [{ id: 'a', values: { title: 'A', status: 'todo' }, createdAt: '', updatedAt: '' }, { id: 'b', values: { title: 'B', status: 'todo' }, createdAt: '', updatedAt: '' }]
    const onToggle = vi.fn()
    const table = render(<GenericTable records={rows} schema={authoringSchema} updateCell={updateCell} selectedIds={new Set(['a'])} onToggleRecord={onToggle} onToggleAll={vi.fn()} />)
    fireEvent.click(table.getByRole('checkbox', { name: '选择记录 A' }))
    expect(onToggle).toHaveBeenCalledWith('a')
    table.unmount()

    const onApply = vi.fn().mockResolvedValue(undefined)
    const toolbar = render(<BulkEditToolbar schema={authoringSchema} count={2} onClear={vi.fn()} onApply={onApply} />)
    fireEvent.change(toolbar.getByRole('combobox', { name: '批量编辑属性' }), { target: { value: 'status' } })
    fireEvent.change(toolbar.getByRole('combobox', { name: '批量编辑值' }), { target: { value: 'done' } })
    fireEvent.click(toolbar.getByRole('button', { name: '应用' }))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('status', 'done'))
    toolbar.unmount()

    const onSaveSelection = vi.fn().mockResolvedValue(undefined)
    const onEdit = vi.fn()
    const templates = render(<DatabaseTemplateMenu templates={[]} selectedCount={1} onClose={vi.fn()} onCreateBlank={vi.fn()} onApply={vi.fn()} onEdit={onEdit} onSaveSelection={onSaveSelection} onDelete={vi.fn()} />)
    fireEvent.click(templates.getByRole('button', { name: /新建模板/u }))
    expect(onEdit).toHaveBeenCalledWith(null)
    fireEvent.change(templates.getByRole('textbox', { name: '模板名称' }), { target: { value: '发布检查' } })
    fireEvent.click(templates.getByRole('button', { name: '保存所选记录' }))
    await waitFor(() => expect(onSaveSelection).toHaveBeenCalledWith('发布检查'))
    templates.unmount()

    const onSave = vi.fn().mockResolvedValue(undefined)
    const editor = render(<TemplateEditorPanel schema={authoringSchema} template={null} onClose={vi.fn()} onSave={onSave} />)
    fireEvent.change(editor.getByRole('textbox', { name: '模板名称' }), { target: { value: '缺陷处理' } })
    fireEvent.change(editor.getByRole('combobox', { name: '状态 模板预设' }), { target: { value: 'done' } })
    fireEvent.click(editor.getByRole('button', { name: '保存模板' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: '缺陷处理', values: { status: 'done' } })))
  })
})
