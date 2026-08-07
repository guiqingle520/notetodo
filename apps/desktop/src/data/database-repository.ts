import type { DatabaseRecord, DatabaseSnapshot, DatabaseTemplate, DatabaseView, DatabaseViewConfig, PropertyType, PropertyValue } from '@notetodo/database-core'

const now = new Date().toISOString()
const seedSnapshot: DatabaseSnapshot = {
  schema: {
    id: 'roadmap-db',
    name: '产品路线',
    properties: [
      { id: 'task-title', name: '任务', type: 'title' },
      { id: 'task-status', name: '状态', type: 'select', options: [
        { id: 'todo', name: '待开始', color: 'slate' },
        { id: 'doing', name: '进行中', color: 'amber' },
        { id: 'done', name: '已完成', color: 'green' },
      ] },
      { id: 'task-owner', name: '负责人', type: 'text' },
      { id: 'task-due', name: '截止日期', type: 'date' },
      { id: 'task-score', name: '优先级', type: 'number' },
      { id: 'task-dependencies', name: '依赖任务', type: 'relation', relation: { databaseId: 'roadmap-db' } },
      { id: 'task-dependency-score', name: '依赖总优先级', type: 'rollup', rollup: { relationPropertyId: 'task-dependencies', targetPropertyId: 'task-score', aggregation: 'sum' } },
      { id: 'task-risk', name: '风险标签', type: 'formula', formula: { expression: 'if([task-dependency-score] >= 3, "需关注", "正常")' } },
      { id: 'task-start', name: '开始日期', type: 'date' },
      { id: 'task-cover', name: '卡片封面', type: 'url' },
    ],
  },
  records: [
    record('task-1', ['编辑器交互收尾', 'doing', 'Lin', '2026-08-08', 3, ['task-2'], '2026-08-03']),
    record('task-2', ['SQLite 数据迁移', 'done', 'Ming', '2026-08-06', 2, [], '2026-07-29']),
    record('task-3', ['数据库 Table View', 'doing', 'Lin', '2026-08-10', 3, ['task-1', 'task-2'], '2026-08-05']),
    record('task-4', ['模型网关设置页', 'todo', 'Kai', '2026-08-12', 2, ['task-2'], '2026-08-07']),
    record('task-5', ['桌面安装包签名', 'todo', 'Ming', '2026-08-16', 1, ['task-3', 'task-4'], '2026-08-10']),
  ],
  views: [
    { id: 'roadmap-table', databaseId: 'roadmap-db', name: '所有任务', type: 'table', config: {} },
    { id: 'roadmap-board', databaseId: 'roadmap-db', name: '状态看板', type: 'board', config: { groupByPropertyId: 'task-status' } },
    { id: 'roadmap-list', databaseId: 'roadmap-db', name: '紧凑列表', type: 'list', config: {} },
    { id: 'roadmap-calendar', databaseId: 'roadmap-db', name: '交付日历', type: 'calendar', config: { datePropertyId: 'task-due' } },
    { id: 'roadmap-timeline', databaseId: 'roadmap-db', name: '项目时间轴', type: 'timeline', config: { startDatePropertyId: 'task-start', endDatePropertyId: 'task-due' } },
    { id: 'roadmap-gallery', databaseId: 'roadmap-db', name: '项目画廊', type: 'gallery', config: { coverPropertyId: 'task-cover', visiblePropertyIds: ['task-status', 'task-owner', 'task-due'], cardSize: 'medium' } },
  ],
  activeViewId: 'roadmap-table',
}

function record(id: string, values: [string, string, string, string, number, string[], string]): DatabaseRecord {
  return { id, values: Object.fromEntries(['task-title', 'task-status', 'task-owner', 'task-due', 'task-score', 'task-dependencies', 'task-start'].map((key, index) => [key, values[index]])), createdAt: now, updatedAt: now }
}

class DatabaseRepository {
  private readonly key = 'notetodo-browser-database-v1'
  private readonly collectionKey = 'notetodo-browser-databases-v2'
  private readonly pageByDatabase = new Map<string, string>()

  async loadByPage(pageId: string) {
    if (window.notetodo?.database) return window.notetodo.database.loadByPage(pageId)
    const collections = this.readCollections()
    if (collections[pageId]) {
      this.pageByDatabase.set(collections[pageId]!.schema.id, pageId)
      return structuredClone(collections[pageId]!)
    }
    if (pageId !== 'projects') return null
    const saved = localStorage.getItem(this.key)
    const upgraded = saved ? upgradeBrowserSnapshot(JSON.parse(saved) as DatabaseSnapshot) : structuredClone(seedSnapshot)
    this.pageByDatabase.set(upgraded.schema.id, pageId)
    this.write(upgraded, pageId)
    return upgraded
  }

  async createOnPage(pageId: string, name: string) {
    const databaseId = crypto.randomUUID()
    if (window.notetodo?.database) return window.notetodo.database.create(pageId, databaseId, name)
    const snapshot = createBrowserDatabase(databaseId, name)
    this.pageByDatabase.set(databaseId, pageId)
    this.write(snapshot, pageId)
    return structuredClone(snapshot)
  }

