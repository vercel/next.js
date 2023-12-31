import { Deferred, sleep } from './sleep'

export function Streamable(write: number) {
  const encoder = new TextEncoder()
  const cleanedUp = new Deferred()
  const aborted = new Deferred()
  let i = 0

  const streamable = {
    finished: Promise.all([cleanedUp.promise, aborted.promise]).then(() => i),

    abort() {
      aborted.resolve()
    },
    stream: new ReadableStream({
      async pull(controller) {
        if (i >= write) {
          return
        }

        await sleep(100)
        controller.enqueue(encoder.encode(String(i++)))
      },
      cancel() {
        cleanedUp.resolve()
      },
    }),
  }
  return streamable
}
