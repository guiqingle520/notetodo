const propertyTypes = new Set([
  'title',
  'text',
  'number',
  'checkbox',
  'select',
  'multiSelect',
  'date',
  'url',
  'relation',
  'rollup',
  'formula',
])
const writablePropertyTypes = new Set([...propertyTypes].filter((type) => type !== 'title'))
const viewTypes = new Set(['table', 'board', 'list', 'calendar', 'timeline', 'gallery'])
const optionColors = new Set([
  'slate',
  'gray',
  'brown',
  'red',
  'orange',
  'amber',
  'green',
  'blue',
  'purple',
  'pink',
])
const rollupAggregations = new Set(['count', 'sum', 'average', 'min', 'max', 'showOriginal'])
const filterOperators = new Set([
  'equals',
  'notEquals',
  'contains',
  'isEmpty',
  'isNotEmpty',
  'greaterThan',
  'lessThan',
])
const calculations = new Set([
  'count',
  'countValues',
  'sum',
  'average',
  'min',
  'max',
  'earliest',
  'latest',
  'percentChecked',
])

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Invalid database ${label}.`)
  }
}

function assertFields(value, required, optional, label) {
  assertObject(value, label)
  const allowed = new Set([...required, ...optional])
  const keys = Object.keys(value)
  if (
    required.some((field) => !keys.includes(field)) ||
    keys.some((field) => !allowed.has(field))
  ) {
    throw new TypeError(`Invalid database ${label} fields.`)
  }
}

function assertArgumentCount(args, minimum, maximum = minimum) {
  if (!Array.isArray(args) || args.length < minimum || args.length > maximum) {
    throw new TypeError('Invalid database IPC argument count.')
  }
}

function assertNoArguments(args) {
  assertArgumentCount(args, 0)
}

function assertId(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) {
    throw new TypeError(`Invalid database ${label}.`)
  }
}

function assertRequiredText(value, maximumLength, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximumLength ||
    /\p{Cc}/u.test(value)
  ) {
    throw new TypeError(`Invalid database ${label}.`)
  }
}

function assertText(value, maximumLength, label) {
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new TypeError(`Invalid database ${label}.`)
  }
}

function assertTimestamp(value, label) {
  if (typeof value !== 'string' || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`Invalid database ${label}.`)
  }
}

function assertSafeCount(value, maximum, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`Invalid database ${label}.`)
  }
}

function assertIdArray(value, options = {}) {
  const minimum = options.minimum ?? 0
  const maximum = options.maximum ?? 1_000
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new TypeError(`Invalid database ${options.label ?? 'identifier list'}.`)
  }
  value.forEach((item) => assertId(item, options.label ?? 'identifier'))
  if (new Set(value).size !== value.length) {
    throw new TypeError(`Database ${options.label ?? 'identifier list'} must be unique.`)
  }
}

function assertPropertyValue(value, options = {}) {
  const maximumStringLength = options.maximumStringLength ?? 100_000
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Invalid database property number.')
    return
  }
  if (typeof value === 'string') {
    if (value.length > maximumStringLength)
      throw new TypeError('Database property text is too large.')
    return
  }
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((item) => typeof item !== 'string' || item.length > 1_000)
  ) {
    throw new TypeError('Invalid database multi-value property.')
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError('Database multi-value property must be unique.')
  }
}

function assertPropertyValues(value, options = {}) {
  assertObject(value, options.label ?? 'property values')
  const entries = Object.entries(value)
  if (entries.length > (options.maximumProperties ?? 100)) {
    throw new TypeError('Database property value collection is too large.')
  }
  for (const [propertyId, propertyValue] of entries) {
    assertId(propertyId, 'property id')
    assertPropertyValue(propertyValue, options)
  }
  assertJsonLength(value, options.maximumJsonLength ?? 500_000, 'property values')
}

function assertSelectOptions(value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new TypeError('Invalid database select options.')
  }
  const ids = new Set()
  const names = new Set()
  for (const option of value) {
    assertFields(option, ['id', 'name', 'color'], [], 'select option')
    assertId(option.id, 'select option id')
    assertRequiredText(option.name, 100, 'select option name')
    if (!optionColors.has(option.color))
      throw new TypeError('Invalid database select option color.')
    const nameKey = option.name.trim().toLocaleLowerCase('en-US')
    if (ids.has(option.id) || names.has(nameKey)) {
      throw new TypeError('Database select options must be unique.')
    }
    ids.add(option.id)
    names.add(nameKey)
  }
}

function assertPropertyConfig(value, options = {}) {
  assertFields(
    value,
    [],
    ['options', 'relation', 'rollup', 'formula', 'constraints'],
    options.label ?? 'property configuration',
  )
  if (value.options !== undefined) assertSelectOptions(value.options)
  if (value.relation !== undefined) {
    assertFields(value.relation, ['databaseId'], ['reciprocalPropertyId'], 'relation configuration')
    assertId(value.relation.databaseId, 'relation database id')
    if (value.relation.reciprocalPropertyId !== undefined) {
      assertId(value.relation.reciprocalPropertyId, 'reciprocal property id')
    }
  }
  if (value.rollup !== undefined) {
    assertFields(
      value.rollup,
      ['relationPropertyId', 'targetPropertyId', 'aggregation'],
      [],
      'rollup configuration',
    )
    assertId(value.rollup.relationPropertyId, 'rollup relation property id')
    assertId(value.rollup.targetPropertyId, 'rollup target property id')
    if (!rollupAggregations.has(value.rollup.aggregation)) {
      throw new TypeError('Invalid database rollup aggregation.')
    }
  }
  if (value.formula !== undefined) {
    assertFields(value.formula, ['expression'], [], 'formula configuration')
    assertRequiredText(value.formula.expression, 1_000, 'formula expression')
  }
  if (value.constraints !== undefined) {
    assertFields(
      value.constraints,
      [],
      ['required', 'unique', 'defaultValue'],
      'property constraints',
    )
    if (
      (value.constraints.required !== undefined &&
        typeof value.constraints.required !== 'boolean') ||
      (value.constraints.unique !== undefined && typeof value.constraints.unique !== 'boolean')
    ) {
      throw new TypeError('Invalid database property constraint flag.')
    }
    if (Object.hasOwn(value.constraints, 'defaultValue')) {
      assertPropertyValue(value.constraints.defaultValue)
    }
  }
  assertJsonLength(value, options.maximumJsonLength ?? 50_000, 'property configuration')
}

function assertDatabaseProperty(value) {
  assertFields(
    value,
    ['id', 'name', 'type'],
    ['options', 'relation', 'rollup', 'formula', 'constraints'],
    'property',
  )
  assertId(value.id, 'property id')
  assertRequiredText(value.name, 100, 'property name')
  if (!propertyTypes.has(value.type)) throw new TypeError('Invalid database property type.')
  const config = Object.fromEntries(
    ['options', 'relation', 'rollup', 'formula', 'constraints']
      .filter((field) => value[field] !== undefined)
      .map((field) => [field, value[field]]),
  )
  assertPropertyConfig(config)
  if (value.options !== undefined && !['select', 'multiSelect'].includes(value.type)) {
    throw new TypeError('Database select options do not match the property type.')
  }
  if (value.relation !== undefined && value.type !== 'relation') {
    throw new TypeError('Database relation configuration does not match the property type.')
  }
  if (value.rollup !== undefined && value.type !== 'rollup') {
    throw new TypeError('Database rollup configuration does not match the property type.')
  }
  if (value.formula !== undefined && value.type !== 'formula') {
    throw new TypeError('Database formula configuration does not match the property type.')
  }
}

function assertFilterRule(value) {
  assertFields(value, ['propertyId', 'operator'], ['value'], 'filter rule')
  assertId(value.propertyId, 'filter property id')
  if (!filterOperators.has(value.operator)) throw new TypeError('Invalid database filter operator.')
  if (value.value !== undefined) assertPropertyValue(value.value)
}

function assertViewConfig(value, options = {}) {
  const allowedFields = [
    'filters',
    'quickFilters',
    'filterMode',
    'sorts',
    'groupByPropertyId',
    'collapsedGroupKeys',
    'recordOrder',
    'datePropertyId',
    'startDatePropertyId',
    'endDatePropertyId',
    'coverPropertyId',
    'visiblePropertyIds',
    'propertyWidths',
    'rowHeight',
    'propertyOrder',
    'freezeFirstColumn',
    'calculations',
    'cardSize',
  ]
  assertFields(value, [], allowedFields, 'view configuration')
  assertRuleList(value.filters, 20, assertFilterRule, 'filters')
  assertRuleList(value.quickFilters, 5, assertFilterRule, 'quick filters')
  assertRuleList(
    value.sorts,
    10,
    (sort) => {
      assertFields(sort, ['propertyId', 'direction'], [], 'sort rule')
      assertId(sort.propertyId, 'sort property id')
      if (!['asc', 'desc'].includes(sort.direction))
        throw new TypeError('Invalid database sort direction.')
    },
    'sorts',
  )
  for (const field of [
    'groupByPropertyId',
    'datePropertyId',
    'startDatePropertyId',
    'endDatePropertyId',
    'coverPropertyId',
  ]) {
    if (value[field] !== undefined) assertId(value[field], field)
  }
  if (value.filterMode !== undefined && !['and', 'or'].includes(value.filterMode)) {
    throw new TypeError('Invalid database filter mode.')
  }
  if (
    value.rowHeight !== undefined &&
    !['compact', 'default', 'comfortable'].includes(value.rowHeight)
  ) {
    throw new TypeError('Invalid database row height.')
  }
  if (value.cardSize !== undefined && !['small', 'medium', 'large'].includes(value.cardSize)) {
    throw new TypeError('Invalid database card size.')
  }
  if (value.freezeFirstColumn !== undefined && typeof value.freezeFirstColumn !== 'boolean') {
    throw new TypeError('Invalid database freeze state.')
  }
  if (value.visiblePropertyIds !== undefined) {
    assertIdArray(value.visiblePropertyIds, { maximum: 50, label: 'visible property ids' })
  }
  if (value.propertyOrder !== undefined) {
    assertIdArray(value.propertyOrder, { maximum: 50, label: 'property order' })
  }
  if (value.recordOrder !== undefined) {
    assertIdArray(value.recordOrder, { maximum: 10_000, label: 'record order' })
  }
  if (value.collapsedGroupKeys !== undefined) {
    if (
      !Array.isArray(value.collapsedGroupKeys) ||
      value.collapsedGroupKeys.length > 100 ||
      value.collapsedGroupKeys.some((key) => typeof key !== 'string' || key.length > 1_000)
    ) {
      throw new TypeError('Invalid database collapsed group keys.')
    }
  }
  assertKeyedConfiguration(value.propertyWidths, 50, (width) => {
    if (!Number.isFinite(width) || width < 40 || width > 2_000) {
      throw new TypeError('Invalid database property width.')
    }
  })
  assertKeyedConfiguration(value.calculations, 50, (calculation) => {
    if (!calculations.has(calculation)) throw new TypeError('Invalid database calculation.')
  })
  assertJsonLength(value, options.maximumJsonLength ?? 500_000, 'view configuration')
}

function assertRuleList(value, maximum, validator, label) {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`Invalid database ${label}.`)
  }
  value.forEach(validator)
}

function assertKeyedConfiguration(value, maximum, validator) {
  if (value === undefined) return
  assertObject(value, 'keyed configuration')
  const entries = Object.entries(value)
  if (entries.length > maximum) throw new TypeError('Database keyed configuration is too large.')
  for (const [propertyId, item] of entries) {
    assertId(propertyId, 'configuration property id')
    validator(item)
  }
}

function assertJsonLength(value, maximumLength, label) {
  const serialized = JSON.stringify(value)
  if (serialized === undefined || serialized.length > maximumLength) {
    throw new TypeError(`Database ${label} is too large.`)
  }
}

function assertVoidResponse(value) {
  if (value !== undefined) throw new TypeError('Database operation must not return a value.')
}

module.exports = {
  assertArgumentCount,
  assertDatabaseProperty,
  assertFields,
  assertId,
  assertIdArray,
  assertJsonLength,
  assertNoArguments,
  assertObject,
  assertPropertyConfig,
  assertPropertyValue,
  assertPropertyValues,
  assertRequiredText,
  assertSafeCount,
  assertText,
  assertTimestamp,
  assertViewConfig,
  assertVoidResponse,
  viewTypes,
  writablePropertyTypes,
}
