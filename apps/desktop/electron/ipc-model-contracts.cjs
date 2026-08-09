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

function assertRequestId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/u.test(value)) {
    throw new TypeError('Invalid model request id.')
  }
}

function assertModelRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid model request.')
  }
  const allowedFields = new Set(['messages', 'temperature'])
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new TypeError('Model request contains unexpected fields.')
  }
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 100) {
    throw new TypeError('Invalid model messages.')
  }

  let totalLength = 0
  for (const message of value.messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new TypeError('Invalid model message.')
    }
    const messageFields = Object.keys(message)
    if (
      messageFields.length !== 2 ||
      !messageFields.includes('role') ||
      !messageFields.includes('content') ||
      !['system', 'user', 'assistant', 'tool'].includes(message.role) ||
      typeof message.content !== 'string'
    ) {
      throw new TypeError('Invalid model message.')
    }
    totalLength += message.content.length
  }
  if (totalLength > 1_000_000) throw new TypeError('Model context is too large.')
  if (
    value.temperature !== undefined &&
    (typeof value.temperature !== 'number' ||
      !Number.isFinite(value.temperature) ||
      value.temperature < 0 ||
      value.temperature > 2)
  ) {
    throw new TypeError('Invalid model temperature.')
  }
}

function assertStreamChatRequest(args) {
  if (args.length !== 2) throw new TypeError('Model stream request requires an id and payload.')
  assertRequestId(args[0])
  assertModelRequest(args[1])
}

function assertCancelChatRequest(args) {
  if (args.length !== 1) throw new TypeError('Model cancellation requires one request id.')
  assertRequestId(args[0])
}

function assertModelStreamEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid model stream event.')
  }
  const keys = Object.keys(value)
  if (value.type === 'text-delta') {
    if (keys.length !== 2 || typeof value.text !== 'string' || value.text.length > 100_000) {
      throw new TypeError('Invalid model text event.')
    }
    return
  }
  if (value.type === 'usage') {
    if (
      keys.length !== 3 ||
      !Number.isSafeInteger(value.inputTokens) ||
      value.inputTokens < 0 ||
      !Number.isSafeInteger(value.outputTokens) ||
      value.outputTokens < 0
    ) {
      throw new TypeError('Invalid model usage event.')
    }
    return
  }
  if (value.type === 'error') {
    if (keys.length !== 2 || typeof value.message !== 'string' || value.message.length > 2_000) {
      throw new TypeError('Invalid model error event.')
    }
    return
  }
  if (!['done', 'cancelled'].includes(value.type) || keys.length !== 1) {
    throw new TypeError('Invalid model terminal event.')
  }
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
  streamChat: Object.freeze({ assertRequest: assertStreamChatRequest }),
  cancelChat: Object.freeze({ assertRequest: assertCancelChatRequest }),
})

module.exports = { assertModelStreamEvent, modelIpcContracts, normalizeModelConfig }
