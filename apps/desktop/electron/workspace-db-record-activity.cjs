const { randomUUID } = require('node:crypto')

module.exports = {
  appendDatabaseRecordHistory(recordId, propertyId, kind, previous, next, now) {
    if (JSON.stringify(previous) === JSON.stringify(next)) return
    this.recordRepository.insertRecordHistory.run(
      randomUUID(),
      recordId,
      propertyId,
      kind,
      JSON.stringify(previous),
      JSON.stringify(next),
      now,
    )
    this.recordRepository.trimRecordHistory.run(recordId, recordId)
  },

  listDatabaseRecordHistory(recordId, limit = 100) {
    // History may contain two full document revisions per row. Bound the
    // materialized payload as well as the row count so IPC serialization does
    // not grow to hundreds of megabytes for one record.
    const maximumPayloadBytes = 20_000_000
    return this.recordRepository.recordHistory
      .all(recordId, maximumPayloadBytes, Math.max(1, Math.min(200, Math.trunc(limit))))
      .map((row) => {
        const result = {
          ...row,
          previous: JSON.parse(row.previousJson),
          next: JSON.parse(row.nextJson),
        }
        delete result.previousJson
        delete result.nextJson
        return result
      })
  },

  restoreDatabaseRecordHistory(historyId) {
    const history = this.recordRepository.recordHistoryById.get(historyId)
    if (!history) throw new Error('Database record history does not exist.')
    const previous = JSON.parse(history.previous_json)
    if (history.kind === 'content') this.updateDatabaseRecordContent(history.record_id, previous)
    else this.updateDatabaseCell(history.record_id, history.property_id, previous)
    const databaseId = this.recordRepository.recordDatabaseId.get(history.record_id)?.database_id
    return this.loadDatabaseById(databaseId)
  },

  listDatabaseRecordComments(recordId, unresolvedOnly = false) {
    return this.recordRepository.recordComments.all(recordId, unresolvedOnly ? 1 : 0)
  },

  createDatabaseRecordComment(comment) {
    const body = String(comment.body ?? '').trim()
    const authorName = String(comment.authorName ?? '').trim()
    if (!body || body.length > 10_000 || !authorName || authorName.length > 100) {
      throw new TypeError('Record comment is invalid.')
    }
    const record = this.recordRepository.activeRecordDatabase.get(comment.recordId)
    if (!record) throw new Error('Database record does not exist.')
    if (
      comment.propertyId &&
      !this.recordRepository.propertyExists.get(comment.propertyId, record.database_id)
    ) {
      throw new Error('Comment property does not exist.')
    }
    this.recordRepository.transaction(() => {
      if (this.recordRepository.commentCount.get(comment.recordId).count >= 500) {
        throw new Error('A database record cannot contain more than 500 comments.')
      }
      this.recordRepository.insertRecordComment.run(
        comment.id,
        comment.recordId,
        comment.propertyId || null,
        authorName,
        body,
        new Date().toISOString(),
      )
    })
    return this.listDatabaseRecordComments(comment.recordId)
  },

  resolveDatabaseRecordComment(id, resolved) {
    const result = this.recordRepository.resolveRecordComment.run(
      resolved ? new Date().toISOString() : null,
      id,
    )
    if (result.changes !== 1) throw new Error('Database record comment does not exist.')
  },

  deleteDatabaseRecordComment(id) {
    if (this.recordRepository.deleteRecordComment.run(id).changes !== 1) {
      throw new Error('Database record comment does not exist.')
    }
  },

  listDatabaseRecordReminders(recordId) {
    const now = new Date().toISOString()
    return this.recordRepository.recordReminders
      .all(recordId)
      .map((reminder) => ({
        ...reminder,
        overdue: !reminder.completedAt && reminder.dueAt <= now,
      }))
  },

  listDueDatabaseRecordReminders(limit = 100) {
    const now = new Date().toISOString()
    return this.recordRepository.dueRecordReminders
      .all(now, Math.max(1, Math.min(500, Math.trunc(limit))))
      .map((reminder) => ({ ...reminder, overdue: true }))
  },

  saveDatabaseRecordReminder(reminder) {
    const dueAt = new Date(reminder.dueAt)
    if (Number.isNaN(dueAt.getTime()) || String(reminder.note ?? '').length > 500) {
      throw new TypeError('Record reminder is invalid.')
    }
    const property = this.recordRepository.reminderDateProperty.get(
      reminder.recordId,
      reminder.propertyId,
    )
    if (!property || property.type !== 'date') {
      throw new Error('Reminder property must be a date property on this record.')
    }
    const now = new Date().toISOString()
    this.recordRepository.transaction(() => {
      const owner = this.recordRepository.reminderOwner.get(reminder.id)
      // An id is immutable to its record; otherwise an upsert can silently
      // mutate another record's reminder.
      if (owner && owner.recordId !== reminder.recordId) {
        throw new Error('Record reminder belongs to another record.')
      }
      if (
        !owner &&
        this.recordRepository.reminderCount.get(reminder.recordId).count >= 500
      ) {
        throw new Error('A database record cannot contain more than 500 reminders.')
      }
      this.recordRepository.upsertRecordReminder.run(
        reminder.id,
        reminder.recordId,
        reminder.propertyId,
        dueAt.toISOString(),
        String(reminder.note ?? '').trim(),
        now,
        now,
      )
    })
    return this.listDatabaseRecordReminders(reminder.recordId)
  },

  completeDatabaseRecordReminder(id, completed) {
    const result = this.recordRepository.completeRecordReminder.run(
      completed ? new Date().toISOString() : null,
      new Date().toISOString(),
      id,
    )
    if (result.changes !== 1) throw new Error('Database record reminder does not exist.')
  },

  deleteDatabaseRecordReminder(id) {
    if (this.recordRepository.deleteRecordReminder.run(id).changes !== 1) {
      throw new Error('Database record reminder does not exist.')
    }
  },
}
