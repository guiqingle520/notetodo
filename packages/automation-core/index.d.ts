export type AutomationValue = string | number | boolean | string[] | null
export type AutomationOperator = 'equals' | 'notEquals' | 'contains' | 'isEmpty' | 'isNotEmpty' | 'greaterThan' | 'lessThan'
export interface AutomationProperty { id: string; type: string }
export interface AutomationSchema { properties: AutomationProperty[] }
export interface AutomationRule { id: string; name: string; enabled: boolean; trigger: { type: 'propertyChanged'; propertyId: string }; condition?: { propertyId: string; operator: AutomationOperator; value?: AutomationValue }; actions: Array<{ type: 'setProperty'; propertyId: string; value: AutomationValue }> }
export interface AutomationRecord { id: string; values: Record<string, AutomationValue> }
export const CONDITION_OPERATORS: readonly AutomationOperator[]
export function validateAutomationRule(schema: AutomationSchema, rule: AutomationRule): string[]
export function planAutomationRuns(schema: AutomationSchema, record: AutomationRecord, changedPropertyId: string, rules: AutomationRule[]): { values: Record<string, AutomationValue>; runs: Array<{ automationId: string; automationName: string; input: { recordId: string; changedPropertyId: string; values: Record<string, AutomationValue> }; patches: Array<{ propertyId: string; value: AutomationValue }> }> }