  async addProperty(snapshot: DatabaseSnapshot, name: string, type: Exclude<PropertyType, 'title' | 'relation' | 'rollup' | 'formula'>) {
    const propertyId = crypto.randomUUID()
    if (window.notetodo?.database) return window.notetodo.database.addProperty(snapshot.schema.id, propertyId, name, type)
    const property = { id: propertyId, name, type, ...(['select', 'multiSelect'].includes(type) ? { options: [
      { id: 'option-1', name: '选项 1', color: 'slate' as const }, { id: 'option-2', name: '选项 2', color: 'amber' as const },
    ] } : {}) }
    const next = { ...snapshot, schema: { ...snapshot.schema, properties: [...snapshot.schema.properties, property] } }
    this.write(next); return structuredClone(next)
  }

  async renameProperty(snapshot: DatabaseSnapshot, propertyId: string, name: string) {
    if (window.notetodo?.database) return window.notetodo.database.renameProperty(snapshot.schema.id, propertyId, name)
    const next = { ...snapshot, schema: { ...snapshot.schema, properties: snapshot.schema.properties.map((property) => property.id === propertyId ? { ...property, name } : property) } }
    this.write(next); return structuredClone(next)
  }

  async deleteProperty(snapshot: DatabaseSnapshot, propertyId: string) {
    const property = snapshot.schema.properties.find((candidate) => candidate.id === propertyId)
    if (!property || property.type === 'title') throw new Error('标题属性不能删除。')
    if (window.notetodo?.database) return window.notetodo.database.deleteProperty(snapshot.schema.id, propertyId)
    const records = snapshot.records.map((record) => { const values = { ...record.values }; delete values[propertyId]; return { ...record, values } })
    const next = { ...snapshot, schema: { ...snapshot.schema, properties: snapshot.schema.properties.filter((candidate) => candidate.id !== propertyId) }, records }
    this.write(next); return structuredClone(next)
  }

  async updateCell(snapshot: DatabaseSnapshot, recordId: string, propertyId: string, value: PropertyValue) {
    if (window.notetodo?.database) return window.notetodo.database.updateCell(recordId, propertyId, value)
    this.write(snapshot)
    return undefined
  }

  async createRecord(snapshot: DatabaseSnapshot, recordId: string) {
    if (window.notetodo?.database) return window.notetodo.database.createRecord(snapshot.schema.id, recordId)
    this.write(snapshot)
  }

  async updateRecordContent(snapshot: DatabaseSnapshot, recordId: string, content: string) {
    if (window.notetodo?.database) return window.notetodo.database.updateRecordContent(recordId, content)
    this.write(snapshot)
  }

  async setActiveView(snapshot: DatabaseSnapshot, viewId: string) {
    if (window.notetodo?.database) return window.notetodo.database.setActiveView(snapshot.schema.id, viewId)
    this.write({ ...snapshot, activeViewId: viewId })
  }

  async updateViewConfig(snapshot: DatabaseSnapshot, viewId: string, config: DatabaseViewConfig) {
    if (window.notetodo?.database) return window.notetodo.database.updateViewConfig(snapshot.schema.id, viewId, config)
    this.write(snapshot)
  }

  async createView(snapshot: DatabaseSnapshot, view: DatabaseView) {
    if (window.notetodo?.database) return window.notetodo.database.createView(snapshot.schema.id, view.id, view.name, view.type, view.config)
    if (snapshot.views.length >= 50) throw new Error('一个数据库最多包含 50 个视图。')
    const next = { ...snapshot, views: [...snapshot.views, view], activeViewId: view.id }
    this.write(next); return structuredClone(next)
  }

  async renameView(snapshot: DatabaseSnapshot, viewId: string, name: string) {
    if (window.notetodo?.database) return window.notetodo.database.renameView(snapshot.schema.id, viewId, name)
    const next = { ...snapshot, views: snapshot.views.map((view) => view.id === viewId ? { ...view, name } : view) }
    this.write(next); return structuredClone(next)
  }

  async deleteView(snapshot: DatabaseSnapshot, viewId: string) {
    if (snapshot.views.length <= 1) throw new Error('至少需要保留一个视图。')
    if (window.notetodo?.database) return window.notetodo.database.deleteView(snapshot.schema.id, viewId)
    const views = snapshot.views.filter((view) => view.id !== viewId)
    const next = { ...snapshot, views, activeViewId: snapshot.activeViewId === viewId ? views[0]!.id : snapshot.activeViewId }
    this.write(next); return structuredClone(next)
  }

  async setDefaultView(snapshot: DatabaseSnapshot, viewId: string) {
    if (window.notetodo?.database) return window.notetodo.database.setDefaultView(snapshot.schema.id, viewId)
    const selected = snapshot.views.find((view) => view.id === viewId)
    if (!selected) throw new Error('视图不存在。')
    const next = { ...snapshot, views: [selected, ...snapshot.views.filter((view) => view.id !== viewId)] }
    this.write(next); return structuredClone(next)
  }

