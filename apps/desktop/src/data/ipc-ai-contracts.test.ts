// @vitest-environment node
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

interface WorkspaceDatabase {
  createAIPatchAudit(id: string, pageId: string, operation: string, preview: string): string
  updateAIPatchAudit(id: string, status: string): void
  loadAIPatchAudit(pageId: string): Array<{ id: string; status: string }>
  close(): void
}

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { aiIpcContracts } = require('../../electron/ipc-ai-contracts.cjs') as {
  aiIpcContracts: Record<'createPatchAudit' | 'updatePatchAudit', IpcContract>
}
const { WorkspaceDatabase } = require('../../electron/workspace-db.cjs') as {
  WorkspaceDatabase: new (path: string) => WorkspaceDatabase
}

let database: WorkspaceDatabase | null = null

afterEach(() => {
  database?.close()
  database = null
})

describe('AI patch audit contracts', () => {
  it('accepts reviewable proposals and rejects empty or oversized previews', () => {
    expect(() =>
      aiIpcContracts.createPatchAudit.assertRequest([
        'page-1',
        'replace-selection',
        '建议替换内容',
      ]),
    ).not.toThrow()
    expect(() =>
      aiIpcContracts.createPatchAudit.assertRequest(['page-1', 'replace-selection', '   ']),
    ).toThrow(/preview/)
  })

  it('enforces proposed, applied, and undone lifecycle transitions', () => {
    database = new WorkspaceDatabase(':memory:')
    database.createAIPatchAudit('patch-1', 'welcome', 'insert-paragraphs', '建议写入内容')
    database.updateAIPatchAudit('patch-1', 'applied')
    expect(database.loadAIPatchAudit('welcome')[0]?.status).toBe('applied')

    expect(() => database?.updateAIPatchAudit('patch-1', 'rejected')).toThrow(/状态不能/)
    database.updateAIPatchAudit('patch-1', 'undone')
    expect(database.loadAIPatchAudit('welcome')[0]?.status).toBe('undone')
  })

  it('keeps repeated state writes idempotent and rejects missing audit records', () => {
    database = new WorkspaceDatabase(':memory:')
    database.createAIPatchAudit('patch-2', 'welcome', 'insert-paragraphs', '建议写入内容')
    database.updateAIPatchAudit('patch-2', 'rejected')

    expect(() => database?.updateAIPatchAudit('patch-2', 'rejected')).not.toThrow()
    expect(() => database?.updateAIPatchAudit('missing', 'applied')).toThrow(/不存在/)
  })
})
