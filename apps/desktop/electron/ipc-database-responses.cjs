const {
  assertDatabaseProperty,
  assertFields,
  assertId,
  assertPropertyValue,
  assertPropertyValues,
  assertRequiredText,
  assertSafeCount,
  assertText,
  assertTimestamp,
  assertViewConfig,
  viewTypes,
} = require('./ipc-database-values.cjs')

const MAX_RECORD_COUNT = 50_000

function assertSnapshotOrNull(value) {
  if (value !== null) assertDatabaseSnapshot(value)
}

function assertDatabaseSnapshot(value) {
  assertFields(value, ['schema', 'records', 'views', 'activeViewId'], ['templates'], 'snapshot')
  assertFields(value.schema, ['id', 'name', 'properties'], [], 'schema')
  assertId(value.schema.id, 'schema id')
  assertRequiredText(value.schema.name, 200, 'schema name')
  if (
    !Array.isArray(value.schema.properties) ||
    value.schema.properties.length < 1 ||
    value.schema.properties.length > 100
  ) {
    throw new TypeError('Invalid database property collection.')
  }
  value.schema.properties.forEach(assertDatabaseProperty)
  assertUnique(value.schema.properties, 'property')

  if (!Array.isArray(value.records) || value.records.length > MAX_RECORD_COUNT) {
    throw new TypeError('Invalid database record collection.')
  }
  value.records.forEach(assertRecord)
  assertUnique(value.records, 'record')

  if (!Array.isArray(value.views) || value.views.length < 1 || value.views.length > 50) {
    throw new TypeError('Invalid database view collection.')
  }
  value.views.forEach((view) => assertView(view, value.schema.id))
  assertUnique(value.views, 'view')
  assertId(value.activeViewId, 'active view id')
  if (!value.views.some((view) => view.id === value.activeViewId)) {
    throw new TypeError('Database active view does not exist in the snapshot.')
  }

  if (value.templates !== undefined) {
    if (!Array.isArray(value.templates) || value.templates.length > 50) {
      throw new TypeError('Invalid database template collection.')
    }
    value.templates.forEach((template) => assertTemplate(template, value.schema.id))
    assertUnique(value.templates, 'template')
  }

  const propertyIds = new Set(value.schema.properties.map((property) => property.id))
  for (const record of value.records) {
    if (Object.keys(record.values).some((propertyId) => !propertyIds.has(propertyId))) {
      throw new TypeError('Database record contains an unknown property.')
    }
  }
}

function assertRecord(value) {
  assertFields(value, ['id', 'values', 'createdAt', 'updatedAt'], ['content'], 'record')
  assertId(value.id, 'record id')
  assertPropertyValues(value.values)
  if (value.content !== undefined) assertText(value.content, 2_000_000, 'record content')
  assertTimestamp(value.createdAt, 'record creation time')
  assertTimestamp(value.updatedAt, 'record update time')
}

function assertView(value, databaseId) {
  assertFields(value, ['id', 'databaseId', 'name', 'type', 'config'], [], 'view')
  assertId(value.id, 'view id')
  assertId(value.databaseId, 'view database id')
  if (value.databaseId !== databaseId)
    throw new TypeError('Database view belongs to another schema.')
  assertRequiredText(value.name, 200, 'view name')
  if (!viewTypes.has(value.type)) throw new TypeError('Invalid database view type.')
  assertViewConfig(value.config)
}

function assertTemplate(value, databaseId) {
  assertFields(
    value,
    ['id', 'databaseId', 'name', 'values', 'content', 'createdAt', 'updatedAt'],
    [],
    'template',
  )
  assertId(value.id, 'template id')
  assertId(value.databaseId, 'template database id')
  if (value.databaseId !== databaseId)
    throw new TypeError('Database template belongs to another schema.')
  assertRequiredText(value.name, 200, 'template name')
  assertPropertyValues(value.values)
  assertText(value.content, 2_000_000, 'template content')
  assertTimestamp(value.createdAt, 'template creation time')
  assertTimestamp(value.updatedAt, 'template update time')
}

function assertSourceList(value) {
  // A workspace may contain one database per page. Keep this aligned with the
  // workspace's 100k page ceiling until source pagination is introduced.
  if (!Array.isArray(value) || value.length > 100_000) {
    throw new TypeError('Invalid database source collection.')
  }
  value.forEach((source) => {
    assertFields(source, ['id', 'pageId', 'name', 'pageTitle', 'recordCount'], [], 'source')
    assertId(source.id, 'source id')
    assertId(source.pageId, 'source page id')
    assertRequiredText(source.name, 200, 'source name')
    // Untitled pages are valid workspace state, so the source label is bounded
    // but need not be non-empty like the database's own name.
    assertText(source.pageTitle, 1_000, 'source page title')
    assertSafeCount(source.recordCount, 100_000, 'source record count')
  })
  assertUnique(value, 'source')
}

