import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { planAutomationRuns, validateAutomationRule } = require('./index.cjs')

const schema = { properties: [{ id: 'status', type: 'select' }, { id: 'score', type: 'number' }, { id: 'risk', type: 'formula' }] }
const rule = { id: 'complete', name: '完成归档', enabled: true, trigger: { type: 'propertyChanged', propertyId: 'status' }, condition: { propertyId: 'status', operator: 'equals', value: 'done' }, actions: [{ type: 'setProperty', propertyId: 'score', value: '1' }] }

describe('automation core', () => {
  it('validates references and rejects derived-property writes', () => {
    expect(validateAutomationRule(schema, rule)).toEqual([])
    expect(validateAutomationRule(schema, { ...rule, actions: [{ type: 'setProperty', propertyId: 'risk', value: 'bad' }] })).toContain('Actions cannot write derived properties.')
  })

  it('creates deterministic patches only when trigger and condition match', () => {
    const result = planAutomationRuns(schema, { id: 'task-1', values: { status: 'done', score: 3 } }, 'status', [rule])
    expect(result.values.score).toBe(1)
    expect(result.runs).toEqual([expect.objectContaining({ automationId: 'complete', patches: [{ propertyId: 'score', value: 1 }] })])
    expect(planAutomationRuns(schema, { id: 'task-1', values: { status: 'doing', score: 3 } }, 'status', [rule]).runs).toHaveLength(0)
  })

  it('caps evaluated rules and actions to prevent amplification', () => {
    const manyRules = Array.from({ length: 80 }, (_, index) => ({ ...rule, id: `rule-${index}` }))
    expect(planAutomationRuns(schema, { id: 'task-1', values: { status: 'done' } }, 'status', manyRules).runs).toHaveLength(50)
  })
})
