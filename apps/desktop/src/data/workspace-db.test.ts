// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkspacePage } from '../domain'
import type { AutomationRule } from '@notetodo/automation-core'
import { WorkspaceDatabase } from './workspace-db-test-harness'
let database: InstanceType<typeof WorkspaceDatabase> | undefined
afterEach(() => database?.close())

describe('WorkspaceDatabase', () => {
  it('migrates and seeds a complete starter workspace atomically', () => {
    database = new WorkspaceDatabase(':memory:')
    const snapshot = database.loadWorkspace()
    expect(snapshot.activePageId).toBe('welcome')
    expect(snapshot.pages).toHaveLength(4)
    expect(snapshot.pages.every((page) => page.lastVisitedAt)).toBe(true)
  })

  it('upserts, indexes, archives and restores a page', () => {
    database = new WorkspaceDatabase(':memory:')
    const page: WorkspacePage = {
      id: 'searchable',
      title: '离线搜索性能',
      icon: 'note',
      parentId: null,
      favorite: false,
      content: '<p>SQLite 全文索引会找到这段独特内容。</p>',
      updatedAt: new Date().toISOString(),
      lastVisitedAt: new Date().toISOString(),
      archivedAt: null,
    }

    database.upsertPage(page)
    expect(database.searchPages('离线搜索性能').map((result) => result.id)).toContain('searchable')
    database.archivePage(page.id)
    expect(database.searchPages('离线搜索性能')).toHaveLength(0)
    database.restorePage(page.id)
    expect(database.searchPages('离线搜索性能')).toHaveLength(1)
  })

  it('persists typed database cells, records and active views', () => {
    database = new WorkspaceDatabase(':memory:')
    const initial = database.loadDatabaseByPage('projects')
    expect(initial?.records).toHaveLength(5)
    expect(initial?.views.map((view) => view.type)).toEqual(['table', 'board', 'list', 'calendar', 'timeline', 'gallery'])
    expect(initial?.views.at(-3)).toMatchObject({ type: 'calendar', config: { datePropertyId: 'task-due' } })
    expect(initial?.views.at(-2)).toMatchObject({ type: 'timeline', config: { startDatePropertyId: 'task-start', endDatePropertyId: 'task-due' } })
    expect(initial?.views.at(-1)).toMatchObject({ type: 'gallery', config: { coverPropertyId: 'task-cover', cardSize: 'medium' } })
    expect(initial?.schema.properties).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'task-start', type: 'date' }), expect.objectContaining({ id: 'task-cover', type: 'url' })]))

    database.updateDatabaseCell('task-1', 'task-score', 2)
    database.createDatabaseRecord('roadmap-db', 'task-new')
    database.updateDatabaseCell('task-new', 'task-title', '新增记录')
    database.updateDatabaseRecordContent('task-new', '<h2>验收记录</h2><p>正文独立持久化。</p>')
    database.setActiveDatabaseView('roadmap-db', 'roadmap-board')
    database.updateDatabaseViewConfig('roadmap-db', 'roadmap-board', { filters: [{ propertyId: 'task-status', operator: 'equals', value: 'doing' }], filterMode: 'and' })

    const updated = database.loadDatabaseByPage('projects')
    expect(updated?.records.find((record) => record.id === 'task-1')?.values['task-score']).toBe(2)
    expect(updated?.records.find((record) => record.id === 'task-new')?.values['task-title']).toBe('新增记录')
    expect(updated?.records.find((record) => record.id === 'task-new')?.content).toContain('正文独立持久化')
    expect(updated?.activeViewId).toBe('roadmap-board')
    expect(updated?.views.find((view) => view.id === 'roadmap-board')?.config.filters).toHaveLength(1)
    expect(() => database?.updateDatabaseViewConfig('roadmap-db', 'missing-view', {})).toThrow(/does not exist/)
  })

  it('records bounded property and content history and restores one change', () => {
    database = new WorkspaceDatabase(':memory:')
    database.updateDatabaseCell('task-1', 'task-owner', '历史测试')
    database.updateDatabaseRecordContent('task-1', '<p>新版正文</p>')
    const history = database.listDatabaseRecordHistory('task-1')
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyId: 'task-owner', propertyName: '负责人', previous: 'Lin', next: '历史测试', kind: 'property' }),
      expect.objectContaining({ propertyId: null, propertyName: '正文', previous: '', next: '<p>新版正文</p>', kind: 'content' }),
    ]))
    const ownerChange = history.find((entry) => entry.propertyId === 'task-owner')!
    const restored = database.restoreDatabaseRecordHistory(ownerChange.id)
    expect(restored.records.find((record) => record.id === 'task-1')?.values['task-owner']).toBe('Lin')
    expect(database.listDatabaseRecordHistory('task-1')).toEqual(expect.arrayContaining([expect.objectContaining({ propertyId: 'task-owner', previous: '历史测试', next: 'Lin' })]))
  })

  it('persists record and property discussions with unresolved filtering', () => {
    database = new WorkspaceDatabase(':memory:')
    database.createDatabaseRecordComment({ id: 'comment-1', recordId: 'task-1', propertyId: 'task-owner', authorName: 'Lin', body: '请确认负责人。' })
    database.createDatabaseRecordComment({ id: 'comment-2', recordId: 'task-1', propertyId: null, authorName: 'Ming', body: '整条记录需要复核。' })
    expect(database.listDatabaseRecordComments('task-1')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'comment-1', propertyName: '负责人' }), expect.objectContaining({ id: 'comment-2', propertyName: '整条记录' })]))
    database.resolveDatabaseRecordComment('comment-1', true)
    expect(database.listDatabaseRecordComments('task-1', true).map((comment) => comment.id)).toEqual(['comment-2'])
    database.deleteDatabaseRecordComment('comment-2')
    expect(database.listDatabaseRecordComments('task-1')).toHaveLength(1)
  })

  it('manages date reminders and exposes overdue active reminders', () => {
    database = new WorkspaceDatabase(':memory:')
    database.saveDatabaseRecordReminder({ id: 'reminder-1', recordId: 'task-1', propertyId: 'task-due', dueAt: '2020-01-01T09:00:00.000Z', note: '已经到期' })
    expect(database.listDatabaseRecordReminders('task-1')).toContainEqual(expect.objectContaining({ id: 'reminder-1', propertyId: 'task-due', overdue: true }))
    expect(database.listDueDatabaseRecordReminders()).toContainEqual(expect.objectContaining({ id: 'reminder-1' }))
    database.completeDatabaseRecordReminder('reminder-1', true)
    expect(database.listDueDatabaseRecordReminders()).toEqual([])
    database.completeDatabaseRecordReminder('reminder-1', false)
    database.deleteDatabaseRecordReminder('reminder-1')
    expect(database.listDatabaseRecordReminders('task-1')).toEqual([])
    expect(() => database?.saveDatabaseRecordReminder({ id: 'bad-reminder', recordId: 'task-1', propertyId: 'task-owner', dueAt: new Date().toISOString(), note: '' })).toThrow(/date property/)
  })

  it('duplicates, trashes, restores and permanently deletes records transactionally', () => {
    database = new WorkspaceDatabase(':memory:')
    const duplicate = database.duplicateDatabaseRecord('roadmap-db', 'task-1', 'task-copy')
    expect(duplicate.records.find((record) => record.id === 'task-copy')?.values).toEqual(duplicate.records.find((record) => record.id === 'task-1')?.values)
    const trashed = database.trashDatabaseRecords('roadmap-db', ['task-copy', 'task-2'])
    expect(trashed.records.some((record) => ['task-copy', 'task-2'].includes(record.id))).toBe(false)
    expect(database.listTrashedDatabaseRecords('roadmap-db')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'task-copy', title: '编辑器交互收尾' }), expect.objectContaining({ id: 'task-2', title: 'SQLite 数据迁移' })]))
    expect(database.restoreDatabaseRecords('roadmap-db', ['task-2']).records.some((record) => record.id === 'task-2')).toBe(true)
    database.deleteDatabaseRecordsPermanently('roadmap-db', ['task-copy'])
    expect(database.listTrashedDatabaseRecords('roadmap-db')).toEqual([])
    expect(() => database?.restoreDatabaseRecords('roadmap-db', ['task-copy'])).toThrow(/does not exist/)
  })

  it('creates a typed database atomically on any existing page', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    database.upsertPage({ id: 'research', title: '研究台账', icon: 'grid', parentId: null, favorite: false, content: '<p></p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
    const created = database.createDatabaseForPage('research', 'research-db', '研究台账')

    expect(created.schema).toMatchObject({ id: 'research-db', name: '研究台账' })
    expect(created.schema.properties.map((property) => property.type)).toEqual(['title', 'select', 'date'])
    expect(created.views).toEqual([expect.objectContaining({ id: 'research-db-table', type: 'table', name: '默认表格' })])
    expect(database.loadDatabaseByPage('research')?.activeViewId).toBe('research-db-table')
    database.addDatabaseProperty('research-db', 'research-notes', '备注', 'text')
    database.renameDatabaseProperty('research-db', 'research-notes', '研究备注')
    expect(database.loadDatabaseByPage('research')?.schema.properties.at(-1)).toMatchObject({ id: 'research-notes', name: '研究备注', type: 'text' })
    database.deleteDatabaseProperty('research-db', 'research-notes')
    expect(database.loadDatabaseByPage('research')?.schema.properties.some((property) => property.id === 'research-notes')).toBe(false)
    expect(() => database!.deleteDatabaseProperty('research-db', 'research-db-title')).toThrow(/cannot be deleted/)
    expect(() => database!.createDatabaseForPage('missing', 'missing-db', '无效')).toThrow('Database page does not exist.')
    database.addDatabaseProperty('research-db', 'research-stage', '阶段', 'select')
    const configuredSelect = database.updateDatabasePropertyConfig('research-db', 'research-stage', { options: [{ id: 'idea', name: '想法', color: 'purple' }, { id: 'ready', name: '就绪', color: 'green' }] })
    expect(configuredSelect.schema.properties.find((property) => property.id === 'research-stage')?.options).toEqual([{ id: 'idea', name: '想法', color: 'purple' }, { id: 'ready', name: '就绪', color: 'green' }])
    database.addDatabaseProperty('research-db', 'research-relation', '关联路线', 'relation')
    expect(database.updateDatabasePropertyConfig('research-db', 'research-relation', { relation: { databaseId: 'roadmap-db' } }).schema.properties.at(-1)).toMatchObject({ relation: { databaseId: 'roadmap-db' } })
    database.addDatabaseProperty('research-db', 'research-formula', '评分标签', 'formula')
    expect(database.updateDatabasePropertyConfig('research-db', 'research-formula', { formula: { expression: 'concat("P", [research-db-date])' } }).schema.properties.at(-1)).toMatchObject({ formula: { expression: expect.stringContaining('concat') } })
    database.addDatabaseProperty('research-db', 'research-rollup', '路线任务数', 'rollup')
    expect(database.updateDatabasePropertyConfig('research-db', 'research-rollup', { rollup: { relationPropertyId: 'research-relation', targetPropertyId: 'task-title', aggregation: 'count' } }).schema.properties.at(-1)).toMatchObject({ rollup: { relationPropertyId: 'research-relation', targetPropertyId: 'task-title', aggregation: 'count' } })
    expect(database.renameDatabase('research-db', '研究资料库').schema.name).toBe('研究资料库')
    const reordered = database.reorderDatabaseProperties('research-db', ['research-db-title', 'research-rollup', 'research-db-status', 'research-db-date', 'research-stage', 'research-relation', 'research-formula'])
    expect(reordered.schema.properties[1]?.id).toBe('research-rollup')
    expect(database.listDatabaseSources()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'research-db', pageId: 'research' }), expect.objectContaining({ id: 'roadmap-db' })]))
    expect(() => database?.updateDatabasePropertyConfig('research-db', 'research-stage', { options: [{ id: 'x', name: '重复', color: 'blue' }, { id: 'y', name: '重复', color: 'red' }] })).toThrow(/unique names/)
  })

  it('creates, renames, reorders and safely deletes persisted views', () => {
    database = new WorkspaceDatabase(':memory:')
    const created = database.createDatabaseView('roadmap-db', 'roadmap-review', '评审视图', 'table', { sorts: [{ propertyId: 'task-due', direction: 'asc' }] })
    expect(created.activeViewId).toBe('roadmap-review')
    expect(created.views.at(-1)).toMatchObject({ id: 'roadmap-review', name: '评审视图', type: 'table' })
    database.updateDatabaseViewConfig('roadmap-db', 'roadmap-review', { visiblePropertyIds: ['task-title', 'task-status'], propertyWidths: { 'task-title': 280 }, rowHeight: 'compact', propertyOrder: ['task-status', 'task-title'], freezeFirstColumn: true, calculations: { 'task-title': 'count', 'task-score': 'average' }, quickFilters: [{ propertyId: 'task-status', operator: 'equals', value: 'doing' }], groupByPropertyId: 'task-status', collapsedGroupKeys: ['done'], recordOrder: ['roadmap-3', 'roadmap-1'] })
    expect(database.loadDatabaseByPage('projects')?.views.find((view) => view.id === 'roadmap-review')?.config).toMatchObject({ visiblePropertyIds: ['task-title', 'task-status'], propertyWidths: { 'task-title': 280 }, rowHeight: 'compact', propertyOrder: ['task-status', 'task-title'], freezeFirstColumn: true, calculations: { 'task-title': 'count', 'task-score': 'average' }, quickFilters: [{ propertyId: 'task-status', operator: 'equals', value: 'doing' }], groupByPropertyId: 'task-status', collapsedGroupKeys: ['done'], recordOrder: ['roadmap-3', 'roadmap-1'] })

    database.renameDatabaseView('roadmap-db', 'roadmap-review', '发布评审')
    const reordered = database.setDefaultDatabaseView('roadmap-db', 'roadmap-review')
    expect(reordered.views[0]).toMatchObject({ id: 'roadmap-review', name: '发布评审' })

    const deleted = database.deleteDatabaseView('roadmap-db', 'roadmap-review')
    expect(deleted.views.some((view) => view.id === 'roadmap-review')).toBe(false)
    expect(deleted.activeViewId).toBe('roadmap-table')
    expect(() => database?.setActiveDatabaseView('roadmap-db', 'missing-view')).toThrow(/does not exist/)

    const isolated = database.createDatabaseForPage('welcome', 'single-view-db', '单视图')
    expect(() => database?.deleteDatabaseView('single-view-db', isolated.views[0]!.id)).toThrow(/final database view/)
  })

  it('applies transactional bulk edits and reusable record templates', () => {
    database = new WorkspaceDatabase(':memory:')
    const bulk = database.bulkUpdateDatabaseRecords('roadmap-db', ['task-1', 'task-2'], 'task-owner', '发布组')
    expect(bulk.records.filter((record) => ['task-1', 'task-2'].includes(record.id)).every((record) => record.values['task-owner'] === '发布组')).toBe(true)

    const now = new Date().toISOString()
    const saved = database.saveDatabaseTemplate('roadmap-db', { id: 'release-template', name: '发布检查', values: { 'task-status': 'todo', 'task-owner': '发布组', 'task-score': 2 }, content: '<h2>发布检查</h2><p>逐项确认。</p>', createdAt: now })
    expect(saved.templates).toEqual([expect.objectContaining({ id: 'release-template', name: '发布检查' })])
    const applied = database.createDatabaseRecordFromTemplate('roadmap-db', 'release-template', 'task-from-template')
    expect(applied.records.find((record) => record.id === 'task-from-template')).toMatchObject({ values: { 'task-status': 'todo', 'task-owner': '发布组', 'task-score': 2 }, content: expect.stringContaining('逐项确认') })
    expect(database.deleteDatabaseTemplate('roadmap-db', 'release-template').templates).toHaveLength(0)
    expect(() => database?.bulkUpdateDatabaseRecords('roadmap-db', ['missing'], 'task-owner', 'x')).toThrow(/selected database record/)
    const imported = database.importDatabaseRecords('roadmap-db', [
      { id: 'csv-1', values: { 'task-title': 'CSV 任务', 'task-score': 8, 'task-status': 'doing' } },
      { id: 'csv-2', values: { 'task-title': '第二条', 'task-owner': 'Lin' } },
    ])
    expect(imported.records.slice(-2).map((record) => record.values)).toEqual([
      expect.objectContaining({ 'task-title': 'CSV 任务', 'task-score': 8, 'task-status': 'doing' }),
      expect.objectContaining({ 'task-title': '第二条', 'task-owner': 'Lin' }),
    ])
    expect(() => database?.importDatabaseRecords('roadmap-db', [{ id: 'csv-1', values: {} }])).toThrow()
  })

  it('enforces property defaults, required values and uniqueness in SQLite transactions', () => {
    database = new WorkspaceDatabase(':memory:')
    database.addDatabaseProperty('roadmap-db', 'task-code', '编号', 'text')
    const configured = database.updateDatabasePropertyConfig('roadmap-db', 'task-code', { constraints: { unique: true } })
    expect(configured.schema.properties.find((property) => property.id === 'task-code')).toMatchObject({ constraints: { unique: true } })
    database.updateDatabaseCell('task-1', 'task-code', 'NT-001')
    expect(() => database?.updateDatabaseCell('task-2', 'task-code', 'NT-001')).toThrow(/唯一/)

    const ids = database.loadDatabaseByPage('projects')!.records.map((record) => record.id)
    database.bulkUpdateDatabaseRecords('roadmap-db', ids, 'task-code', null)
    expect(() => database?.updateDatabasePropertyConfig('roadmap-db', 'task-code', { constraints: { required: true, defaultValue: '待编号' } })).toThrow(/补全/)
    ids.forEach((id, index) => database?.updateDatabaseCell(id, 'task-code', `NT-${index + 1}`))
    database.updateDatabasePropertyConfig('roadmap-db', 'task-code', { constraints: { required: true, defaultValue: '待编号' } })
    expect(() => database?.updateDatabaseCell('task-1', 'task-code', null)).toThrow(/必填/)
    const imported = database.importDatabaseRecords('roadmap-db', [{ id: 'constrained-import', values: { 'task-title': '约束导入' } }])
    expect(imported.records.find((record) => record.id === 'constrained-import')?.values['task-code']).toBe('待编号')
  })

  it('persists validated relations while keeping derived properties read-only', () => {
    database = new WorkspaceDatabase(':memory:')
    database.updateDatabaseCell('task-1', 'task-dependencies', ['task-2', 'task-2', 'task-4'])

    const updated = database.loadDatabaseByPage('projects')
    expect(updated?.schema.properties.map((property) => property.type)).toContain('rollup')
    expect(updated?.schema.properties.map((property) => property.type)).toContain('formula')
    expect(updated?.records.find((record) => record.id === 'task-1')?.values['task-dependencies']).toEqual(['task-2', 'task-4'])
    expect(() => database?.updateDatabaseCell('task-1', 'task-risk', '被篡改')).toThrow(/read-only/)
    expect(() => database?.updateDatabaseCell('task-1', 'task-dependencies', ['missing-record'])).toThrow(/does not exist/)
  })

  it('keeps reciprocal relation properties consistent in one transaction', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    database.upsertPage({ id: 'research', title: '研究台账', icon: 'grid', parentId: null, favorite: false, content: '<p></p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
    database.createDatabaseForPage('research', 'research-db', '研究台账')
    database.createDatabaseRecord('research-db', 'research-1')
    database.addDatabaseProperty('research-db', 'research-tasks', '相关任务', 'relation')
    database.updateDatabasePropertyConfig('research-db', 'research-tasks', { relation: { databaseId: 'roadmap-db' } })
    database.addDatabaseProperty('roadmap-db', 'task-research', '研究资料', 'relation')
    database.updateDatabasePropertyConfig('roadmap-db', 'task-research', { relation: { databaseId: 'research-db', reciprocalPropertyId: 'research-tasks' } })

    database.updateDatabaseCell('task-1', 'task-research', ['research-1'])
    expect(database.loadDatabaseByPage('research')?.records[0]?.values['research-tasks']).toEqual(['task-1'])
    database.updateDatabaseCell('task-1', 'task-research', [])
    expect(database.loadDatabaseByPage('research')?.records[0]?.values['research-tasks']).toEqual([])
    expect(() => database?.updateDatabasePropertyConfig('roadmap-db', 'task-research', { relation: { databaseId: 'research-db', reciprocalPropertyId: 'research-db-title' } })).toThrow(/反向关联/)
  })

  it('blocks destructive property deletion and safely unbinds reciprocal relations', () => {
    database = new WorkspaceDatabase(':memory:')
    expect(() => database?.deleteDatabaseProperty('roadmap-db', 'task-dependencies')).toThrow(/依赖总优先级/)
    expect(() => database?.deleteDatabaseProperty('roadmap-db', 'task-dependency-score')).toThrow(/风险标签/)
    const now = new Date().toISOString()
    database.upsertPage({ id: 'research', title: '研究台账', icon: 'grid', parentId: null, favorite: false, content: '<p></p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
    database.createDatabaseForPage('research', 'research-db', '研究台账')
    database.addDatabaseProperty('research-db', 'research-tasks', '相关任务', 'relation')
    database.updateDatabasePropertyConfig('research-db', 'research-tasks', { relation: { databaseId: 'roadmap-db' } })
    database.addDatabaseProperty('roadmap-db', 'task-research', '研究资料', 'relation')
    database.updateDatabasePropertyConfig('roadmap-db', 'task-research', { relation: { databaseId: 'research-db', reciprocalPropertyId: 'research-tasks' } })
    database.deleteDatabaseProperty('research-db', 'research-tasks')
    expect(database.loadDatabaseByPage('projects')?.schema.properties.find((property) => property.id === 'task-research')?.relation).toEqual({ databaseId: 'research-db' })
  })

  it('executes persisted automations transactionally and records successful runs', () => {
    database = new WorkspaceDatabase(':memory:')
    expect(database.listDatabaseAutomations('roadmap-db')).toEqual([expect.objectContaining({ id: 'completed-task-priority', enabled: true })])
    const result = database.updateDatabaseCell('task-4', 'task-status', 'done')
    expect(result.automationRuns).toHaveLength(1)
    expect(database.loadDatabaseByPage('projects')?.records.find((record) => record.id === 'task-4')?.values['task-score']).toBe(1)
    expect(database.listAutomationRuns('roadmap-db')[0]).toMatchObject({ automationId: 'completed-task-priority', status: 'succeeded' })
  })

  it('isolates failed automation actions and replays captured input with a corrected rule', () => {
    database = new WorkspaceDatabase(':memory:')
    const rule: AutomationRule = { id: 'failing-relation', name: 'Broken relation', enabled: true, trigger: { type: 'propertyChanged', propertyId: 'task-owner' }, condition: { propertyId: 'task-owner', operator: 'equals', value: 'boom' }, actions: [{ type: 'setProperty', propertyId: 'task-dependencies', value: ['missing-record'] }] }
    database.saveDatabaseAutomation('roadmap-db', rule)
    database.updateDatabaseCell('task-1', 'task-owner', 'boom')
    const failed = database.listAutomationRuns('roadmap-db').find((run) => run.automationId === rule.id)!
    expect(failed).toMatchObject({ status: 'failed' })
    expect(database.loadDatabaseByPage('projects')?.records.find((record) => record.id === 'task-1')?.values['task-owner']).toBe('boom')

    const failedReplayId = database.replayAutomationRun(failed.id)
    expect(database.listAutomationRuns('roadmap-db').find((run) => run.id === failedReplayId)).toMatchObject({ status: 'failed', replayOf: failed.id })

    database.saveDatabaseAutomation('roadmap-db', { ...rule, actions: [{ type: 'setProperty', propertyId: 'task-score', value: 2 }] })
    const replayId = database.replayAutomationRun(failed.id)
    expect(database.listAutomationRuns('roadmap-db').find((run) => run.id === replayId)).toMatchObject({ status: 'succeeded', replayOf: failed.id })
    expect(database.loadDatabaseByPage('projects')?.records.find((record) => record.id === 'task-1')?.values['task-score']).toBe(2)
  })

  it('prevents an automation id from overwriting a rule in another database', () => {
    database = new WorkspaceDatabase(':memory:')
    const existing = database.listDatabaseAutomations('roadmap-db')[0]!
    expect(() => database?.saveDatabaseAutomation('another-db', existing)).toThrow(/another database/)
    expect(database.listDatabaseAutomations('roadmap-db')[0]).toMatchObject({ id: existing.id, name: existing.name })
  })

  it('imports page trees and typed CSV databases in one transaction', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    const page = (id: string, parentId: string | null, icon: 'book' | 'grid') => ({ id, title: id, icon, parentId, favorite: false, content: '<p>imported</p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
    database.createImportJob('import-job', 'Workspace.zip')
    const result = database.importWorkspaceBundle({
      importId: 'import-job',
      pages: [page('import-root', null, 'book'), page('import-table', 'import-root', 'grid')],
      databases: [{ id: 'import-db', pageId: 'import-table', name: 'Tasks', headers: ['Name', 'Score', 'Done'], rows: [{ Name: 'Ship', Score: '3', Done: 'true' }], inferredTypes: { Name: 'text', Score: 'number', Done: 'checkbox' } }],
      attachments: [{ hash: 'a'.repeat(64), size: 42, mimeType: 'image/png', relativePath: `aa/${'a'.repeat(64)}`, sourcePath: 'assets/cover.png', displayName: 'cover.png', referencedBy: ['import-root'] }],
      report: { importedAssets: 1 },
    })

    expect(result).toMatchObject({ rootPageId: 'import-root', pageCount: 2, databaseCount: 1 })
    expect(database.loadWorkspace().activePageId).toBe('import-root')
    const imported = database.loadDatabaseByPage('import-table')
    expect(imported?.records[0]?.values).toEqual({ 'import-db-p0': 'Ship', 'import-db-p1': 3, 'import-db-p2': true })
    expect(database.getAttachment('a'.repeat(64))).toMatchObject({ mimeType: 'image/png', relativePath: `aa/${'a'.repeat(64)}` })
    expect(database.loadImportJobs()[0]).toMatchObject({ id: 'import-job', status: 'completed', report: { importedAssets: 1 } })
  })

  it('rolls back every page when an imported database is invalid', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    expect(() => database?.importWorkspaceBundle({
      pages: [{ id: 'rolled-back-root', title: 'Rollback', icon: 'book', parentId: null, favorite: false, content: '', updatedAt: now, lastVisitedAt: now, archivedAt: null }],
      databases: [{ id: 'broken-db', pageId: 'missing-page', name: 'Broken', headers: [], rows: [], inferredTypes: {} }],
      report: {},
    })).toThrow()
    expect(database.loadWorkspace().pages.some((page) => page.id === 'rolled-back-root')).toBe(false)
  })

  it('marks interrupted imports as failed for recovery reporting', () => {
    database = new WorkspaceDatabase(':memory:')
    database.createImportJob('interrupted-job', 'Large workspace.zip')
    database.recoverInterruptedImports()
    expect(database.loadImportJobs()[0]).toMatchObject({ id: 'interrupted-job', status: 'failed' })
  })

  it('registers manually selected assets without duplicating content records', () => {
    database = new WorkspaceDatabase(':memory:')
    const attachment = { hash: 'b'.repeat(64), size: 128, mimeType: 'application/pdf', relativePath: `bb/${'b'.repeat(64)}`, displayName: 'brief.pdf' }
    database.registerPageAttachments('welcome', [attachment, attachment])
    expect(database.getAttachment(attachment.hash)).toMatchObject({ hash: attachment.hash, size: 128, mimeType: 'application/pdf' })
  })

  it('reconciles attachment references from serialized page content', () => {
    database = new WorkspaceDatabase(':memory:')
    const hash = 'c'.repeat(64)
    const attachment = { hash, size: 64, mimeType: 'image/png', relativePath: `cc/${hash}`, displayName: 'cover.png' }
    database.registerPageAttachments('welcome', [attachment])
    const page = database.loadWorkspace().pages.find((candidate) => candidate.id === 'welcome')!
    database.upsertPage({ ...page, content: `<img src="notetodo-asset://${hash}/cover.png">` })
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).toHaveLength(0)

    database.upsertPage({ ...page, content: '<p>附件块已删除</p>' })
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).toContainEqual({ hash, relativePath: `cc/${hash}` })
    expect(database.deleteAttachmentIfUnreferenced(hash, '9999-01-01T00:00:00.000Z')).toBe(true)
    expect(database.getAttachment(hash)).toBeNull()
  })

  it('coalesces automatic history and makes every restore reversible', () => {
    database = new WorkspaceDatabase(':memory:')
    const original = database.loadWorkspace().pages.find((page) => page.id === 'welcome')!
    database.upsertPage({ ...original, title: '第一次编辑', content: '<p>alpha</p>' })
    database.upsertPage({ ...original, title: '第二次编辑', content: '<p>beta</p>' })
    const versions = database.listPageVersions('welcome')
    expect(versions).toHaveLength(1)
    expect(database.getPageVersion('welcome', versions[0]!.id)).toMatchObject({ title: original.title, content: original.content })

    const restored = database.restorePageVersion('welcome', versions[0]!.id)
    expect(restored).toMatchObject({ title: original.title, content: original.content })
    expect(database.listPageVersions('welcome')).toHaveLength(2)
    expect(database.listPageVersions('welcome')[0]?.reason).toBe('restore')
  })

  it('keeps assets referenced only by reversible history out of garbage collection', () => {
    database = new WorkspaceDatabase(':memory:')
    const hash = 'e'.repeat(64)
    const attachment = { hash, size: 32, mimeType: 'image/png', relativePath: `ee/${hash}`, displayName: 'history.png' }
    database.registerPageAttachments('welcome', [attachment])
    const original = database.loadWorkspace().pages.find((page) => page.id === 'welcome')!
    database.upsertPage({ ...original, content: `<img src="notetodo-asset://${hash}/history.png">` })
    const originalVersion = database.listPageVersions('welcome')[0]!
    database.restorePageVersion('welcome', originalVersion.id)
    expect(database.listUnreferencedAttachments('9999-01-01T00:00:00.000Z')).not.toContainEqual(expect.objectContaining({ hash }))
  })

  it('fuses lexical and local semantic retrieval after permission filtering', () => {
    database = new WorkspaceDatabase(':memory:')
    const now = new Date().toISOString()
    database.upsertPage({ id: 'private-retrieval', title: '火星发射清单', icon: 'note', parentId: null, favorite: false, content: '<p>推进剂阀门检查与轨道窗口确认。</p>', updatedAt: now, lastVisitedAt: now, archivedAt: null })
    database.upsertPagePermission('private-retrieval', 'member-allowed', 'Allowed', 'viewer')

    expect(database.hybridSearch('火星 推进剂', 'member-allowed').map((item) => item.pageId)).toContain('private-retrieval')
    expect(database.hybridSearch('火星 推进剂', 'member-denied').map((item) => item.pageId)).not.toContain('private-retrieval')
    expect(database.hybridSearch('火星 推进剂', 'member-allowed')[0]).toMatchObject({ citationId: 'S1' })
  })

  it('stores only API token hashes and enforces scopes, expiry and revocation', () => {
    database = new WorkspaceDatabase(':memory:')
    const issued = database.issueApiToken('Local integration', ['pages:read', 'databases:read'])
    expect(database.listApiTokens()[0]).not.toHaveProperty('rawToken')
    expect(database.authenticateApiToken(issued.rawToken, 'pages:read')).toMatchObject({ id: issued.id, name: 'Local integration' })
    expect(database.authenticateApiToken(issued.rawToken, 'pages:write')).toBeNull()
    expect(database.listApiTokens()[0]?.lastUsedAt).toBeTruthy()
    expect(database.revokeApiToken(issued.id)).toBe(true)
    expect(database.authenticateApiToken(issued.rawToken, 'pages:read')).toBeNull()
  })

  it('records bounded API audit entries without credential material', () => {
    database = new WorkspaceDatabase(':memory:')
    database.recordApiAudit({ requestId: 'request-1', tokenId: null, method: 'GET', path: '/v1/pages', status: 200, durationMs: 4.4 })
    expect(database.listApiAudit()).toEqual([expect.objectContaining({ requestId: 'request-1', status: 200, durationMs: 4 })])
  })

  it('coalesces transactional webhook events and recovers delivery through a lease', () => {
    database = new WorkspaceDatabase(':memory:')
    const endpoint = database.createWebhookEndpoint('Product events', 'https://hooks.example.com/notetodo', ['page.updated'], Buffer.from('encrypted-secret'))
    const original = database.loadWorkspace().pages.find((page) => page.id === 'welcome')!
    database.upsertPage({ ...original, title: 'First event', updatedAt: '2026-08-07T01:00:00.000Z' })
    database.upsertPage({ ...original, title: 'Coalesced event', updatedAt: '2026-08-07T01:00:01.000Z' })

    expect(database.listWebhookEndpoints()[0]).toMatchObject({ id: endpoint.id, pendingCount: 1, deadCount: 0 })
    expect(database.setWebhookEndpointActive(endpoint.id, false)).toBe(true)
    expect(database.claimWebhookDeliveries('paused-worker', 10, 30_000, '2026-08-07T01:00:02.000Z')).toHaveLength(0)
    database.setWebhookEndpointActive(endpoint.id, true)
    const [delivery] = database.claimWebhookDeliveries('worker-1', 10, 30_000, '2026-08-07T01:00:02.000Z')
    expect(JSON.parse(delivery!.payload)).toMatchObject({ event: 'page.updated', data: { page: { title: 'Coalesced event' } } })
    expect(delivery!.encryptedSecret.toString()).toBe('encrypted-secret')
    expect(database.completeWebhookDelivery(delivery!.id, 'worker-1', { statusCode: 503, durationMs: 12, errorMessage: 'temporary' })).toMatchObject({ status: 'pending', attempt: 1 })

    const [retry] = database.claimWebhookDeliveries('worker-2', 10, 30_000, '9999-01-01T00:00:00.000Z')
    expect(database.completeWebhookDelivery(retry!.id, 'worker-2', { statusCode: 204, durationMs: 4 })).toMatchObject({ status: 'delivered', attempt: 2 })
    expect(database.listWebhookDeliveries(endpoint.id)[0]).toMatchObject({ status: 'delivered', attempts: 2 })
  })

  it('replays incremental sync updates and compacts them into one durable snapshot', () => {
    database = new WorkspaceDatabase(':memory:')
    const first = Buffer.from('first update').toString('base64')
    const second = Buffer.from('second update').toString('base64')
    const firstId = database.appendSyncUpdate('welcome', 'client-a', first)
    const secondId = database.appendSyncUpdate('welcome', 'client-b', second)

    const pending = database.loadSyncDocument('welcome')
    expect(pending.snapshot).toBeNull()
    expect(pending.updates).toEqual([
      { id: firstId, clientId: 'client-a', data: first },
      { id: secondId, clientId: 'client-b', data: second },
    ])

    const snapshot = Buffer.from('merged snapshot').toString('base64')
    database.compactSyncDocument('welcome', snapshot, secondId)
    expect(database.loadSyncDocument('welcome')).toEqual({
      snapshot,
      updates: [],
      latestUpdateId: secondId,
    })
  })

  it('keeps an auditable lifecycle for AI-proposed page writes', () => {
    database = new WorkspaceDatabase(':memory:')
    database.createAIPatchAudit('patch-1', 'welcome', 'insert-paragraphs', '建议写入内容')
    expect(database.loadAIPatchAudit('welcome')[0]?.status).toBe('proposed')
    database.updateAIPatchAudit('patch-1', 'applied')
    expect(database.loadAIPatchAudit('welcome')[0]).toMatchObject({ id: 'patch-1', operation: 'insert-paragraphs', preview: '建议写入内容', status: 'applied' })
  })

  it('persists page roles and anchored comment resolution', () => {
    database = new WorkspaceDatabase(':memory:')
    database.upsertPagePermission('welcome', 'member-1', 'Ming', 'commenter')
    expect(database.loadPagePermissions('welcome')).toContainEqual({ subjectId: 'member-1', displayName: 'Ming', role: 'commenter' })
    database.createComment({ id: 'comment-1', pageId: 'welcome', authorId: 'author-1', authorName: 'Lin', body: '@Ming 请确认这里', anchor: { from: 2, to: 6, quote: '关键内容' }, mentions: ['member-1'] })
    expect(database.loadComments('welcome')[0]).toMatchObject({ id: 'comment-1', anchor: { from: 2, to: 6, quote: '关键内容' }, resolvedAt: null })
    const notification = database.loadNotifications('member-1')[0]
    expect(notification).toMatchObject({ readAt: null, pageTitle: '从这里开始', body: '@Ming 请确认这里' })
    database.markNotificationRead(notification!.id, 'member-1')
    expect(database.loadNotifications('member-1')[0]?.readAt).not.toBeNull()
    database.resolveComment('comment-1')
    expect(database.loadComments('welcome')[0]?.resolvedAt).not.toBeNull()
    database.removePagePermission('welcome', 'member-1')
    expect(database.loadPagePermissions('welcome')).not.toContainEqual(expect.objectContaining({ subjectId: 'member-1' }))
  })
})
