import * as stream from 'stream'
import { sleep } from './sleep'

export function Readable() {
  const encoder = new TextEncoder()
  const readable = {
    i: 0,
    streamCleanedUp: false,
    stream: new stream.Readable({
      async read() {
        await sleep(100)
        this.push(encoder.encode(String(readable.i++)))

        if (readable.i >= 25) this.push(null)
      },
      destroy() {
        readable.streamCleanedUp = true
      },
    }),
  }
  return readable
}
