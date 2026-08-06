/**
 * Main-process model runtime. API keys never cross IPC; the renderer receives
 * only normalized stream events that are safe to display or audit.
 */
class ModelService {
  async stream(config, apiKey, request, signal, emit) {
    const endpoint = new URL('chat/completions', config.baseUrl.endsWith('/') ? config.baseUrl : `${config.baseUrl}/`)
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: request.messages,
          stream: true,
          temperature: request.temperature ?? 0.4,
          stream_options: { include_usage: true },
        }),
      })
    } catch (error) {
      if (signal.aborted) return emit({ type: 'cancelled' })
      throw new Error(`无法连接模型：${error instanceof Error ? error.message : '网络错误'}`)
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      throw new Error(`模型返回 HTTP ${response.status}${detail ? `：${detail}` : ''}`)
    }
    if (!response.body) throw new Error('模型没有返回流式响应。')

    try {
      for await (const data of parseSse(response.body)) {
        if (data === '[DONE]') break
        let chunk
        try { chunk = JSON.parse(data) } catch { throw new Error('模型返回了无效的流式 JSON。') }
        const text = chunk.choices?.[0]?.delta?.content
        if (text) emit({ type: 'text-delta', text })
        if (chunk.usage) emit({ type: 'usage', inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens })
      }
    } catch (error) {
      // Aborting while the response body is being read rejects the reader too;
      // surface it as intentional cancellation rather than a provider failure.
      if (signal.aborted) return emit({ type: 'cancelled' })
      throw error
    }
    if (!signal.aborted) emit({ type: 'done' })
  }
}

/** SSE frames may be split at any byte boundary, including inside UTF-8 text. */
async function* parseSse(stream) {
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
  } finally {
    reader.releaseLock()
  }
}

module.exports = { ModelService, parseSse }
