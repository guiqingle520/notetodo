import type { DatabaseRecord, DatabaseSnapshot, PropertyValue } from '@notetodo/database-core'

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
    ],
  },
  records: [
    record('task-1', ['编辑器交互收尾', 'doing', 'Lin', '2026-08-08', 3]),
    record('task-2', ['SQLite 数据迁移', 'done', 'Ming', '2026-08-06', 2]),
    record('task-3', ['数据库 Table View', 'doing', 'Lin', '2026-08-10', 3]),
    record('task-4', ['模型网关设置页', 'todo', 'Kai', '2026-08-12', 2]),
    record('task-5', ['桌面安装包签名', 'todo', 'Ming', '2026-08-16', 1]),
  ],
  views: [
    { id: 'roadmap-table', databaseId: 'roadmap-db', name: '所有任务', type: 'table', config: {} },
    { id: 'roadmap-board', databaseId: 'roadmap-db', name: '状态看板', type: 'board', config: { groupByPropertyId: 'task-status' } },
    { id: 'roadmap-list', databaseId: 'roadmap-db', name: '紧凑列表', type: 'list', config: {} },
  ],
  activeViewId: 'roadmap-table',
}

function record(id: string, values: [string, string, string, string, number]): DatabaseRecord {
  return { id, values: Object.fromEntries(['task-title', 'task-status', 'task-owner', 'task-due', 'task-score'].map((key, index) => [key, values[index]])), createdAt: now, updatedAt: now }
}

class DatabaseRepository {
  private readonly key = 'notetodo-browser-database-v1'

  async loadByPage(pageId: string) {
    if (window.notetodo?.database) return window.notetodo.database.loadByPage(pageId)
    if (pageId !== 'projects') return null
    const saved = localStorage.getItem(this.key)
    return saved ? JSON.parse(saved) as DatabaseSnapshot : structuredClone(seedSnapshot)
  }

  async updateCell(snapshot: DatabaseSnapshot, recordId: string, propertyId: string, value: PropertyValue) {
    if (window.notetodo?.database) return window.notetodo.database.updateCell(recordId, propertyId, value)
    this.write(snapshot)
  }

  async createRecord(snapshot: DatabaseSnapshot, recordId: string) {
    if (window.notetodo?.database) return window.notetodo.database.createRecord(snapshot.schema.id, recordId)
    this.write(snapshot)
  }

  async setActiveView(snapshot: DatabaseSnapshot, viewId: string) {
    if (window.notetodo?.database) return window.notetodo.database.setActiveView(snapshot.schema.id, viewId)
    this.write({ ...snapshot, activeViewId: viewId })
  }

  private write(snapshot: DatabaseSnapshot) {
    localStorage.setItem(this.key, JSON.stringify(snapshot))
  }
}

export const databaseRepository = new DatabaseRepository()

