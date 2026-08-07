import type { DatabaseRecord, DatabaseSnapshot, DatabaseViewConfig, PropertyValue } from '@notetodo/database-core'

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

  async loadByPage(pageId: string) {
    if (window.notetodo?.database) return window.notetodo.database.loadByPage(pageId)
    if (pageId !== 'projects') return null
    const saved = localStorage.getItem(this.key)
    if (!saved) return structuredClone(seedSnapshot)
    const upgraded = upgradeBrowserSnapshot(JSON.parse(saved) as DatabaseSnapshot)
    this.write(upgraded)
    return upgraded
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

  async setActiveView(snapshot: DatabaseSnapshot, viewId: string) {
    if (window.notetodo?.database) return window.notetodo.database.setActiveView(snapshot.schema.id, viewId)
    this.write({ ...snapshot, activeViewId: viewId })
  }

  async updateViewConfig(snapshot: DatabaseSnapshot, viewId: string, config: DatabaseViewConfig) {
    if (window.notetodo?.database) return window.notetodo.database.updateViewConfig(snapshot.schema.id, viewId, config)
    this.write(snapshot)
  }

  private write(snapshot: DatabaseSnapshot) {
    localStorage.setItem(this.key, JSON.stringify(snapshot))
  }
}

/** Keeps long-lived browser previews compatible with newly shipped view types. */
function upgradeBrowserSnapshot(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  const properties = [...snapshot.schema.properties]
  for (const property of seedSnapshot.schema.properties) if (!properties.some((candidate) => candidate.id === property.id)) properties.push(structuredClone(property))
  const views = [...snapshot.views]
  for (const view of seedSnapshot.views) if (!views.some((candidate) => candidate.id === view.id)) views.push(structuredClone(view))
  const seedRecords = new Map(seedSnapshot.records.map((record) => [record.id, record]))
  const records = snapshot.records.map((record) => ({ ...record, values: { ...(seedRecords.get(record.id)?.values ?? {}), ...record.values } }))
  return { ...snapshot, schema: { ...snapshot.schema, properties }, views, records, activeViewId: views.some((view) => view.id === snapshot.activeViewId) ? snapshot.activeViewId : views[0]?.id ?? '' }
}

export const databaseRepository = new DatabaseRepository()
