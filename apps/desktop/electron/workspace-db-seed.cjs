const seedWorkspace = require('../shared/seed-workspace.json')

module.exports = {
  seedIfEmpty() {
    const count = this.statements.pageCount.get().count
    if (count > 0) return
  
    const insert = this.statements.insertPage
  
    // A single transaction avoids exposing a half-created starter workspace.
    this.workspaceRepository.transaction(() => {
      for (const page of seedWorkspace.pages) {
        insert.run(
          page.id,
          page.title,
          page.icon,
          page.parentId,
          page.favorite ? 1 : 0,
          page.content,
          page.updatedAt,
          page.lastVisitedAt,
          page.archivedAt,
        )
      }
      this.statements.insertWorkspaceState.run(seedWorkspace.activePageId)
    })
  },

  seedDatabaseIfEmpty() {
    const count = this.statements.databaseCount.get().count
    if (count > 0) return
  
    const now = new Date().toISOString()
    const properties = [
      ['task-title', '任务', 'title', 0, '{}'],
      ['task-status', '状态', 'select', 1, JSON.stringify({ options: [
        { id: 'todo', name: '待开始', color: 'slate' },
        { id: 'doing', name: '进行中', color: 'amber' },
        { id: 'done', name: '已完成', color: 'green' },
      ] })],
      ['task-owner', '负责人', 'text', 2, '{}'],
      ['task-due', '截止日期', 'date', 3, '{}'],
      ['task-score', '优先级', 'number', 4, '{}'],
      ['task-dependencies', '依赖任务', 'relation', 5, JSON.stringify({ relation: { databaseId: 'roadmap-db' } })],
      ['task-dependency-score', '依赖总优先级', 'rollup', 6, JSON.stringify({ rollup: { relationPropertyId: 'task-dependencies', targetPropertyId: 'task-score', aggregation: 'sum' } })],
      ['task-risk', '风险标签', 'formula', 7, JSON.stringify({ formula: { expression: 'if([task-dependency-score] >= 3, "需关注", "正常")' } })],
      ['task-start', '开始日期', 'date', 8, '{}'],
      ['task-cover', '卡片封面', 'url', 9, '{}'],
    ]
    const records = [
      ['task-1', 0, ['编辑器交互收尾', 'doing', 'Lin', '2026-08-08', 3, ['task-2'], null, null, '2026-08-03']],
      ['task-2', 1, ['SQLite 数据迁移', 'done', 'Ming', '2026-08-06', 2, [], null, null, '2026-07-29']],
      ['task-3', 2, ['数据库 Table View', 'doing', 'Lin', '2026-08-10', 3, ['task-1', 'task-2'], null, null, '2026-08-05']],
      ['task-4', 3, ['模型网关设置页', 'todo', 'Kai', '2026-08-12', 2, ['task-2'], null, null, '2026-08-07']],
      ['task-5', 4, ['桌面安装包签名', 'todo', 'Ming', '2026-08-16', 1, ['task-3', 'task-4'], null, null, '2026-08-10']],
    ]
  
    this.workspaceRepository.transaction(() => {
      this.statements.insertDatabase.run('roadmap-db', 'projects', '产品路线', 'roadmap-table')
      const insertProperty = this.statements.insertProperty
      for (const property of properties) insertProperty.run(property[0], 'roadmap-db', property[1], property[2], property[3], property[4])
  
      const insertRecord = this.statements.insertRecord
      const insertValue = this.statements.insertValue
      for (const [recordId, position, values] of records) {
        insertRecord.run(recordId, 'roadmap-db', position, now, now)
        properties.forEach((property, index) => {
          const value = values[index]
          insertValue.run(recordId, property[0], typeof value === 'string' ? value : null, typeof value === 'number' ? value : null, null, Array.isArray(value) ? JSON.stringify(value) : null, now)
        })
      }
  
      const insertView = this.statements.insertView
      insertView.run('roadmap-table', 'roadmap-db', '所有任务', 'table', 0, '{}')
      insertView.run('roadmap-board', 'roadmap-db', '状态看板', 'board', 1, JSON.stringify({ groupByPropertyId: 'task-status' }))
      insertView.run('roadmap-list', 'roadmap-db', '紧凑列表', 'list', 2, '{}')
      insertView.run('roadmap-calendar', 'roadmap-db', '交付日历', 'calendar', 3, JSON.stringify({ datePropertyId: 'task-due' }))
      insertView.run('roadmap-timeline', 'roadmap-db', '项目时间轴', 'timeline', 4, JSON.stringify({ startDatePropertyId: 'task-start', endDatePropertyId: 'task-due' }))
      insertView.run('roadmap-gallery', 'roadmap-db', '项目画廊', 'gallery', 5, JSON.stringify({ coverPropertyId: 'task-cover', visiblePropertyIds: ['task-status', 'task-owner', 'task-due'], cardSize: 'medium' }))
    })
  },

  /**
   * Data-only backfill for workspaces created before relation/rollup/formula
   * support. INSERT OR IGNORE makes this safe to run on every application boot
   * without overwriting user-edited values or property configuration.
   */
  ensureAdvancedDatabaseSeed() {
    const roadmap = this.statements.roadmapDatabase.get('roadmap-db')
    if (!roadmap) return
  
    const properties = [
      ['task-dependencies', '依赖任务', 'relation', 5, JSON.stringify({ relation: { databaseId: 'roadmap-db' } })],
      ['task-dependency-score', '依赖总优先级', 'rollup', 6, JSON.stringify({ rollup: { relationPropertyId: 'task-dependencies', targetPropertyId: 'task-score', aggregation: 'sum' } })],
      ['task-risk', '风险标签', 'formula', 7, JSON.stringify({ formula: { expression: 'if([task-dependency-score] >= 3, "需关注", "正常")' } })],
      ['task-start', '开始日期', 'date', 8, '{}'],
      ['task-cover', '卡片封面', 'url', 9, '{}'],
    ]
    const insertProperty = this.statements.insertAdvancedProperty
    this.workspaceRepository.transaction(() => {
      for (const property of properties) insertProperty.run(...property)
      const relationProperty = this.statements.insertRelationValue
      const now = new Date().toISOString()
      for (const [recordId, relatedIds] of [
        ['task-1', ['task-2']], ['task-2', []], ['task-3', ['task-1', 'task-2']],
        ['task-4', ['task-2']], ['task-5', ['task-3', 'task-4']],
      ]) relationProperty.run(recordId, JSON.stringify(relatedIds), now)
      const startDateProperty = this.statements.insertStartDateValue
      for (const [recordId, startDate] of [
        ['task-1', '2026-08-03'], ['task-2', '2026-07-29'], ['task-3', '2026-08-05'],
        ['task-4', '2026-08-07'], ['task-5', '2026-08-10'],
      ]) startDateProperty.run(recordId, startDate, now)
      // Data-only view backfill: the existing table already persists arbitrary
      // view types and JSON configuration, so no structural migration is needed.
      this.statements.insertCalendarView.run(JSON.stringify({ datePropertyId: 'task-due' }))
      this.statements.insertTimelineView.run(JSON.stringify({ startDatePropertyId: 'task-start', endDatePropertyId: 'task-due' }))
      this.statements.insertGalleryView.run(JSON.stringify({ coverPropertyId: 'task-cover', visiblePropertyIds: ['task-status', 'task-owner', 'task-due'], cardSize: 'medium' }))
      this.statements.insertDefaultAutomation.run(JSON.stringify({ propertyId: 'task-status', operator: 'equals', value: 'done' }), JSON.stringify([{ type: 'setProperty', propertyId: 'task-score', value: 1 }]), now, now)
    })
  }
}
