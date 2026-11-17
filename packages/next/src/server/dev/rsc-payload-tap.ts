/**
 * Development-only observation of the RSC (Flight) payload sent to the
 * browser, recorded in Request Insights as an estimated size.
 *
 * Observation never changes the response: chunks are forwarded unchanged and
 * on demand, failures are contained, and the payload is only analyzed in a
 * later task after the stream's end, error or cancellation was forwarded.
 */

import type { Readable } from 'node:stream'
import type { AnyStream } from '../app-render/stream-ops'
import { getRequestInsightsIdentity } from '../lib/trace/request-insights-identity'
import { recordRequestInsightRscPayload } from '../lib/trace/request-insights'
import { isRequestInsightsEnabled } from '../lib/trace/span-store'
import { RscPayloadAnalyzer } from './rsc-payload-analysis'

const MODULE_PATH_PREFIX_KEY = Symbol.for('next.dev.rscPayloadModulePathPrefix')

/**
 * Sets the project directory relative to the bundler root, so client module
 * paths can be shown relative to the project (e.g. in monorepos).
 */
export function configureRscPayloadModulePathPrefix(prefix: string): void {
  ;(globalThis as any)[MODULE_PATH_PREFIX_KEY] = prefix
    .split(/[\\/]+/)
    .filter(Boolean)
    .join('/')
}

function normalizeModulePath(modulePath: string): string {
  const prefix: string | undefined = (globalThis as any)[MODULE_PATH_PREFIX_KEY]
  return prefix && modulePath.startsWith(`${prefix}/`)
    ? modulePath.slice(prefix.length + 1)
    : modulePath
}

type Observer = {
  write(chunk: Uint8Array | string): void
  finish(complete: boolean): void
}

/**
 * Wraps a Flight stream that is about to be sent to the browser so its size
 * is recorded on the current request's Request Insight. Returns the stream
 * unchanged when there's no regular request to attribute it to.
 */
export function tapRscPayloadForRequestInsights(stream: AnyStream): AnyStream {
  if (!isRequestInsightsEnabled()) {
    return stream
  }
  const identity = getRequestInsightsIdentity()
  // Instant Insights validation renders have their own identity; only the
  // payload of the user's request is relevant.
  if (!identity || (identity.kind && identity.kind !== 'request')) {
    return stream
  }

  const analyzer = new RscPayloadAnalyzer({ normalizeModulePath })
  let failed = false
  let finished = false
  const observer: Observer = {
    write(chunk) {
      if (failed || finished) {
        return
      }
      try {
        analyzer.write(chunk)
      } catch {
        failed = true
      }
    },
    finish(complete) {
      if (finished) {
        return
      }
      finished = true
      // Analyze in a later task so the end reaches the consumer first.
      setImmediate(() => {
        try {
          recordRequestInsightRscPayload(
            identity,
            failed
              ? { status: 'unavailable', unavailableReason: 'parse-error' }
              : analyzer.end(complete)
          )
        } catch {
          // Diagnostics must never affect the response.
        }
      })
    },
  }

  if (stream instanceof ReadableStream) {
    return tapWebStream(stream, observer)
  }
  tapNodeStream(stream as Readable, observer)
  return stream
}

function tapWebStream(
  source: ReadableStream<Uint8Array>,
  observer: Observer
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        let result: ReadableStreamReadResult<Uint8Array>
        try {
          result = await reader.read()
        } catch (error) {
          controller.error(error)
          observer.finish(false)
          return
        }
        if (result.done) {
          controller.close()
          observer.finish(true)
          return
        }
        observer.write(result.value)
        controller.enqueue(result.value)
      },
      cancel(reason) {
        observer.finish(false)
        return reader.cancel(reason)
      },
    },
    // Pull only when the consumer does, so backpressure is unchanged.
    { highWaterMark: 0 }
  )
}

/**
 * Observes a Node.js readable in place: the consumer keeps reading the same
 * stream, with the same buffering, backpressure and error behavior.
 *
 * The chunks are observed as they're delivered to the consumer. Readable emits
 * `data` for every chunk it hands out, both in flowing mode and from `read()`,
 * so this also covers chunks that were already buffered when the tap was
 * installed. Intercepting the emit doesn't add a listener, which would switch
 * the stream to flowing mode.
 */
function tapNodeStream(source: Readable, observer: Observer): void {
  const emit = source.emit
  source.emit = function (
    this: Readable,
    event: string | symbol,
    ...args: any[]
  ) {
    if (event === 'data') {
      observer.write(args[0])
    }
    return emit.call(this, event, ...args)
  } as Readable['emit']
  // `end` fires once the consumer has read everything; `close` without `end`
  // means the stream errored or was destroyed. Neither listener changes how
  // the stream flows or how its errors surface.
  source.once('end', () => observer.finish(true))
  source.once('close', () => observer.finish(false))
}
