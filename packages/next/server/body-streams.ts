import Primitives from 'next/dist/compiled/@edge-runtime/primitives'
import type { IncomingMessage } from 'http'
import { Readable } from 'stream'

type BodyStream = ReadableStream<Uint8Array>

/**
 * Creates a ReadableStream from a Node.js HTTP request
 */
export function requestToBodyStream(request: IncomingMessage): BodyStream {
  const transform = new Primitives.TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
      request.on('data', (chunk) => controller.enqueue(chunk))
      request.on('end', () => controller.terminate())
      request.on('error', (err) => controller.error(err))
    },
  })

  return transform.readable as unknown as ReadableStream<Uint8Array>
}

export function bodyStreamToNodeStream(bodyStream: BodyStream): Readable {
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

/**
 * An interface that encapsulates body stream cloning
 * of an incoming request.
 */
export function clonableBodyForRequest<T extends IncomingMessage>(
  incomingMessage: T
) {
  let bufferedBodyStream: BodyStream | null = null

  const endPromise = new Promise((resolve, reject) => {
    incomingMessage.on('end', resolve)
    incomingMessage.on('error', reject)
  })

  return {
    /**
     * Replaces the original request body if necessary.
     * This is done because once we read the body from the original request,
     * we can't read it again.
     */
    async finalize(): Promise<void> {
      if (bufferedBodyStream) {
        await endPromise
        replaceRequestBody(
          incomingMessage,
          bodyStreamToNodeStream(bufferedBodyStream)
        )
      }
    },
    /**
     * Clones the body stream
     * to pass into a middleware
     */
    cloneBodyStream(): BodyStream {
      const originalStream =
        bufferedBodyStream ?? requestToBodyStream(incomingMessage)
      const [stream1, stream2] = originalStream.tee()
      bufferedBodyStream = stream1
      return stream2
    },
  }
}
