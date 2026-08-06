export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface ModelRequest {
  messages: ModelMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export type ModelStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }
  | { type: 'done' }

export interface ModelProvider {
  readonly id: string
  readonly model: string
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>
}

export interface OpenAICompatibleConfig {
  id: string
  baseUrl: string
  apiKey?: string
  model: string
  headers?: Record<string, string>
}

export class ModelGatewayError extends Error {
  constructor(
    message: string,
    readonly kind: 'configuration' | 'authentication' | 'rate-limit' | 'provider' | 'network' | 'protocol',
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ModelGatewayError'
  }
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string
  readonly model: string
  private readonly endpoint: string

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.id = config.id
    this.model = config.model
    const url = parseHttpUrl(config.baseUrl)
    this.endpoint = new URL('chat/completions', ensureTrailingSlash(url)).toString()
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    let response: Response
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        signal: request.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
          ...this.config.headers,
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          stream: true,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          stream_options: { include_usage: true },
        }),
      })
    } catch (error) {
      throw new ModelGatewayError(error instanceof Error ? error.message : 'Network request failed.', 'network')
    }

    if (!response.ok) throw classifyHttpError(response.status)
    if (!response.body) throw new ModelGatewayError('Provider returned no stream body.', 'protocol')

    for await (const payload of parseServerSentEvents(response.body)) {
      if (payload === '[DONE]') break
      let event: OpenAIChunk
      try {
        event = JSON.parse(payload) as OpenAIChunk
      } catch {
        throw new ModelGatewayError('Provider returned invalid JSON in its event stream.', 'protocol')
      }
      const text = event.choices?.[0]?.delta?.content
      if (text) yield { type: 'text-delta', text }
      if (event.usage) yield { type: 'usage', inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens }
    }
    yield { type: 'done' }
  }
}

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** Parses arbitrary network chunk boundaries; one SSE event may span chunks. */
export async function* parseServerSentEvents(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split(/\r?\n\r?\n/u)
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const data = frame.split(/\r?\n/u).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
        if (data) yield data
      }
      if (done) break
    }
    if (buffer.trim()) {
      const data = buffer.split(/\r?\n/u).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
      if (data) yield data
    }
  } finally {
    reader.releaseLock()
  }
}

function parseHttpUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new ModelGatewayError('Model base URL is invalid.', 'configuration') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ModelGatewayError('Model base URL must use HTTP or HTTPS.', 'configuration')
  return url
}

function ensureTrailingSlash(url: URL) {
  const copy = new URL(url)
  if (!copy.pathname.endsWith('/')) copy.pathname += '/'
  return copy
}

function classifyHttpError(status: number) {
  if (status === 401 || status === 403) return new ModelGatewayError('Model provider rejected the credentials.', 'authentication', status)
  if (status === 429) return new ModelGatewayError('Model provider rate limit reached.', 'rate-limit', status)
  return new ModelGatewayError(`Model provider returned HTTP ${status}.`, 'provider', status)
}

