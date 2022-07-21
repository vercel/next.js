import type { IncomingMessage } from 'http'
import { PassThrough, Readable } from 'stream'

export function requestToBodyStream(
  context: { ReadableStream: typeof ReadableStream },
  stream: Readable
) {
  return new context.ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk))
      stream.on('end', () => controller.close())
      stream.on('error', (err) => controller.error(err))
    },
  })
}

export function bodyStreamToNodeStream(
  bodyStream: ReadableStream<Uint8Array>
): Readable {
  const reader = bodyStream.getReader()
  return Readable.from(
    (async function* () {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          return
        }
        yield value
      }
    })()
  )
}

function replaceRequestBody<T extends IncomingMessage>(
  base: T,
  stream: Readable
): T {
  for (const key in stream) {
    let v = stream[key as keyof Readable] as any
    if (typeof v === 'function') {
      v = v.bind(base)
    }
    base[key as keyof T] = v
  }

  return base
}

export interface ClonableBody {
  finalize(): Promise<void>
  cloneBodyStream(): Readable
}

export function getClonableBody<T extends IncomingMessage>(
  readable: T
): ClonableBody {
  let buffered: Readable | null = null

  const endPromise = new Promise((resolve, reject) => {
    readable.on('end', resolve)
    readable.on('error', reject)
  })

  return {
    /**
     * Replaces the original request body if necessary.
     * This is done because once we read the body from the original request,
     * we can't read it again.
     */
    async finalize(): Promise<void> {
      if (buffered) {
        await endPromise
        replaceRequestBody(readable, buffered)
        buffered = readable
      }
    },
    /**
     * Clones the body stream
     * to pass into a middleware
     */
    cloneBodyStream() {
      const input = buffered ?? readable
      const p1 = new PassThrough()
      const p2 = new PassThrough()
      input.pipe(p1)
      input.pipe(p2)
      buffered = p2
      return p1
    },
  }
}
