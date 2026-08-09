const { CONDITION_OPERATORS } = require('@notetodo/automation-core')

const MAX_AUTOMATION_COUNT = 10_000
const MAX_RUN_COUNT = 500
const MAX_ACTION_COUNT = 20
const MAX_VALUE_ARRAY_LENGTH = 1_000
const conditionOperatorSet = new Set(CONDITION_OPERATORS)

function assertId(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 128 ||
    value.trim() !== value ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError(`Invalid automation ${label}.`)
  }
}

function assertName(value, requireCanonical = false) {
  if (
    typeof value !== 'string' ||
    value.trim().length < 1 ||
    value.length > 100 ||
    /\p{Cc}/u.test(value) ||
    (requireCanonical && value.trim() !== value)
  ) {
    throw new TypeError('Invalid automation name.')
  }
}

function assertValue(value) {
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return
  }
  if (typeof value === 'string') {
    if (value.length > 100_000) throw new TypeError('Automation value is too large.')
    return
  }
  if (
    Array.isArray(value) &&
    value.length <= MAX_VALUE_ARRAY_LENGTH &&
    value.every((item) => typeof item === 'string' && item.length <= 10_000)
  ) {
    return
  }
  throw new TypeError('Invalid automation value.')
}

function assertExactObject(value, allowedFields, requiredFields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Invalid automation ${label}.`)
  }
  const keys = Object.keys(value)
  if (
    keys.some((field) => !allowedFields.has(field)) ||
    requiredFields.some((field) => !keys.includes(field))
  ) {
    throw new TypeError(`Invalid automation ${label} fields.`)
  }
}

function assertTrigger(value) {
  const fields = new Set(['type', 'propertyId'])
  assertExactObject(value, fields, [...fields], 'trigger')
  if (value.type !== 'propertyChanged') throw new TypeError('Invalid automation trigger type.')
  assertId(value.propertyId, 'trigger property id')
}

function assertCondition(value) {
  if (value === undefined) return
  const allowedFields = new Set(['propertyId', 'operator', 'value'])
  assertExactObject(value, allowedFields, ['propertyId', 'operator'], 'condition')
  assertId(value.propertyId, 'condition property id')
  if (!conditionOperatorSet.has(value.operator)) {
    throw new TypeError('Invalid automation condition operator.')
  }
  if (value.value !== undefined) assertValue(value.value)
}

function assertAction(value) {
  const fields = new Set(['type', 'propertyId', 'value'])
  assertExactObject(value, fields, [...fields], 'action')
  if (value.type !== 'setProperty') throw new TypeError('Invalid automation action type.')
  assertId(value.propertyId, 'action property id')
  assertValue(value.value)
}

function assertActions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ACTION_COUNT) {
    throw new TypeError('Automation requires between 1 and 20 actions.')
  }
  value.forEach(assertAction)
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid automation ${label}.`)
  }
}

function assertRule(value, isStored) {
  const allowedFields = new Set(['id', 'name', 'enabled', 'trigger', 'condition', 'actions'])
  if (isStored) {
    allowedFields.add('createdAt')
    allowedFields.add('updatedAt')
  }
  const requiredFields = ['id', 'name', 'enabled', 'trigger', 'actions']
  if (isStored) requiredFields.push('condition', 'createdAt', 'updatedAt')
  assertExactObject(value, allowedFields, requiredFields, 'rule')
  assertId(value.id, 'rule id')
  assertName(value.name, isStored)
  if (typeof value.enabled !== 'boolean') throw new TypeError('Invalid automation enabled state.')
  assertTrigger(value.trigger)
  assertCondition(value.condition)
  assertActions(value.actions)
  if (isStored) {
    assertTimestamp(value.createdAt, 'creation time')
    assertTimestamp(value.updatedAt, 'update time')
  }
}

function assertDatabaseRequest(args, operation) {
  if (args.length !== 1) throw new TypeError(`${operation} requires one database id.`)
  assertId(args[0], 'database id')
}

function assertSaveRequest(args) {
  if (args.length !== 2) throw new TypeError('Automation save requires database and rule.')
  assertId(args[0], 'database id')
  assertRule(args[1], false)
}

function assertStateRequest(args) {
  if (args.length !== 2) throw new TypeError('Automation state update requires id and state.')
  assertId(args[0], 'rule id')
  if (typeof args[1] !== 'boolean') throw new TypeError('Invalid automation state.')
}

function assertReplayRequest(args) {
  if (args.length !== 1) throw new TypeError('Automation replay requires one run id.')
  assertId(args[0], 'run id')
}

function assertRuleList(value) {
  if (!Array.isArray(value) || value.length > MAX_AUTOMATION_COUNT) {
    throw new TypeError('Invalid automation rule collection.')
  }
  value.forEach((rule) => assertRule(rule, true))
}

function assertStoredRule(value) {
  assertRule(value, true)
}

function assertRun(value) {
  const fields = new Set([
    'id',
    'automationId',
    'automationName',
    'recordId',
    'triggerPropertyId',
    'output',
    'status',
    'errorMessage',
    'replayOf',
    'createdAt',
    'completedAt',
  ])
  assertExactObject(value, fields, [...fields], 'run')
  assertId(value.id, 'run id')
  if (value.automationId !== null) assertId(value.automationId, 'run rule id')
  assertName(value.automationName, true)
  assertId(value.recordId, 'run record id')
  assertId(value.triggerPropertyId, 'run trigger property id')
  if (!Array.isArray(value.output) || value.output.length > MAX_ACTION_COUNT) {
    throw new TypeError('Invalid automation run output.')
  }
  value.output.forEach((patch) => {
    const patchFields = new Set(['propertyId', 'value'])
    assertExactObject(patch, patchFields, [...patchFields], 'run patch')
    assertId(patch.propertyId, 'run patch property id')
    assertValue(patch.value)
  })
  if (!['succeeded', 'failed'].includes(value.status)) {
    throw new TypeError('Invalid automation run status.')
  }
  if (
    value.errorMessage !== null &&
    (typeof value.errorMessage !== 'string' || value.errorMessage.length > 10_000)
  ) {
    throw new TypeError('Invalid automation run error.')
  }
  if (value.replayOf !== null) assertId(value.replayOf, 'source run id')
  assertTimestamp(value.createdAt, 'run creation time')
  assertTimestamp(value.completedAt, 'run completion time')
}

function assertRunList(value) {
  if (!Array.isArray(value) || value.length > MAX_RUN_COUNT) {
    throw new TypeError('Invalid automation run collection.')
  }
  value.forEach(assertRun)
}

function assertBooleanResponse(value) {
  if (typeof value !== 'boolean') throw new TypeError('Invalid automation state response.')
}

function assertIdResponse(value) {
  assertId(value, 'response id')
}

const automationIpcContracts = Object.freeze({
  list: Object.freeze({
    assertRequest: (args) => assertDatabaseRequest(args, 'Automation list'),
    assertResponse: assertRuleList,
  }),
  save: Object.freeze({ assertRequest: assertSaveRequest, assertResponse: assertStoredRule }),
  setEnabled: Object.freeze({
    assertRequest: assertStateRequest,
    assertResponse: assertBooleanResponse,
  }),
  listRuns: Object.freeze({
    assertRequest: (args) => assertDatabaseRequest(args, 'Automation run list'),
    assertResponse: assertRunList,
  }),
  replay: Object.freeze({ assertRequest: assertReplayRequest, assertResponse: assertIdResponse }),
})

module.exports = { automationIpcContracts }
