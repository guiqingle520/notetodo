// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface IpcContract {
  assertRequest(args: unknown[]): void
  assertResponse(value: unknown): void
}

const require = createRequire(import.meta.url)
const { modelIpcContracts, normalizeModelConfig } =
  require('../../electron/ipc-model-contracts.cjs') as {
    modelIpcContracts: Record<'getConfig' | 'saveConfig' | 'testConnection', IpcContract>
    normalizeModelConfig: (value: unknown) => {
      provider: string
      baseUrl: string
      model: string
    }
  }

const config = {
  provider: 'openai-compatible',
  baseUrl: 'https://models.example.test/v1/',
  model: 'custom-model',
}

describe('model IPC contracts', () => {
  it('normalizes a supported custom model endpoint without persisting secrets', () => {
    expect(normalizeModelConfig({ ...config, apiKey: 'secret' })).toEqual({
      ...config,
      baseUrl: 'https://models.example.test/v1',
    })
  })

  it('rejects embedded credentials, unsafe protocols, and unexpected request fields', () => {
    expect(() =>
      normalizeModelConfig({ ...config, baseUrl: 'https://user:secret@models.example.test/v1' }),
    ).toThrow(/embedded credentials/)
    expect(() => normalizeModelConfig({ ...config, baseUrl: 'file:///models' })).toThrow(/HTTP/)
    expect(() =>
      modelIpcContracts.saveConfig.assertRequest([{ ...config, exposeKey: true }]),
    ).toThrow(/unexpected fields/)
  })

  it('prevents API keys and extra fields from crossing the response boundary', () => {
    expect(() =>
      modelIpcContracts.getConfig.assertResponse({ ...config, hasApiKey: true }),
    ).not.toThrow()
    expect(() =>
      modelIpcContracts.getConfig.assertResponse({ ...config, hasApiKey: true, apiKey: 'secret' }),
    ).toThrow(/configuration fields/)
  })

  it('validates connection latency and endpoint responses', () => {
    expect(() =>
      modelIpcContracts.testConnection.assertResponse({
        ok: true,
        latencyMs: 42,
        endpoint: 'https://models.example.test/v1/models',
      }),
    ).not.toThrow()
    expect(() =>
      modelIpcContracts.testConnection.assertResponse({
        ok: true,
        latencyMs: -1,
        endpoint: 'https://models.example.test/v1/models',
      }),
    ).toThrow(/latency/)
  })
})