function assertAutomationResult(value) {
  assertFields(value, ['automationRuns'], [], 'automation result')
  if (!Array.isArray(value.automationRuns) || value.automationRuns.length > 100) {
    throw new TypeError('Invalid database automation run collection.')
  }
  value.automationRuns.forEach((id) => assertId(id, 'automation run id'))
}

function assertTrashRecords(value) {
  assertBoundedList(value, 500, 'trash record', (record) => {
    assertFields(record, ['id', 'title', 'trashedAt'], [], 'trash record')
    assertId(record.id, 'trash record id')
    assertText(record.title, 1_000, 'trash record title')
    assertTimestamp(record.trashedAt, 'trash time')
  })
}

function assertRecordHistory(value) {
  assertBoundedList(value, 200, 'record history', (history) => {
    assertFields(
      history,
      ['id', 'recordId', 'propertyId', 'propertyName', 'kind', 'previous', 'next', 'createdAt'],
      [],
      'record history',
    )
    assertId(history.id, 'history id')
    assertId(history.recordId, 'history record id')
    if (history.propertyId !== null) assertId(history.propertyId, 'history property id')
    assertRequiredText(history.propertyName, 100, 'history property name')
    if (!['property', 'content'].includes(history.kind)) {
      throw new TypeError('Invalid database history kind.')
    }
    if (history.kind === 'content') {
      assertText(history.previous, 2_000_000, 'previous record content')
      assertText(history.next, 2_000_000, 'next record content')
    } else {
      assertPropertyValue(history.previous)
      assertPropertyValue(history.next)
    }
    assertTimestamp(history.createdAt, 'history creation time')
  })
}

function assertRecordComments(value) {
  assertBoundedList(value, 500, 'record comment', (comment) => {
    assertFields(
      comment,
      [
        'id',
        'recordId',
        'propertyId',
        'propertyName',
        'authorName',
        'body',
        'resolvedAt',
        'createdAt',
      ],
      [],
      'record comment',
    )
    assertId(comment.id, 'comment id')
    assertId(comment.recordId, 'comment record id')
    if (comment.propertyId !== null) assertId(comment.propertyId, 'comment property id')
    assertRequiredText(comment.propertyName, 100, 'comment property name')
    assertRequiredText(comment.authorName, 100, 'comment author name')
    // Comment bodies intentionally support line breaks. Names use the stricter
    // control-character rule, but prose only needs a bounded non-empty string.
    assertText(comment.body, 10_000, 'comment body')
    if (!comment.body.trim()) throw new TypeError('Invalid database comment body.')
    if (comment.resolvedAt !== null) assertTimestamp(comment.resolvedAt, 'comment resolution time')
    assertTimestamp(comment.createdAt, 'comment creation time')
  })
}

function assertRecordReminders(value) {
  assertBoundedList(value, 500, 'record reminder', (reminder) => {
    assertFields(
      reminder,
      [
        'id',
        'recordId',
        'propertyId',
        'propertyName',
        'dueAt',
        'note',
        'completedAt',
        'createdAt',
        'updatedAt',
        'overdue',
      ],
      [],
      'record reminder',
    )
    assertId(reminder.id, 'reminder id')
    assertId(reminder.recordId, 'reminder record id')
    assertId(reminder.propertyId, 'reminder property id')
    assertRequiredText(reminder.propertyName, 100, 'reminder property name')
    assertTimestamp(reminder.dueAt, 'reminder due time')
    assertText(reminder.note, 500, 'reminder note')
    if (reminder.completedAt !== null) {
      assertTimestamp(reminder.completedAt, 'reminder completion time')
    }
    assertTimestamp(reminder.createdAt, 'reminder creation time')
    assertTimestamp(reminder.updatedAt, 'reminder update time')
    if (typeof reminder.overdue !== 'boolean')
      throw new TypeError('Invalid database overdue state.')
  })
}

function assertBooleanResponse(value) {
  if (typeof value !== 'boolean') throw new TypeError('Invalid database boolean response.')
}

function assertBoundedList(value, maximum, label, validator) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`Invalid database ${label} collection.`)
  }
  value.forEach(validator)
}

function assertUnique(value, label) {
  if (new Set(value.map((item) => item.id)).size !== value.length) {
    throw new TypeError(`Database ${label} ids must be unique.`)
  }
}

module.exports = {
  assertAutomationResult,
  assertBooleanResponse,
  assertDatabaseSnapshot,
  assertRecordComments,
  assertRecordHistory,
  assertRecordReminders,
  assertSnapshotOrNull,
  assertSourceList,
  assertTemplate,
  assertTrashRecords,
}
