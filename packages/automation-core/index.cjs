const CONDITION_OPERATORS = Object.freeze(['equals', 'notEquals', 'contains', 'isEmpty', 'isNotEmpty', 'greaterThan', 'lessThan'])

function validateAutomationRule(schema, rule) {
  const issues = []
  if (!rule || typeof rule !== 'object') return ['Automation rule must be an object.']
  if (typeof rule.id !== 'string' || !rule.id || rule.id.length > 128) issues.push('Rule id is invalid.')
  if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 100) issues.push('Rule name is invalid.')
  const properties = new Map(schema.properties.map((property) => [property.id, property]))
  if (!properties.has(rule.trigger?.propertyId)) issues.push('Trigger property does not exist.')
  if (rule.condition) {
    if (!properties.has(rule.condition.propertyId)) issues.push('Condition property does not exist.')
    if (!CONDITION_OPERATORS.includes(rule.condition.operator)) issues.push('Condition operator is invalid.')
  }
  if (!Array.isArray(rule.actions) || !rule.actions.length || rule.actions.length > 20) issues.push('Rule requires 1 to 20 actions.')
  else for (const action of rule.actions) {
    const property = properties.get(action.propertyId)
    if (action.type !== 'setProperty' || !property) issues.push('Action property does not exist.')
    else if (property.type === 'formula' || property.type === 'rollup') issues.push('Actions cannot write derived properties.')
  }
  return [...new Set(issues)]
}

function planAutomationRuns(schema, record, changedPropertyId, rules) {
  const runs = []
  let values = { ...record.values }
  for (const rule of rules.slice(0, 50)) {
    const issues = validateAutomationRule(schema, rule)
    if (issues.length || !rule.enabled || rule.trigger.propertyId !== changedPropertyId || rule.condition && !matches(values[rule.condition.propertyId], rule.condition)) continue
    const patches = []
    for (const action of rule.actions) {
      const property = schema.properties.find((candidate) => candidate.id === action.propertyId)
      const value = normalizeValue(property, action.value)
      values[action.propertyId] = value
      patches.push({ propertyId: action.propertyId, value })
    }
    runs.push({ automationId: rule.id, automationName: rule.name, input: { recordId: record.id, changedPropertyId, values: { ...record.values } }, patches })
  }
  return { values, runs }
}

function matches(value, condition) {
  const empty = value === null || value === '' || Array.isArray(value) && value.length === 0
  if (condition.operator === 'isEmpty') return empty
  if (condition.operator === 'isNotEmpty') return !empty
  if (condition.operator === 'equals') return Object.is(value, condition.value)
  if (condition.operator === 'notEquals') return !Object.is(value, condition.value)
  if (condition.operator === 'contains') return Array.isArray(value) ? value.includes(condition.value) : String(value ?? '').toLowerCase().includes(String(condition.value ?? '').toLowerCase())
  const left = Number(value); const right = Number(condition.value)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  return condition.operator === 'greaterThan' ? left > right : left < right
}

function normalizeValue(property, input) {
  if (input === null || input === undefined || input === '') return null
  if (property.type === 'checkbox') return Boolean(input)
  if (property.type === 'number') { const value = Number(input); return Number.isFinite(value) ? value : null }
  if (property.type === 'relation' || property.type === 'multiSelect') return Array.isArray(input) ? [...new Set(input.filter((value) => typeof value === 'string'))] : null
  return typeof input === 'string' ? input : String(input)
}

module.exports = { CONDITION_OPERATORS, planAutomationRuns, validateAutomationRule }
