import type { IncomingMessage } from 'http'
import type { Readable } from 'stream'
import { PassThrough } from 'stream'
import bytes from 'next/dist/compiled/bytes'

const DEFAULT_BODY_CLONE_SIZE_LIMIT = 10 * 1024 * 1024 // 10MB

export function requestToBodyStream(
  context: { ReadableStream: typeof ReadableStream },
  KUint8Array: typeof Uint8Array,
  stream: Readable
) {
  return new context.ReadableStream({
    start: async (controller) => {
      for await (const chunk of stream) {
        controller.enqueue(new KUint8Array(chunk))
      }
      controller.close()
    },
  })
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

export interface CloneableBody {
  finalize(): Promise<void>
  cloneBodyStream(): Readable
}

export function getCloneableBody<T extends IncomingMessage>(
  readable: T,
  sizeLimit?: number
): CloneableBody {
  let buffered: Readable | null = null

  const endPromise = new Promise<void | { error?: unknown }>(
    (resolve, reject) => {
      readable.on('end', resolve)
      readable.on('error', reject)
    }
  ).catch((error) => {
    return { error }
  })

  return {
    /**
     * Replaces the original request body if necessary.
     * This is done because once we read the body from the original request,
     * we can't read it again.
     */
    async finalize(): Promise<void> {
      if (buffered) {
        const res = await endPromise

        if (res && typeof res === 'object' && res.error) {
          throw res.error
        }
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

      let bytesRead = 0
      const bodySizeLimit = sizeLimit ?? DEFAULT_BODY_CLONE_SIZE_LIMIT
      let limitExceeded = false

      input.on('data', (chunk) => {
        if (limitExceeded) return

        bytesRead += chunk.length

        if (bytesRead > bodySizeLimit) {
          limitExceeded = true
          const urlInfo = readable.url ? ` for ${readable.url}` : ''
          console.warn(
            // TODO(jiwon): Update this document link
            `Request body exceeded ${bytes.format(bodySizeLimit)}${urlInfo}. Only the first ${bytes.format(bodySizeLimit)} will be available unless configured. See https://nextjs.org/docs/app/api-reference/config/next-config-js/middlewareClientMaxBodySize for more details.`
          )
          p1.push(null)
          p2.push(null)
          return
        }

        p1.push(chunk)
        p2.push(chunk)
      })
      input.on('end', () => {
        if (!limitExceeded) {
          p1.push(null)
          p2.push(null)
        }
      })
      buffered = p2
      return p1
    },
  }
}
