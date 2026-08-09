/** Open Platform、自动化和 Webhook 领域的具名 SQL。 */
module.exports = Object.freeze({
  getSetting: 'SELECT value FROM app_meta WHERE key = ?',
  setSetting: 'INSERT INTO app_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  automationSchema: 'SELECT id, type FROM database_properties WHERE database_id=? ORDER BY position',
  listAutomations: `SELECT id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at
    FROM database_automations WHERE database_id=? ORDER BY created_at, id`,
  automationOwner: 'SELECT database_id FROM database_automations WHERE id=?',
  saveAutomation: `INSERT INTO database_automations(id, database_id, name, enabled, trigger_property_id, condition_json, actions_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, enabled=excluded.enabled, trigger_property_id=excluded.trigger_property_id,
      condition_json=excluded.condition_json, actions_json=excluded.actions_json, updated_at=excluded.updated_at`,
  setAutomationEnabled: 'UPDATE database_automations SET enabled=?, updated_at=? WHERE id=?',
  automationRecordValues: 'SELECT property_id, text_value, number_value, boolean_value, json_value FROM property_values WHERE record_id=?',
  automationProperty: 'SELECT id, type, config_json FROM database_properties WHERE id=? AND database_id=?',
  touchRecord: 'UPDATE database_records SET updated_at=? WHERE id=?',
  insertAutomationRun: `INSERT INTO automation_runs(id, automation_id, automation_name, database_id, record_id, trigger_property_id, rule_json, input_json, output_json, status, error_message, replay_of, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  listAutomationRuns: `SELECT id, automation_id, automation_name, record_id, trigger_property_id, output_json, status, error_message, replay_of, created_at, completed_at
    FROM automation_runs WHERE database_id=? ORDER BY created_at DESC, id DESC LIMIT ?`,
  failedAutomationRun: "SELECT * FROM automation_runs WHERE id=? AND status='failed'",
  createWebhookEndpoint: `INSERT INTO webhook_endpoints(id, name, url, secret_ciphertext, events_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  listWebhookEndpoints: `SELECT endpoint.id, endpoint.name, endpoint.url, endpoint.events_json, endpoint.active,
      endpoint.created_at, endpoint.updated_at,
      SUM(CASE WHEN outbox.status='pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN outbox.status='dead' THEN 1 ELSE 0 END) AS dead_count
    FROM webhook_endpoints endpoint LEFT JOIN webhook_outbox outbox ON outbox.endpoint_id=endpoint.id
    GROUP BY endpoint.id ORDER BY endpoint.created_at DESC`,
  setWebhookActive: 'UPDATE webhook_endpoints SET active=?, updated_at=? WHERE id=?',
  activeWebhookEndpoints: 'SELECT id, events_json FROM webhook_endpoints WHERE active=1',
  pendingWebhook: "SELECT id FROM webhook_outbox WHERE endpoint_id=? AND event=? AND resource_key=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
  updatePendingWebhook: 'UPDATE webhook_outbox SET payload_json=?, next_attempt_at=?, created_at=? WHERE id=?',
  insertWebhook: `INSERT INTO webhook_outbox(id, endpoint_id, event, resource_key, payload_json, status, next_attempt_at, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  recoverWebhookLeases: "UPDATE webhook_outbox SET status='pending', lease_owner=NULL, lease_until=NULL WHERE status='leased' AND lease_until<=?",
  dueWebhooks: `SELECT outbox.id FROM webhook_outbox outbox
    JOIN webhook_endpoints endpoint ON endpoint.id=outbox.endpoint_id AND endpoint.active=1
    WHERE outbox.status='pending' AND outbox.next_attempt_at<=?
    ORDER BY outbox.next_attempt_at, outbox.created_at LIMIT ?`,
  leaseWebhook: "UPDATE webhook_outbox SET status='leased', lease_owner=?, lease_until=? WHERE id=? AND status='pending'",
  leasedWebhooks: `SELECT outbox.id, outbox.endpoint_id, outbox.event, outbox.payload_json, outbox.attempts,
      endpoint.url, endpoint.secret_ciphertext
    FROM webhook_outbox outbox JOIN webhook_endpoints endpoint ON endpoint.id=outbox.endpoint_id
    WHERE outbox.lease_owner=? AND outbox.lease_until=? ORDER BY outbox.created_at`,
  ownedWebhook: "SELECT attempts FROM webhook_outbox WHERE id=? AND status='leased' AND lease_owner=?",
  insertWebhookAttempt: `INSERT INTO webhook_delivery_attempts(delivery_id, attempt_number, status_code, duration_ms, response_preview, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  updateWebhookDelivery: `UPDATE webhook_outbox SET status=?, attempts=?, next_attempt_at=?, lease_owner=NULL, lease_until=NULL,
    last_error=?, delivered_at=? WHERE id=?`,
  listWebhookDeliveries: `SELECT id, endpoint_id, event, status, attempts, next_attempt_at, last_error, created_at, delivered_at
    FROM webhook_outbox WHERE endpoint_id=? ORDER BY created_at DESC LIMIT ?`,
  insertApiToken: `INSERT INTO api_tokens(id, name, token_prefix, secret_hash, scopes_json, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  listApiTokens: 'SELECT id, name, token_prefix, scopes_json, expires_at, revoked_at, last_used_at, created_at FROM api_tokens ORDER BY created_at DESC',
  apiTokenById: 'SELECT id, name, secret_hash, scopes_json, expires_at, revoked_at FROM api_tokens WHERE id = ?',
  touchApiToken: 'UPDATE api_tokens SET last_used_at = ? WHERE id = ?',
  revokeApiToken: 'UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
  insertApiAudit: `INSERT INTO api_audit_log(request_id, token_id, method, path, status, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  listApiAudit: 'SELECT request_id, token_id, method, path, status, duration_ms, created_at FROM api_audit_log ORDER BY created_at DESC, id DESC LIMIT ?',
})
