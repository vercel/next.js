import { RSC_CONTENT_TYPE_HEADER } from '../../client/components/app-router-headers'
import RenderResult, { type RenderResultMetadata } from '../render-result'
import type { AnyStream } from './stream-ops'
import {
  getClientReferenceManifest,
  getChunksDictForManifest,
} from './manifests-singleton'
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
      const manifest = getClientReferenceManifest()
      const dictEntry = getChunksDictForManifest(manifest)
      if (dictEntry && Object.keys(dictEntry.dict).length > 0) {
        const prefix = `__next_chunks_dict__:${JSON.stringify(dictEntry.dict)}\n`
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
