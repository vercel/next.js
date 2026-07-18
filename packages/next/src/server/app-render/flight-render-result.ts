import { RSC_CONTENT_TYPE_HEADER } from '../../client/components/app-router-headers'
import RenderResult, { type RenderResultMetadata } from '../render-result'
import type { AnyStream } from './stream-ops'
import { getCurrentChunksDict } from './manifests-singleton'
import { PassThrough, Readable } from 'node:stream'

function prependToWebStream(
  stream: ReadableStream<Uint8Array>,
  prefix: string
): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  const encoder = new TextEncoder()
  let prefixSent = false
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!prefixSent) {
        controller.enqueue(encoder.encode(prefix))
        prefixSent = true
        return
      }
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

function prependToNodeStream(stream: Readable, prefix: string): Readable {
  const pt = new PassThrough()
  pt.write(Buffer.from(prefix))
  stream.pipe(pt)
  return pt
}

function prependToStream(stream: any, prefix: string): any {
  if (
    typeof ReadableStream !== 'undefined' &&
    stream instanceof ReadableStream
  ) {
    return prependToWebStream(stream, prefix)
  }
  if (stream instanceof Readable) {
    return prependToNodeStream(stream as Readable, prefix)
  }
  return stream
}

export function prependFlightChunksDictionaryToBuffer(payload: Buffer): Buffer {
  const chunksDictionary = getCurrentChunksDict()
  if (!chunksDictionary || Object.keys(chunksDictionary).length === 0) {
    return payload
  }

  const prefix = Buffer.from(
    `__next_chunks_dict__:${JSON.stringify(chunksDictionary)}\n`
  )
  // Cache Components place a completeness marker before the Flight rows.
  // Keep it as the first byte so both the cache and Flight decoders see the
  // framing they expect.
  if (payload[0] === 0x23 || payload[0] === 0x7e) {
    return Buffer.concat([payload.subarray(0, 1), prefix, payload.subarray(1)])
  }
  return Buffer.concat([prefix, payload])
}

/**
 * Flight Response is always set to RSC_CONTENT_TYPE_HEADER to ensure it does not get interpreted as HTML.
 */
export class FlightRenderResult extends RenderResult {
  constructor(
    response: string | AnyStream,
    metadata: RenderResultMetadata = {},
    waitUntil?: Promise<unknown>
  ) {
    let payload = response
    try {
      const chunksDictionary = getCurrentChunksDict()
      if (chunksDictionary && Object.keys(chunksDictionary).length > 0) {
        const prefix = `__next_chunks_dict__:${JSON.stringify(chunksDictionary)}\n`
        if (typeof payload === 'string') {
          payload = prefix + payload
        } else {
          payload = prependToStream(payload, prefix)
        }
      }
    } catch (e) {
      // ignore
    }

    super(payload, {
      contentType: RSC_CONTENT_TYPE_HEADER,
      metadata,
      waitUntil,
    })
  }
}