  async bulkUpdate(snapshot: DatabaseSnapshot, recordIds: string[], propertyId: string, value: PropertyValue) {
    if (window.notetodo?.database) return window.notetodo.database.bulkUpdate(snapshot.schema.id, recordIds, propertyId, value)
    const selected = new Set(recordIds)
    const now = new Date().toISOString()
    const next = { ...snapshot, records: snapshot.records.map((record) => selected.has(record.id) ? { ...record, values: { ...record.values, [propertyId]: value }, updatedAt: now } : record) }
    this.write(next); return structuredClone(next)
  }

  async importRecords(snapshot: DatabaseSnapshot, records: DatabaseRecord[]) {
    if (window.notetodo?.database) return window.notetodo.database.importRecords(snapshot.schema.id, records.map(({ id, values }) => ({ id, values })))
    const next = { ...snapshot, records: [...snapshot.records, ...records] }
    this.write(next); return structuredClone(next)
  }

  async saveTemplate(snapshot: DatabaseSnapshot, template: DatabaseTemplate) {
    if (window.notetodo?.database) return window.notetodo.database.saveTemplate(snapshot.schema.id, template)
    const templates = [...(snapshot.templates ?? []).filter((candidate) => candidate.id !== template.id), template]
    const next = { ...snapshot, templates }
    this.write(next); return structuredClone(next)
  }

  async deleteTemplate(snapshot: DatabaseSnapshot, templateId: string) {
    if (window.notetodo?.database) return window.notetodo.database.deleteTemplate(snapshot.schema.id, templateId)
    const next = { ...snapshot, templates: (snapshot.templates ?? []).filter((template) => template.id !== templateId) }
    this.write(next); return structuredClone(next)
  }

  async createFromTemplate(snapshot: DatabaseSnapshot, templateId: string, recordId: string) {
    if (window.notetodo?.database) return window.notetodo.database.createFromTemplate(snapshot.schema.id, templateId, recordId)
    const template = snapshot.templates?.find((candidate) => candidate.id === templateId)
    if (!template) throw new Error('模板不存在。')
    const now = new Date().toISOString()
    const record: DatabaseRecord = { id: recordId, values: structuredClone(template.values), content: template.content, createdAt: now, updatedAt: now }
    const next = { ...snapshot, records: [...snapshot.records, record] }
    this.write(next); return structuredClone(next)
  }

  async exportCsv(name: string, csv: string) {
    if (window.notetodo?.database) return window.notetodo.database.exportCsv(name, csv)
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[<>:"/\\|?*]/gu, '_') || 'database'}.csv`; link.click()
    URL.revokeObjectURL(url)
    return true
  }

  private write(snapshot: DatabaseSnapshot, explicitPageId?: string) {
    const pageId = explicitPageId ?? this.pageByDatabase.get(snapshot.schema.id) ?? (snapshot.schema.id === 'roadmap-db' ? 'projects' : undefined)
    if (!pageId) throw new Error('Database is not attached to a page.')
    const collections = this.readCollections()
    collections[pageId] = snapshot
    localStorage.setItem(this.collectionKey, JSON.stringify(collections))
    if (pageId === 'projects') localStorage.setItem(this.key, JSON.stringify(snapshot))
  }

  private readCollections() {
    try { return JSON.parse(localStorage.getItem(this.collectionKey) ?? '{}') as Record<string, DatabaseSnapshot> }
    catch { return {} as Record<string, DatabaseSnapshot> }
  }
}

function createBrowserDatabase(databaseId: string, name: string): DatabaseSnapshot {
  const titleId = `${databaseId}-title`; const statusId = `${databaseId}-status`; const dateId = `${databaseId}-date`
  const viewId = `${databaseId}-table`
  return {
    schema: { id: databaseId, name, properties: [
      { id: titleId, name: '名称', type: 'title' },
      { id: statusId, name: '状态', type: 'select', options: [
        { id: 'todo', name: '待开始', color: 'slate' }, { id: 'doing', name: '进行中', color: 'amber' }, { id: 'done', name: '已完成', color: 'green' },
      ] },
      { id: dateId, name: '日期', type: 'date' },
    ] },
    records: [],
    views: [{ id: viewId, databaseId, name: '默认表格', type: 'table', config: {} }],
    activeViewId: viewId,
  }
}

/** Keeps long-lived browser previews compatible with newly shipped view types. */
function upgradeBrowserSnapshot(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  const properties = [...snapshot.schema.properties]
  for (const property of seedSnapshot.schema.properties) if (!properties.some((candidate) => candidate.id === property.id)) properties.push(structuredClone(property))
  const views = [...snapshot.views]
  for (const view of seedSnapshot.views) if (!views.some((candidate) => candidate.id === view.id)) views.push(structuredClone(view))
  const seedRecords = new Map(seedSnapshot.records.map((record) => [record.id, record]))
  const records = snapshot.records.map((record) => ({ ...record, content: record.content ?? '', values: { ...(seedRecords.get(record.id)?.values ?? {}), ...record.values } }))
  return { ...snapshot, schema: { ...snapshot.schema, properties }, views, records, activeViewId: views.some((view) => view.id === snapshot.activeViewId) ? snapshot.activeViewId : views[0]?.id ?? '' }
}

export const databaseRepository = new DatabaseRepository()
