// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { automationIpcContracts } = require('../../electron/ipc-automation-contracts.cjs') as {
  automationIpcContracts: Record<
    'list' | 'save' | 'setEnabled' | 'listRuns' | 'replay',
    IpcContract
  >
}
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => {
    listDatabaseAutomations(databaseId: string): unknown[]
    updateDatabaseCell(recordId: string, propertyId: string, value: unknown): unknown
    listAutomationRuns(databaseId: string): unknown[]
    close(): void
  }
}

const timestamp = '2026-08-09T12:00:00.000Z'
const rule = {
  id: 'complete-task',
  name: '完成后归档',
  enabled: true,
  trigger: { type: 'propertyChanged', propertyId: 'status' },
  condition: { propertyId: 'status', operator: 'equals', value: 'done' },
  actions: [{ type: 'setProperty', propertyId: 'archived', value: true }],
}
const storedRule = { ...rule, createdAt: timestamp, updatedAt: timestamp }

describe('automation IPC contracts', () => {
  it('accepts structurally valid rules and their persisted timestamps', () => {
    expect(() => automationIpcContracts.save.assertRequest(['database-1', rule])).not.toThrow()
    expect(() => automationIpcContracts.save.assertResponse(storedRule)).not.toThrow()
    expect(() => automationIpcContracts.list.assertResponse([storedRule])).not.toThrow()
  })

  it('rejects executable-shaped values, extra fields, and action amplification', () => {
    expect(() =>
      automationIpcContracts.save.assertRequest([
        'database-1',
        { ...rule, actions: [{ ...rule.actions[0], value: { expression: 'run()' } }] },
      ]),
    ).toThrow(/value/)
    expect(() =>
      automationIpcContracts.save.assertRequest(['database-1', { ...rule, internal: true }]),
    ).toThrow(/fields/)
    expect(() =>
      automationIpcContracts.save.assertRequest([
        'database-1',
        { ...rule, actions: Array.from({ length: 21 }, () => rule.actions[0]) },
      ]),
    ).toThrow(/20 actions/)
  })

  it('requires supported condition operators and exact trigger shapes', () => {
    expect(() =>
      automationIpcContracts.save.assertRequest([
        'database-1',
        { ...rule, condition: { ...rule.condition, operator: 'execute' } },
      ]),
    ).toThrow(/operator/)
    expect(() =>
      automationIpcContracts.save.assertRequest([
        'database-1',
        { ...rule, trigger: { ...rule.trigger, script: 'alert(1)' } },
      ]),
    ).toThrow(/fields/)
  })

  it('validates immutable run tapes and bounds their patch output', () => {
    const run = {
      id: 'run-1',
      automationId: rule.id,
      automationName: rule.name,
      recordId: 'record-1',
      triggerPropertyId: 'status',
      output: [{ propertyId: 'archived', value: true }],
      status: 'succeeded',
      errorMessage: null,
      replayOf: null,
      createdAt: timestamp,
      completedAt: timestamp,
    }
    expect(() => automationIpcContracts.listRuns.assertResponse([run])).not.toThrow()
    expect(() =>
      automationIpcContracts.listRuns.assertResponse([{ ...run, output: [{}] }]),
    ).toThrow(/fields/)
  })

  it('requires boolean state results and a bounded replay id response', () => {
    expect(() => automationIpcContracts.setEnabled.assertRequest([rule.id, false])).not.toThrow()
    expect(() => automationIpcContracts.setEnabled.assertResponse(undefined)).toThrow(/response/)
    expect(() => automationIpcContracts.replay.assertResponse('run-2')).not.toThrow()
  })

  it('matches the real SQLite rule and execution-tape projections', () => {
    const database = new WorkspaceDatabase(':memory:')
    try {
      expect(() =>
        automationIpcContracts.list.assertResponse(database.listDatabaseAutomations('roadmap-db')),
      ).not.toThrow()
      database.updateDatabaseCell('task-4', 'task-status', 'done')
      expect(() =>
        automationIpcContracts.listRuns.assertResponse(database.listAutomationRuns('roadmap-db')),
      ).not.toThrow()
    } finally {
      database.close()
    }
  })
})
