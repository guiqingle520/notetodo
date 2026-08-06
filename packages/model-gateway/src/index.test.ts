import { describe, expect, it } from 'vitest'
import { ModelGatewayError, OpenAICompatibleProvider, parseServerSentEvents } from './index'

describe('model gateway', () => {
  it('rejects non-http custom endpoints', () => {
    expect(() => new OpenAICompatibleProvider({ id: 'bad', baseUrl: 'file:///secret', model: 'x' })).toThrow(ModelGatewayError)
  })

  it('parses SSE events split across arbitrary byte chunks', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"del'))
        controller.enqueue(encoder.encode('ta":{"content":"你"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const events: string[] = []
    for await (const event of parseServerSentEvents(stream)) events.push(event)
    expect(events).toEqual(['{"choices":[{"delta":{"content":"你"}}]}', '[DONE]'])
  })
})

