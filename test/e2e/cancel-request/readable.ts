import * as stream from 'stream'
import { Deferred, sleep } from './sleep'

export function Readable(write: number) {
  const encoder = new TextEncoder()
  const cleanedUp = new Deferred()
  const aborted = new Deferred()
  let i = 0

  const readable = {
    finished: Promise.all([cleanedUp.promise, aborted.promise]).then(() => i),

    abort() {
      aborted.resolve()
    },
    stream: new stream.Readable({
      async read() {
        if (i >= write) {
          return
        }

        await sleep(100)
        this.push(encoder.encode(String(i++)))
      },
      destroy() {
        cleanedUp.resolve()
      },
    }),
  }
  return readable
}
