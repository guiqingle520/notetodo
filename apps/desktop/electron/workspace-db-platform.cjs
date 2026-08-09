const { randomUUID } = require('node:crypto')
const { createApiToken, verifyApiToken } = require('@notetodo/auth-core')
const { planAutomationRuns, validateAutomationRule } = require('@notetodo/automation-core')
const { WEBHOOK_EVENTS, createWebhookEnvelope, nextWebhookAttempt, stableJson, validateWebhookUrl } = require('@notetodo/webhook-core')

module.exports = {
  getSetting(key) {
    return this.database.prepare('SELECT value FROM app_meta WHERE key = ?').get(key)?.value ?? null
  },

  setSetting(key, value) {
    this.database.prepare('INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  },

  databaseAutomationSchema(databaseId) {
    return { properties: this.database.prepare('SELECT id, type FROM database_properties WHERE database_id=? ORDER BY position').all(databaseId) }
  },

  listDatabaseAutomations(databaseId) {
    return this.database.prepare(`
      SELECT id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at
      FROM database_automations WHERE database_id=? ORDER BY created_at, id
    `).all(databaseId).map((row) => ({ id: row.id, name: row.name, enabled: Boolean(row.enabled), trigger: { type: 'propertyChanged', propertyId: row.trigger_property_id }, condition: row.condition_json ? JSON.parse(row.condition_json) : undefined, actions: JSON.parse(row.actions_json), createdAt: row.created_at, updatedAt: row.updated_at }))
  },

  saveDatabaseAutomation(databaseId, rule) {
    const normalized = { ...rule, id: rule.id || randomUUID() }
    // 规则 ID 是全局主键。更新前确认归属，避免调用方用已知 ID 覆盖其他数据库的规则。
    const existing = this.database.prepare('SELECT database_id FROM database_automations WHERE id=?').get(normalized.id)
    if (existing && existing.database_id !== databaseId) throw new Error('Automation rule belongs to another database.')
    const issues = validateAutomationRule(this.databaseAutomationSchema(databaseId), normalized)
    if (issues.length) throw new TypeError(issues.join(' '))
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO database_automations(id, database_id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled, trigger_property_id=excluded.trigger_property_id,
        condition_json=excluded.condition_json, actions_json=excluded.actions_json, updated_at=excluded.updated_at
    `).run(normalized.id, databaseId, normalized.name.trim(), normalized.enabled ? 1 : 0, normalized.trigger.propertyId, normalized.condition ? JSON.stringify(normalized.condition) : null, JSON.stringify(normalized.actions), now, now)
    return this.listDatabaseAutomations(databaseId).find((item) => item.id === normalized.id)
  },

  setDatabaseAutomationEnabled(id, enabled) {
    return this.database.prepare('UPDATE database_automations SET enabled=?, updated_at=? WHERE id=?').run(enabled ? 1 : 0, new Date().toISOString(), id).changes > 0
  },

  loadAutomationRecord(recordId) {
    const values = {}
    for (const row of this.database.prepare('SELECT property_id, text_value, number_value, boolean_value, json_value FROM property_values WHERE record_id=?').all(recordId)) {
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
      this.database.exec('SAVEPOINT automation_rule')
      try {
        for (const patch of run.patches) {
          const property = this.database.prepare('SELECT id, type, config_json FROM database_properties WHERE id=? AND database_id=?').get(patch.propertyId, databaseId)
          if (!property) throw new Error('Automation action property no longer exists.')
          const previous = this.readDatabasePropertyValue(recordId, patch.propertyId)
          this.writeDatabasePropertyValue(recordId, property, patch.value, now)
          this.appendDatabaseRecordHistory(recordId, patch.propertyId, 'property', previous, this.normalizeDatabasePropertyValue(property, patch.value), now)
        }
        this.database.prepare('UPDATE database_records SET updated_at=? WHERE id=?').run(now, recordId)
        this.insertAutomationRun({ id: runId, rule, databaseId, recordId, changedPropertyId, input: run.input, output: run.patches, status: 'succeeded', error: null, replayOf: null, now })
        this.database.exec('RELEASE SAVEPOINT automation_rule')
      } catch (error) {
        this.database.exec('ROLLBACK TO SAVEPOINT automation_rule'); this.database.exec('RELEASE SAVEPOINT automation_rule')
        this.insertAutomationRun({ id: runId, rule, databaseId, recordId, changedPropertyId, input: run.input, output: run.patches, status: 'failed', error: error instanceof Error ? error.message : 'Automation failed.', replayOf: null, now })
      }
    }
    return runIds
  },

  insertAutomationRun(entry) {
    this.database.prepare(`
      INSERT INTO automation_runs(id, automation_id, automation_name, database_id, record_id, trigger_property_id, rule_json, input_json, output_json, status, error_message, replay_of, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.rule?.id ?? null, entry.rule?.name ?? '已删除规则', entry.databaseId, entry.recordId, entry.changedPropertyId, JSON.stringify(entry.rule), JSON.stringify(entry.input), JSON.stringify(entry.output), entry.status, entry.error, entry.replayOf, entry.now, entry.now)
  },

  listAutomationRuns(databaseId, limit = 100) {
    return this.database.prepare(`
      SELECT id, automation_id, automation_name, record_id, trigger_property_id, output_json, status, error_message, replay_of, created_at, completed_at
      FROM automation_runs WHERE database_id=? ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(databaseId, Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({ id: row.id, automationId: row.automation_id, automationName: row.automation_name, recordId: row.record_id, triggerPropertyId: row.trigger_property_id, output: JSON.parse(row.output_json), status: row.status, errorMessage: row.error_message, replayOf: row.replay_of, createdAt: row.created_at, completedAt: row.completed_at }))
  },

  replayAutomationRun(runId) {
    const source = this.database.prepare('SELECT * FROM automation_runs WHERE id=? AND status=\'failed\'').get(runId)
    if (!source) throw new Error('Only failed automation runs can be replayed.')
    const currentRule = source.automation_id ? this.listDatabaseAutomations(source.database_id).find((rule) => rule.id === source.automation_id) : null
    const rule = currentRule ?? JSON.parse(source.rule_json)
    const input = JSON.parse(source.input_json)
    const plan = planAutomationRuns(this.databaseAutomationSchema(source.database_id), { id: source.record_id, values: input.values }, input.changedPropertyId, [{ ...rule, enabled: true }])
    if (!plan.runs.length) throw new Error('The corrected rule no longer matches the captured input.')
    const run = plan.runs[0]; const replayId = randomUUID(); const now = new Date().toISOString()
    this.database.exec('BEGIN IMMEDIATE')
    this.database.exec('SAVEPOINT automation_replay')
    try {
      for (const patch of run.patches) {
        const property = this.database.prepare('SELECT id, type, config_json FROM database_properties WHERE id=? AND database_id=?').get(patch.propertyId, source.database_id)
        if (!property) throw new Error('Automation action property no longer exists.')
        const previous = this.readDatabasePropertyValue(source.record_id, patch.propertyId)
        this.writeDatabasePropertyValue(source.record_id, property, patch.value, now)
        this.appendDatabaseRecordHistory(source.record_id, patch.propertyId, 'property', previous, this.normalizeDatabasePropertyValue(property, patch.value), now)
      }
      this.database.prepare('UPDATE database_records SET updated_at=? WHERE id=?').run(now, source.record_id)
      this.insertAutomationRun({ id: replayId, rule, databaseId: source.database_id, recordId: source.record_id, changedPropertyId: source.trigger_property_id, input, output: run.patches, status: 'succeeded', error: null, replayOf: runId, now })
      this.database.exec('RELEASE SAVEPOINT automation_replay')
      this.database.exec('COMMIT')
      return replayId
    } catch (error) {
      // 回滚业务写入，但在同一外层事务中保留失败磁带，便于修正规则后继续重放。
      this.database.exec('ROLLBACK TO SAVEPOINT automation_replay')
      this.database.exec('RELEASE SAVEPOINT automation_replay')
      this.insertAutomationRun({ id: replayId, rule, databaseId: source.database_id, recordId: source.record_id, changedPropertyId: source.trigger_property_id, input, output: run.patches, status: 'failed', error: error instanceof Error ? error.message : 'Automation replay failed.', replayOf: runId, now })
      this.database.exec('COMMIT')
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
    this.database.prepare(`
      INSERT INTO webhook_endpoints(id, name, url, secret_ciphertext, events_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, safeName, safeUrl, encryptedSecret, JSON.stringify([...new Set(events)]), now, now)
    return { id, name: safeName, url: safeUrl, events: [...new Set(events)], active: true, createdAt: now, updatedAt: now }
  },

  listWebhookEndpoints() {
    return this.database.prepare(`
      SELECT endpoint.id, endpoint.name, endpoint.url, endpoint.events_json, endpoint.active,
             endpoint.created_at, endpoint.updated_at,
             SUM(CASE WHEN outbox.status='pending' THEN 1 ELSE 0 END) AS pending_count,
             SUM(CASE WHEN outbox.status='dead' THEN 1 ELSE 0 END) AS dead_count
      FROM webhook_endpoints endpoint LEFT JOIN webhook_outbox outbox ON outbox.endpoint_id=endpoint.id
      GROUP BY endpoint.id ORDER BY endpoint.created_at DESC
    `).all().map((row) => ({ id: row.id, name: row.name, url: row.url, events: JSON.parse(row.events_json), active: Boolean(row.active), createdAt: row.created_at, updatedAt: row.updated_at, pendingCount: Number(row.pending_count), deadCount: Number(row.dead_count) }))
  },

  setWebhookEndpointActive(id, active) {
    const result = this.database.prepare('UPDATE webhook_endpoints SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, new Date().toISOString(), id)
    return result.changes > 0
  },

  /** Adds events inside the caller's business transaction and coalesces rapid unsent updates. */
  enqueueWebhookEvent(event, resourceKey, data, occurredAt = new Date().toISOString()) {
    if (!WEBHOOK_EVENTS.includes(event)) throw new TypeError('Unsupported webhook event.')
    const serializedData = stableJson(data)
    if (Buffer.byteLength(serializedData, 'utf8') > 240_000) throw new RangeError('Webhook event data exceeds 240 KiB.')
    const endpoints = this.database.prepare('SELECT id, events_json FROM webhook_endpoints WHERE active=1').all()
    const findPending = this.database.prepare("SELECT id FROM webhook_outbox WHERE endpoint_id=? AND event=? AND resource_key=? AND status='pending' ORDER BY created_at DESC LIMIT 1")
    const updatePending = this.database.prepare('UPDATE webhook_outbox SET payload_json=?, next_attempt_at=?, created_at=? WHERE id=?')
    const insert = this.database.prepare(`
      INSERT INTO webhook_outbox(id, endpoint_id, event, resource_key, payload_json, status, next_attempt_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `)
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
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare("UPDATE webhook_outbox SET status='pending', lease_owner=NULL, lease_until=NULL WHERE status='leased' AND lease_until<=?").run(now)
      const due = this.database.prepare(`
        SELECT outbox.id FROM webhook_outbox outbox
        JOIN webhook_endpoints endpoint ON endpoint.id=outbox.endpoint_id AND endpoint.active=1
        WHERE outbox.status='pending' AND outbox.next_attempt_at<=?
        ORDER BY outbox.next_attempt_at, outbox.created_at LIMIT ?
      `).all(now, boundedLimit)
      const lease = this.database.prepare("UPDATE webhook_outbox SET status='leased', lease_owner=?, lease_until=? WHERE id=? AND status='pending'")
      for (const item of due) lease.run(workerId, leaseUntil, item.id)
      const rows = due.length ? this.database.prepare(`
        SELECT outbox.id, outbox.endpoint_id, outbox.event, outbox.payload_json, outbox.attempts,
               endpoint.url, endpoint.secret_ciphertext
        FROM webhook_outbox outbox JOIN webhook_endpoints endpoint ON endpoint.id=outbox.endpoint_id
        WHERE outbox.lease_owner=? AND outbox.lease_until=? ORDER BY outbox.created_at
      `).all(workerId, leaseUntil) : []
      this.database.exec('COMMIT')
      return rows.map((row) => ({ id: row.id, endpointId: row.endpoint_id, event: row.event, payload: row.payload_json, attempts: row.attempts, url: row.url, encryptedSecret: Buffer.from(row.secret_ciphertext) }))
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  },

  completeWebhookDelivery(deliveryId, workerId, result) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const delivery = this.database.prepare("SELECT attempts FROM webhook_outbox WHERE id=? AND status='leased' AND lease_owner=?").get(deliveryId, workerId)
      if (!delivery) throw new Error('Webhook delivery lease is no longer owned by this worker.')
      const attempt = delivery.attempts + 1; const now = new Date().toISOString()
      const success = result.statusCode >= 200 && result.statusCode < 300
      const dead = !success && attempt >= 8
      this.database.prepare(`
        INSERT INTO webhook_delivery_attempts(delivery_id, attempt_number, status_code, duration_ms, response_preview, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(deliveryId, attempt, result.statusCode ?? null, Math.max(0, Math.round(result.durationMs)), String(result.responsePreview ?? '').slice(0, 2000) || null, String(result.errorMessage ?? '').slice(0, 2000) || null, now)
      this.database.prepare(`
        UPDATE webhook_outbox SET status=?, attempts=?, next_attempt_at=?, lease_owner=NULL, lease_until=NULL,
          last_error=?, delivered_at=? WHERE id=?
      `).run(success ? 'delivered' : dead ? 'dead' : 'pending', attempt, success || dead ? now : nextWebhookAttempt(attempt, Date.parse(now)), success ? null : String(result.errorMessage ?? `HTTP ${result.statusCode ?? 0}`).slice(0, 2000), success ? now : null, deliveryId)
      this.database.exec('COMMIT')
      return { status: success ? 'delivered' : dead ? 'dead' : 'pending', attempt }
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  },

  listWebhookDeliveries(endpointId, limit = 100) {
    return this.database.prepare(`
      SELECT id, endpoint_id, event, status, attempts, next_attempt_at, last_error, created_at, delivered_at
      FROM webhook_outbox WHERE endpoint_id=? ORDER BY created_at DESC LIMIT ?
    `).all(endpointId, Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({ id: row.id, endpointId: row.endpoint_id, event: row.event, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastError: row.last_error, createdAt: row.created_at, deliveredAt: row.delivered_at }))
  },

  issueApiToken(name, scopes, expiresAt = null) {
    const safeName = String(name).trim()
    if (!safeName || safeName.length > 100) throw new TypeError('API token name must contain 1 to 100 characters.')
    if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) throw new TypeError('API token expiry must be a valid ISO date.')
    const created = createApiToken(scopes)
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO api_tokens(id, name, token_prefix, secret_hash, scopes_json, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(created.id, safeName, created.prefix, created.secretHash, JSON.stringify(created.scopes), expiresAt, now)
    return { id: created.id, name: safeName, rawToken: created.rawToken, prefix: created.prefix, scopes: created.scopes, expiresAt, createdAt: now }
  },

  listApiTokens() {
    return this.database.prepare(`
      SELECT id, name, token_prefix, scopes_json, expires_at, revoked_at, last_used_at, created_at
      FROM api_tokens ORDER BY created_at DESC
    `).all().map((row) => ({
      id: row.id, name: row.name, prefix: row.token_prefix, scopes: JSON.parse(row.scopes_json),
      expiresAt: row.expires_at, revokedAt: row.revoked_at, lastUsedAt: row.last_used_at, createdAt: row.created_at,
    }))
  },

  authenticateApiToken(rawToken, requiredScope) {
    const tokenId = /^ntd_v1_([0-9a-f-]{36})_/u.exec(rawToken)?.[1]
    if (!tokenId) return null
    const row = this.database.prepare(`
      SELECT id, name, secret_hash, scopes_json, expires_at, revoked_at FROM api_tokens WHERE id = ?
    `).get(tokenId)
    if (!row) return null
    const stored = { id: row.id, secretHash: row.secret_hash, scopes: JSON.parse(row.scopes_json), expiresAt: row.expires_at, revokedAt: row.revoked_at }
    if (!verifyApiToken(rawToken, stored, requiredScope)) return null
    const lastUsedAt = new Date().toISOString()
    this.database.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(lastUsedAt, row.id)
    return { id: row.id, name: row.name, scopes: stored.scopes, lastUsedAt }
  },

  revokeApiToken(id) {
    const revokedAt = new Date().toISOString()
    const result = this.database.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(revokedAt, id)
    return result.changes > 0
  },

  recordApiAudit(entry) {
    this.database.prepare(`
      INSERT INTO api_audit_log(request_id, token_id, method, path, status, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.requestId.slice(0, 128), entry.tokenId ?? null, entry.method.slice(0, 10), entry.path.slice(0, 2048), entry.status, Math.max(0, Math.round(entry.durationMs)), new Date().toISOString())
  },

  listApiAudit(limit = 100) {
    return this.database.prepare(`
      SELECT request_id, token_id, method, path, status, duration_ms, created_at
      FROM api_audit_log ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(Math.max(1, Math.min(500, Number(limit) || 100))).map((row) => ({
      requestId: row.request_id, tokenId: row.token_id, method: row.method, path: row.path,
      status: row.status, durationMs: row.duration_ms, createdAt: row.created_at,
    }))
  }
}
