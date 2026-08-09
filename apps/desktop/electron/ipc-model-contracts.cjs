const modelProviders = new Set(['openai-compatible', 'ollama', 'lm-studio'])

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError('This model channel does not accept arguments.')
}

function parseModelBaseUrl(value) {
  if (typeof value !== 'string' || value.length > 2_048) {
    throw new TypeError('Invalid model base URL.')
  }
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('Model URL must use HTTP or HTTPS.')
  }
  if (url.username || url.password) {
    throw new TypeError('Model URL must not contain embedded credentials.')
  }
  if (url.hash) throw new TypeError('Model URL must not contain a fragment.')
  return url.toString().replace(/\/$/u, '')
}

/**
 * Produces the only model configuration shape persisted by the main process.
 * API keys are intentionally excluded because they have a separate encrypted store.
 */
function normalizeModelConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Model configuration is required.')
  }
  if (!modelProviders.has(value.provider)) throw new TypeError('Unsupported provider type.')
  if (typeof value.model !== 'string' || value.model.length < 1 || value.model.length > 200) {
    throw new TypeError('Invalid model name.')
  }
  return {
    provider: value.provider,
    baseUrl: parseModelBaseUrl(value.baseUrl),
    model: value.model,
  }
}

function assertSaveConfigRequest(args) {
  if (args.length !== 1) throw new TypeError('Model save request requires one configuration.')
  const config = args[0]
  normalizeModelConfig(config)
  const allowedFields = new Set(['provider', 'baseUrl', 'model', 'apiKey'])
  if (Object.keys(config).some((field) => !allowedFields.has(field))) {
    throw new TypeError('Model configuration contains unexpected fields.')
  }
  if (
    config.apiKey !== undefined &&
    (typeof config.apiKey !== 'string' || config.apiKey.length > 16_384)
  ) {
    throw new TypeError('Invalid model API key.')
  }
}

function assertPublicModelConfig(value) {
  normalizeModelConfig(value)
  const keys = Object.keys(value)
  const allowedFields = new Set(['provider', 'baseUrl', 'model', 'hasApiKey'])
  if (keys.length !== 4 || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid public model configuration fields.')
  }
  if (typeof value.hasApiKey !== 'boolean') throw new TypeError('Invalid model key state.')
}

function assertConnectionResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid model connection response.')
  }
  const keys = Object.keys(value)
  const allowedFields = new Set(['ok', 'latencyMs', 'endpoint'])
  if (keys.length !== 3 || keys.some((field) => !allowedFields.has(field))) {
    throw new TypeError('Invalid model connection response fields.')
  }
  if (value.ok !== true) throw new TypeError('Invalid model connection state.')
  if (!Number.isSafeInteger(value.latencyMs) || value.latencyMs < 0) {
    throw new TypeError('Invalid model connection latency.')
  }
  parseModelBaseUrl(value.endpoint)
}

const modelIpcContracts = Object.freeze({
  getConfig: Object.freeze({
    assertRequest: assertNoArguments,
    assertResponse: assertPublicModelConfig,
  }),
  saveConfig: Object.freeze({
    assertRequest: assertSaveConfigRequest,
    assertResponse: assertPublicModelConfig,
  }),
  testConnection: Object.freeze({
    assertRequest: assertNoArguments,
    assertResponse: assertConnectionResponse,
  }),
})

module.exports = { modelIpcContracts, normalizeModelConfig }
