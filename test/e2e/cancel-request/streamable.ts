import { sleep } from './sleep'

export function Streamable() {
  const encoder = new TextEncoder()
  const streamable = {
    i: 0,
    streamCleanedUp: false,
    stream: new ReadableStream({
      async pull(controller) {
        await sleep(100)
        controller.enqueue(encoder.encode(String(streamable.i++)))

        if (streamable.i >= 25) controller.close()
      },
      cancel() {
        streamable.streamCleanedUp = true
      },
    }),
  }
  return streamable
}
