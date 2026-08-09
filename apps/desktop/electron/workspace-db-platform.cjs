const { randomUUID } = require('node:crypto')
const { createApiToken, verifyApiToken } = require('@notetodo/auth-core')
const { planAutomationRuns, validateAutomationRule } = require('@notetodo/automation-core')
const { WEBHOOK_EVENTS, createWebhookEnvelope, nextWebhookAttempt, stableJson, validateWebhookUrl } = require('@notetodo/webhook-core')

module.exports = {
  getSetting(key) {
    return this.platformRepository.getSetting.get(key)?.value ?? null
  },

  setSetting(key, value) {
    this.platformRepository.setSetting.run(key, value)
  },

  databaseAutomationSchema(databaseId) {
    return { properties: this.platformRepository.automationSchema.all(databaseId) }
  },

  listDatabaseAutomations(databaseId) {
    return this.platformRepository.listAutomations.all(databaseId).map((row) => ({ id: row.id, name: row.name, enabled: Boolean(row.enabled), trigger: { type: 'propertyChanged', propertyId: row.trigger_property_id }, condition: row.condition_json ? JSON.parse(row.condition_json) : undefined, actions: JSON.parse(row.actions_json), createdAt: row.created_at, updatedAt: row.updated_at }))
  },

  saveDatabaseAutomation(databaseId, rule) {
    const normalized = { ...rule, id: rule.id || randomUUID() }
    // 规则 ID 是全局主键。更新前确认归属，避免调用方用已知 ID 覆盖其他数据库的规则。
    const existing = this.platformRepository.automationOwner.get(normalized.id)
    if (existing && existing.database_id !== databaseId) throw new Error('Automation rule belongs to another database.')
    const issues = validateAutomationRule(this.databaseAutomationSchema(databaseId), normalized)
    if (issues.length) throw new TypeError(issues.join(' '))
    const now = new Date().toISOString()
    this.platformRepository.saveAutomation.run(normalized.id, databaseId, normalized.name.trim(), normalized.enabled ? 1 : 0, normalized.trigger.propertyId, normalized.condition ? JSON.stringify(normalized.condition) : null, JSON.stringify(normalized.actions), now, now)
    return this.listDatabaseAutomations(databaseId).find((item) => item.id === normalized.id)
  },

  setDatabaseAutomationEnabled(id, enabled) {
    return this.platformRepository.setAutomationEnabled.run(enabled ? 1 : 0, new Date().toISOString(), id).changes > 0
  },

  loadAutomationRecord(recordId) {
    const values = {}
    for (const row of this.platformRepository.automationRecordValues.all(recordId)) {
      values[row.property_id] = row.text_value ?? row.number_value ?? (row.boolean_value === null ? null : Boolean(row.boolean_value))
      if (row.json_value !== null) values[row.property_id] = JSON.parse(row.json_value)
    }
    return { id: recordId, values }
  },

  executeDatabaseAutomations(databaseId, recordId, changedPropertyId, now) {
    const rules = this.listDatabaseAutomations(databaseId).filter((rule) => rule.enabled && rule.trigger.propertyId === changedPropertyId)
    const plan = planAutomationRuns(this.databaseAutomationSchema(databaseId), this.loadAutomationRecord(recordId), changedPropertyId, rules)
    const runIds = []
    for (const run of plan.runs) {
      const rule = rules.find((candidate) => candidate.id === run.automationId)
      const runId = randomUUID(); runIds.push(runId)
      this.platformRepository.control('saveAutomation')
      try {
        for (const patch of run.patches) {
          const property = this.platformRepository.automationProperty.get(patch.propertyId, databaseId)
          if (!property) throw new Error('Automation action property no longer exists.')
          const previous = this.readDatabasePropertyValue(recordId, patch.propertyId)
          this.writeDatabasePropertyValue(recordId, property, patch.value, now)
          this.appendDatabaseRecordHistory(recordId, patch.propertyId, 'property', previous, this.normalizeDatabasePropertyValue(property, patch.value), now)
        }
        this.platformRepository.touchRecord.run(now, recordId)
        this.insertAutomationRun({ id: runId, rule, databaseId, recordId, changedPropertyId, input: run.input, output: run.patches, status: 'succeeded', error: null, replayOf: null, now })
        this.platformRepository.control('releaseAutomation')
      } catch (error) {
        this.platformRepository.control('rollbackAutomation'); this.platformRepository.control('releaseAutomation')
        this.insertAutomationRun({ id: runId, rule, databaseId, recordId, changedPropertyId, input: run.input, output: run.patches, status: 'failed', error: error instanceof Error ? error.message : 'Automation failed.', replayOf: null, now })
      }
    }
    return runIds
  },

  insertAutomationRun(entry) {
    this.platformRepository.insertAutomationRun.run(entry.id, entry.rule?.id ?? null, entry.rule?.name ?? '已删除规则', entry.databaseId, entry.recordId, entry.changedPropertyId, JSON.stringify(entry.rule), JSON.stringify(entry.input), JSON.stringify(entry.output), entry.status, entry.error, entry.replayOf, entry.now, entry.now)
  },

  listAutomationRuns(databaseId, limit = 100) {
    return this.platformRepository.listAutomationRuns.all(databaseId, Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({ id: row.id, automationId: row.automation_id, automationName: row.automation_name, recordId: row.record_id, triggerPropertyId: row.trigger_property_id, output: JSON.parse(row.output_json), status: row.status, errorMessage: row.error_message, replayOf: row.replay_of, createdAt: row.created_at, completedAt: row.completed_at }))
  },

  replayAutomationRun(runId) {
    const source = this.platformRepository.failedAutomationRun.get(runId)
    if (!source) throw new Error('Only failed automation runs can be replayed.')
    const currentRule = source.automation_id ? this.listDatabaseAutomations(source.database_id).find((rule) => rule.id === source.automation_id) : null
    const rule = currentRule ?? JSON.parse(source.rule_json)
    const input = JSON.parse(source.input_json)
    const plan = planAutomationRuns(this.databaseAutomationSchema(source.database_id), { id: source.record_id, values: input.values }, input.changedPropertyId, [{ ...rule, enabled: true }])
    if (!plan.runs.length) throw new Error('The corrected rule no longer matches the captured input.')
    const run = plan.runs[0]; const replayId = randomUUID(); const now = new Date().toISOString()
    this.platformRepository.control('begin')
    this.platformRepository.control('saveReplay')
    try {
      for (const patch of run.patches) {
        const property = this.platformRepository.automationProperty.get(patch.propertyId, source.database_id)
        if (!property) throw new Error('Automation action property no longer exists.')
        const previous = this.readDatabasePropertyValue(source.record_id, patch.propertyId)
        this.writeDatabasePropertyValue(source.record_id, property, patch.value, now)
        this.appendDatabaseRecordHistory(source.record_id, patch.propertyId, 'property', previous, this.normalizeDatabasePropertyValue(property, patch.value), now)
      }
      this.platformRepository.touchRecord.run(now, source.record_id)
      this.insertAutomationRun({ id: replayId, rule, databaseId: source.database_id, recordId: source.record_id, changedPropertyId: source.trigger_property_id, input, output: run.patches, status: 'succeeded', error: null, replayOf: runId, now })
      this.platformRepository.control('releaseReplay')
      this.platformRepository.control('commit')
      return replayId
    } catch (error) {
      // 回滚业务写入，但在同一外层事务中保留失败磁带，便于修正规则后继续重放。
      this.platformRepository.control('rollbackReplay')
      this.platformRepository.control('releaseReplay')
      this.insertAutomationRun({ id: replayId, rule, databaseId: source.database_id, recordId: source.record_id, changedPropertyId: source.trigger_property_id, input, output: run.patches, status: 'failed', error: error instanceof Error ? error.message : 'Automation replay failed.', replayOf: runId, now })
      this.platformRepository.control('commit')
      return replayId
    }
  },

  createWebhookEndpoint(name, url, events, encryptedSecret) {
    const safeName = String(name).trim()
    if (!safeName || safeName.length > 100) throw new TypeError('Webhook name must contain 1 to 100 characters.')
    const safeUrl = validateWebhookUrl(url)
    if (!Array.isArray(events) || !events.length || events.some((event) => !WEBHOOK_EVENTS.includes(event))) throw new TypeError('Webhook requires valid subscribed events.')
    if (!Buffer.isBuffer(encryptedSecret) || encryptedSecret.length < 1 || encryptedSecret.length > 16_384) throw new TypeError('Webhook secret must be encrypted before storage.')
    const id = randomUUID(); const now = new Date().toISOString()
    this.platformRepository.createWebhookEndpoint.run(id, safeName, safeUrl, encryptedSecret, JSON.stringify([...new Set(events)]), now, now)
    return { id, name: safeName, url: safeUrl, events: [...new Set(events)], active: true, createdAt: now, updatedAt: now }
  },

  listWebhookEndpoints() {
    return this.platformRepository.listWebhookEndpoints.all().map((row) => ({ id: row.id, name: row.name, url: row.url, events: JSON.parse(row.events_json), active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at, pendingCount: Number(row.pending_count), deadCount: Number(row.dead_count) }))
  },

  setWebhookEndpointActive(id, active) {
    const result = this.platformRepository.setWebhookActive.run(active ? 1 : 0, new Date().toISOString(), id)
    return result.changes > 0
  },

  /** Adds events inside the caller's business transaction and coalesces rapid unsent updates. */
  enqueueWebhookEvent(event, resourceKey, data, occurredAt = new Date().toISOString()) {
    if (!WEBHOOK_EVENTS.includes(event)) throw new TypeError('Unsupported webhook event.')
    const serializedData = stableJson(data)
    if (Buffer.byteLength(serializedData, 'utf8') > 240_000) throw new RangeError('Webhook event data exceeds 240 KiB.')
    const endpoints = this.platformRepository.activeWebhookEndpoints.all()
    const findPending = this.platformRepository.pendingWebhook
    const updatePending = this.platformRepository.updatePendingWebhook
    const insert = this.platformRepository.insertWebhook
    for (const endpoint of endpoints) {
      if (!JSON.parse(endpoint.events_json).includes(event)) continue
      const existing = findPending.get(endpoint.id, event, resourceKey)
      const deliveryId = existing?.id ?? randomUUID()
      const payload = stableJson(createWebhookEnvelope(event, deliveryId, occurredAt, JSON.parse(serializedData)))
      if (existing) updatePending.run(payload, occurredAt, occurredAt, deliveryId)
      else insert.run(deliveryId, endpoint.id, event, resourceKey, payload, occurredAt, occurredAt)
    }
  },

  claimWebhookDeliveries(workerId, limit = 10, leaseMs = 30_000, now = new Date().toISOString()) {
    if (typeof workerId !== 'string' || !workerId || workerId.length > 128) throw new TypeError('Invalid webhook worker id.')
    const leaseUntil = new Date(Date.parse(now) + Math.max(5_000, Math.min(300_000, leaseMs))).toISOString()
    const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 10))
    this.platformRepository.control('begin')
    try {
      this.platformRepository.recoverWebhookLeases.run(now)
      const due = this.platformRepository.dueWebhooks.all(now, boundedLimit)
      const lease = this.platformRepository.leaseWebhook
      for (const item of due) lease.run(workerId, leaseUntil, item.id)
      const rows = due.length ? this.platformRepository.leasedWebhooks.all(workerId, leaseUntil) : []
      this.platformRepository.control('commit')
      return rows.map((row) => ({ id: row.id, endpointId: row.endpoint_id, event: row.event, payload: row.payload_json, attempts: row.attempts, url: row.url, encryptedSecret: Buffer.from(row.secret_ciphertext) }))
    } catch (error) { this.platformRepository.control('rollback'); throw error }
  },

  completeWebhookDelivery(deliveryId, workerId, result) {
    this.platformRepository.control('begin')
    try {
      const delivery = this.platformRepository.ownedWebhook.get(deliveryId, workerId)
      if (!delivery) throw new Error('Webhook delivery lease is no longer owned by this worker.')
      const attempt = delivery.attempts + 1; const now = new Date().toISOString()
      const success = result.statusCode >= 200 && result.statusCode < 300
      const dead = !success && attempt >= 8
      this.platformRepository.insertWebhookAttempt.run(deliveryId, attempt, result.statusCode ?? null, Math.max(0, Math.round(result.durationMs)), String(result.responsePreview ?? '').slice(0, 2000) || null, String(result.errorMessage ?? '').slice(0, 2000) || null, now)
      this.platformRepository.updateWebhookDelivery.run(success ? 'delivered' : dead ? 'dead' : 'pending', attempt, success || dead ? now : nextWebhookAttempt(attempt, Date.parse(now)), success ? null : String(result.errorMessage ?? `HTTP ${result.statusCode ?? 0}`).slice(0, 2000), success ? now : null, deliveryId)
      this.platformRepository.control('commit')
      return { status: success ? 'delivered' : dead ? 'dead' : 'pending', attempt }
    } catch (error) { this.platformRepository.control('rollback'); throw error }
  },

  listWebhookDeliveries(endpointId, limit = 100) {
    return this.platformRepository.listWebhookDeliveries.all(endpointId, Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({ id: row.id, endpointId: row.endpoint_id, event: row.event, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastError: row.last_error, createdAt: row.created_at, deliveredAt: row.delivered_at }))
  },

  issueApiToken(name, scopes, expiresAt = null) {
    const safeName = String(name).trim()
    if (!safeName || safeName.length > 100) throw new TypeError('API token name must contain 1 to 100 characters.')
    if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) throw new TypeError('API token expiry must be a valid ISO date.')
    const created = createApiToken(scopes)
    const now = new Date().toISOString()
    this.platformRepository.insertApiToken.run(created.id, safeName, created.prefix, created.secretHash, JSON.stringify(created.scopes), expiresAt, now)
    return { id: created.id, name: safeName, rawToken: created.rawToken, prefix: created.prefix, scopes: created.scopes, expiresAt, createdAt: now }
  },

  listApiTokens() {
    return this.platformRepository.listApiTokens.all().map((row) => ({
      id: row.id, name: row.name, prefix: row.token_prefix, scopes: JSON.parse(row.scopes_json),
      expiresAt: row.expires_at, revokedAt: row.revoked_at, lastUsedAt: row.last_used_at, createdAt: row.created_at,
    }))
  },

  authenticateApiToken(rawToken, requiredScope) {
    const tokenId = /^ntd_v1_([0-9a-f-]{36})_/u.exec(rawToken)?.[1]
    if (!tokenId) return null
    const row = this.platformRepository.apiTokenById.get(tokenId)
    if (!row) return null
    const stored = { id: row.id, secretHash: row.secret_hash, scopes: JSON.parse(row.scopes_json), expiresAt: row.expires_at, revokedAt: row.revoked_at }
    if (!verifyApiToken(rawToken, stored, requiredScope)) return null
    const lastUsedAt = new Date().toISOString()
    this.platformRepository.touchApiToken.run(lastUsedAt, row.id)
    return { id: row.id, name: row.name, scopes: stored.scopes, lastUsedAt }
  },

  revokeApiToken(id) {
    const revokedAt = new Date().toISOString()
    const result = this.platformRepository.revokeApiToken.run(revokedAt, id)
    return result.changes > 0
  },

  recordApiAudit(entry) {
    this.platformRepository.insertApiAudit.run(entry.requestId.slice(0, 128), entry.tokenId ?? null, entry.method.slice(0, 10), entry.path.slice(0, 2048), entry.status, Math.max(0, Math.round(entry.durationMs)), new Date().toISOString())
  },

  listApiAudit(limit = 100) {
    return this.platformRepository.listApiAudit.all(Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({
      requestId: row.request_id, tokenId: row.token_id, method: row.method, path: row.path,
      status: row.status, durationMs: row.duration_ms, createdAt: row.created_at,
    }))
  }
}
