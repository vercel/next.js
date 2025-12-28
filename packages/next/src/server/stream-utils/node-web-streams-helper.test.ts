import {
  createMoveSuffixStream,
  streamToString,
} from './node-web-streams-helper'
function streamFromChunks(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
}

describe('createMoveSuffixStream', () => {
  it('duplicates closing tags when suffix spans chunks', async () => {
    const input = streamFromChunks(['<html><body>Hello</bo', 'dy></html>'])

    const output = input.pipeThrough(createMoveSuffixStream())
    const result = await streamToString(output)

    expect(result).toBe(
      '<html><body>Hello</body></html>' // ❌ this will FAIL
    )
  })
})
