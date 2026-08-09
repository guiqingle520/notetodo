/** Renderer 可访问的数据库桥接 API；实现仅存在于隔离的 preload 中。 */
interface NoteTodoDatabaseApi {
  loadByPage: (pageId: string) => Promise<import('@notetodo/database-core').DatabaseSnapshot | null>
  create: (
    pageId: string,
    databaseId: string,
    name: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  addProperty: (
    databaseId: string,
    propertyId: string,
    name: string,
    type: import('@notetodo/database-core').PropertyType,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  listSources: () => Promise<
    Array<{ id: string; pageId: string; name: string; pageTitle: string; recordCount: number }>
  >
  updatePropertyConfig: (
    databaseId: string,
    propertyId: string,
    config: Partial<
      Pick<
        import('@notetodo/database-core').DatabaseProperty,
        'options' | 'relation' | 'rollup' | 'formula' | 'constraints'
      >
    >,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  rename: (
    databaseId: string,
    name: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  reorderProperties: (
    databaseId: string,
    propertyIds: string[],
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  renameProperty: (
    databaseId: string,
    propertyId: string,
    name: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  deleteProperty: (
    databaseId: string,
    propertyId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  updateCell: (
    recordId: string,
    propertyId: string,
    value: import('@notetodo/database-core').PropertyValue,
  ) => Promise<{ automationRuns: string[] }>
  createRecord: (databaseId: string, recordId: string) => Promise<void>
  duplicateRecord: (
    databaseId: string,
    sourceRecordId: string,
    recordId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  trashRecords: (
    databaseId: string,
    recordIds: string[],
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  listTrashedRecords: (
    databaseId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseTrashRecord[]>
  restoreRecords: (
    databaseId: string,
    recordIds: string[],
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  deleteRecordsPermanently: (databaseId: string, recordIds: string[]) => Promise<void>
  updateRecordContent: (recordId: string, content: string) => Promise<void>
  listRecordHistory: (
    recordId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseRecordHistory[]>
  restoreRecordHistory: (
    historyId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  listRecordComments: (
    recordId: string,
    unresolvedOnly?: boolean,
  ) => Promise<import('@notetodo/database-core').DatabaseRecordComment[]>
  createRecordComment: (comment: {
    id: string
    recordId: string
    propertyId: string | null
    authorName: string
    body: string
  }) => Promise<import('@notetodo/database-core').DatabaseRecordComment[]>
  resolveRecordComment: (id: string, resolved: boolean) => Promise<void>
  deleteRecordComment: (id: string) => Promise<void>
  listRecordReminders: (
    recordId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseRecordReminder[]>
  listDueRecordReminders: () => Promise<import('@notetodo/database-core').DatabaseRecordReminder[]>
  saveRecordReminder: (reminder: {
    id: string
    recordId: string
    propertyId: string
    dueAt: string
    note: string
  }) => Promise<import('@notetodo/database-core').DatabaseRecordReminder[]>
  completeRecordReminder: (id: string, completed: boolean) => Promise<void>
  deleteRecordReminder: (id: string) => Promise<void>
  setActiveView: (databaseId: string, viewId: string) => Promise<void>
  updateViewConfig: (
    databaseId: string,
    viewId: string,
    config: import('@notetodo/database-core').DatabaseViewConfig,
  ) => Promise<void>
  createView: (
    databaseId: string,
    viewId: string,
    name: string,
    type: import('@notetodo/database-core').DatabaseView['type'],
    config: import('@notetodo/database-core').DatabaseViewConfig,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  renameView: (
    databaseId: string,
    viewId: string,
    name: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  deleteView: (
    databaseId: string,
    viewId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  setDefaultView: (
    databaseId: string,
    viewId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  bulkUpdate: (
    databaseId: string,
    recordIds: string[],
    propertyId: string,
    value: import('@notetodo/database-core').PropertyValue,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  importRecords: (
    databaseId: string,
    records: Array<{
      id: string
      values: Record<string, import('@notetodo/database-core').PropertyValue>
    }>,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  saveTemplate: (
    databaseId: string,
    template: import('@notetodo/database-core').DatabaseTemplate,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  deleteTemplate: (
    databaseId: string,
    templateId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  createFromTemplate: (
    databaseId: string,
    templateId: string,
    recordId: string,
  ) => Promise<import('@notetodo/database-core').DatabaseSnapshot>
  exportCsv: (suggestedName: string, csv: string) => Promise<boolean>
}
