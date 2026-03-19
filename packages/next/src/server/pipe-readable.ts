import type { ServerResponse } from 'node:http'

import {
  ResponseAbortedName,
  createAbortController,
} from './web/spec-extension/adapters/next-request'
import { DetachedPromise } from '../lib/detached-promise'
import { getTracer } from './lib/trace/tracer'
import { NextNodeServerSpan } from './lib/trace/constants'
import { getClientComponentLoaderMetrics } from './client-component-renderer-logger'

export function isAbortError(e: any): e is Error & { name: 'AbortError' } {
  return e?.name === 'AbortError' || e?.name === ResponseAbortedName
}

function createWriterFromResponse(
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>
): WritableStream<Uint8Array> {
  let started = false

  // Lazily created on first backpressure event. For typical responses
  // (< ~64KB), res.write() never returns false so this is never allocated.
  let drained: DetachedPromise<void> | undefined

  function onDrain() {
    drained?.resolve()
  }

  // If the response closes, resolve any pending drain wait and stop listening.
  res.once('close', () => {
    res.off('drain', onDrain)
    drained?.resolve()
  })

  // Create a promise that will resolve once the response has finished. See
  // https://nodejs.org/api/http.html#event-finish_1
  const finished = new DetachedPromise<void>()
  res.once('finish', () => {
    finished.resolve()
  })

  // Cache the flush check once instead of per-chunk. The `flush` method is
  // added by the `compression` middleware and won't appear/disappear mid-request.
  const flushFn =
    'flush' in res && typeof (res as any).flush === 'function'
      ? (res as any).flush.bind(res)
      : null

  // Create a writable stream that will write to the response.
  return new WritableStream<Uint8Array>({
    write: async (chunk) => {
      // You'd think we'd want to use `start` instead of placing this in `write`
      // but this ensures that we don't actually flush the headers until we've
      // started writing chunks.
      if (!started) {
        started = true

        if (
          'performance' in globalThis &&
          process.env.NEXT_OTEL_PERFORMANCE_PREFIX
        ) {
          const metrics = getClientComponentLoaderMetrics()
          if (metrics) {
            performance.measure(
              `${process.env.NEXT_OTEL_PERFORMANCE_PREFIX}:next-client-component-loading`,
              {
                start: metrics.clientComponentLoadStart,
                end:
                  metrics.clientComponentLoadStart +
                  metrics.clientComponentLoadTimes,
              }
            )
          }
        }

        res.flushHeaders()
        getTracer().trace(
          NextNodeServerSpan.startResponse,
          {
            spanName: 'start response',
            hideSpan: true,
          },
          () => undefined
        )
      }

      try {
        const ok = res.write(chunk)

        // Flush the partially-compressed response to the client.
        if (flushFn) {
          flushFn()
        }

        // If the write returns false, it means there's some backpressure, so
        // wait until it's streamed before continuing.
        if (!ok) {
          if (!drained) {
            drained = new DetachedPromise<void>()
            res.on('drain', onDrain)
          }
          await drained.promise

          // Reset the drained promise so that we can wait for the next drain event.
          drained = new DetachedPromise<void>()
        }
      } catch (err) {
        res.end()
        throw new Error('failed to write chunk to response', { cause: err })
      }
    },
    abort: (err) => {
      if (res.writableFinished) return

      res.destroy(err)
    },
    close: async () => {
      // if a waitUntil promise was passed, wait for it to resolve before
      // ending the response.
      if (waitUntilForEnd) {
        await waitUntilForEnd
      }

      if (res.writableFinished) return

      res.end()
      return finished.promise
    },
  })
}

export async function pipeToNodeResponse(
  readable: ReadableStream<Uint8Array>,
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>
) {
  try {
    // If the response has already errored, then just return now.
    const { errored, destroyed } = res
    if (errored || destroyed) return

    // Create a new AbortController so that we can abort the readable if the
    // client disconnects.
    const controller = createAbortController(res)

    const writer = createWriterFromResponse(res, waitUntilForEnd)

    await readable.pipeTo(writer, { signal: controller.signal })
  } catch (err: any) {
    // If this isn't related to an abort error, re-throw it.
    if (isAbortError(err)) return

    throw new Error('failed to pipe response', { cause: err })
  }
}
