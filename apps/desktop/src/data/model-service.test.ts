// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parseSse } = require('../../electron/model-service.cjs') as {
  parseSse: (stream: ReadableStream<Uint8Array>) => AsyncIterable<string>
}

describe('main-process model stream', () => {
  it('preserves multibyte text split across network chunks', async () => {
    const bytes = new TextEncoder().encode('data: {"text":"你好"}\n\ndata: [DONE]\n\n')
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // The split deliberately lands inside a UTF-8 character.
        controller.enqueue(bytes.slice(0, 17))
        controller.enqueue(bytes.slice(17, 19))
        controller.enqueue(bytes.slice(19))
        controller.close()
      },
    })
    const events: string[] = []
    for await (const event of parseSse(stream)) events.push(event)
    expect(events).toEqual(['{"text":"你好"}', '[DONE]'])
  })
})

