import type { ServerResponse } from 'node:http'
import type { Readable } from 'node:stream'

import {
  ResponseAbortedName,
  createAbortController,
} from './web/spec-extension/adapters/next-request'
import { createPromiseWithResolvers } from '../shared/lib/promise-with-resolvers'
import { getTracer } from './lib/trace/tracer'
import { NextNodeServerSpan } from './lib/trace/constants'
import type { ClientComponentLoadTracker } from './client-component-renderer-logger'

export function isAbortError(e: any): e is Error & { name: 'AbortError' } {
  return e?.name === 'AbortError' || e?.name === ResponseAbortedName
}

const HAS_CLIENT_COMPONENT_METRICS_ENABLED =
  'performance' in globalThis && process.env.NEXT_OTEL_PERFORMANCE_PREFIX

// The default `threshold` of the `compression` middleware, which is how the
// router server sets it up: a response whose `Content-Length` is known and
// below it is not compressed.
const SMALL_BODY_BYTES = 1024

function createWriterFromResponse(
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>,
  clientComponentLoadTracker?: ClientComponentLoadTracker,
  sendSmallBodyWithLength: boolean = false
): WritableStream<Uint8Array> {
  let started = false

  // A streamed body has no known length, so the compression middleware
  // compresses it whatever its size, even a body of a few bytes that grows
  // when compressed. With `sendSmallBodyWithLength`, and only while that
  // middleware is active, a first chunk below its size threshold is held back
  // until the next tick. A body that is already in memory (a string, a
  // buffer, `Response.json()`) closes its stream before that, and then the
  // chunk is the whole body: it is sent with `res.end()` and a
  // `Content-Length`, so the middleware's threshold applies to it, as it does
  // to a Pages API response. If the stream is still open on the next tick,
  // the chunk is written and the response is streamed as before.
  let held: Uint8Array | undefined

  function startResponse() {
    res.flushHeaders()
    getTracer().trace(
      NextNodeServerSpan.startResponse,
      {
        spanName: 'start response',
      },
      () => undefined
    )
  }

  function writeHeld() {
    if (held === undefined) return
    const chunk = held
    held = undefined
    startResponse()
    res.write(chunk)
    if ('flush' in res && typeof res.flush === 'function') {
      res.flush()
    }
  }

  function writeHeldOnNextTick() {
    try {
      writeHeld()
    } catch (err) {
      res.destroy(err as Error)
    }
  }

  // Create a promise that will resolve once the response has drained. See
  // https://nodejs.org/api/stream.html#stream_event_drain
  let drained = createPromiseWithResolvers<void>()
  function onDrain() {
    drained.resolve()
  }
  res.on('drain', onDrain)

  // If the finish event fires, it means we shouldn't block and wait for the
  // drain event.
  res.once('close', () => {
    res.off('drain', onDrain)
    drained.resolve()
  })

  // Create a promise that will resolve once the response has finished. See
  // https://nodejs.org/api/http.html#event-finish_1
  const finished = createPromiseWithResolvers<void>()
  res.once('finish', () => {
    finished.resolve()
  })

  // Create a writable stream that will write to the response.
  return new WritableStream<Uint8Array>({
    write: async (chunk) => {
      // You'd think we'd want to use `start` instead of placing this in `write`
      // but this ensures that we don't actually flush the headers until we've
      // started writing chunks.
      if (!started) {
        started = true

        if (HAS_CLIENT_COMPONENT_METRICS_ENABLED) {
          const metrics = clientComponentLoadTracker?.snapshot()
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

        // This module is also bundled for the Edge runtime, which has neither
        // the compression middleware nor `process.nextTick`. The branch that
        // uses it has to be the `else` of this check to be removed there.
        if (process.env.NEXT_RUNTIME === 'edge') {
          // Nothing is held back.
        } else if (
          sendSmallBodyWithLength &&
          chunk.byteLength > 0 &&
          chunk.byteLength < SMALL_BODY_BYTES &&
          // Added by the `compression` middleware. Without it nothing would
          // be compressed and the response is left as it is.
          'flush' in res &&
          typeof res.flush === 'function' &&
          !res.headersSent &&
          !res.hasHeader('content-length') &&
          !res.hasHeader('content-encoding') &&
          !res.hasHeader('transfer-encoding')
        ) {
          held = chunk
          process.nextTick(writeHeldOnNextTick)
          return
        }

        startResponse()
      }

      try {
        writeHeld()

        const ok = res.write(chunk)

        // Added by the `compression` middleware, this is a function that will
        // flush the partially-compressed response to the client.
        if ('flush' in res && typeof res.flush === 'function') {
          res.flush()
        }

        // If the write returns false, it means there's some backpressure, so
        // wait until it's streamed before continuing.
        if (!ok) {
          await drained.promise

          // Reset the drained promise so that we can wait for the next drain event.
          drained = createPromiseWithResolvers<void>()
        }
      } catch (err) {
        res.end()
        throw new Error('failed to write chunk to response', { cause: err })
      }
    },
    abort: (err) => {
      held = undefined
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

      if (held !== undefined) {
        // The held chunk is the whole body.
        const chunk = held
        held = undefined
        res.setHeader('Content-Length', chunk.byteLength)
        getTracer().trace(
          NextNodeServerSpan.startResponse,
          {
            spanName: 'start response',
          },
          () => undefined
        )
        res.end(chunk)
      } else {
        res.end()
      }
      return finished.promise
    },
  })
}

export async function pipeToNodeResponse(
  readable: ReadableStream<Uint8Array>,
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>,
  clientComponentLoadTracker?: ClientComponentLoadTracker,
  sendSmallBodyWithLength: boolean = false
) {
  try {
    // If the response has already errored, then just return now.
    const { errored, destroyed } = res
    if (errored || destroyed) return

    // Create a new AbortController so that we can abort the readable if the
    // client disconnects.
    const controller = createAbortController(res)

    const writer = createWriterFromResponse(
      res,
      waitUntilForEnd,
      clientComponentLoadTracker,
      sendSmallBodyWithLength
    )

    await readable.pipeTo(writer, { signal: controller.signal })
  } catch (err: any) {
    // If this isn't related to an abort error, re-throw it.
    if (isAbortError(err)) return

    throw new Error('failed to pipe response', { cause: err })
  }
}

export async function pipeNodeReadableToNodeResponse(
  readable: Readable,
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>,
  clientComponentLoadTracker?: ClientComponentLoadTracker
) {
  try {
    const { errored, destroyed } = res
    if (errored || destroyed) return

    let started = false

    const finished = createPromiseWithResolvers<void>()

    // One `drain` listener for the whole response, as in
    // `createWriterFromResponse` above. It must not be `res.once('drain')` per
    // backpressured write: the `compression` middleware forwards `res.on` to
    // its zlib stream but leaves `removeListener` pointing at the response, so
    // a `once` listener is never removed from the stream it was added to. Each
    // backpressured write would leak one, and past ten Node reports the stream
    // as a probable leak via `MaxListenersExceededWarning`.
    //
    // TODO: the upstream fix for that asymmetry is
    // https://github.com/expressjs/compression/pull/153, which intercepts
    // `removeListener` so it reaches the zlib stream. It has been open since
    // 2019 and is not in upstream 1.8.1; we vendor 1.7.4. If it ever lands and
    // we upgrade, `res.off('drain', onDrain)` below would start working with
    // compression active and the caveat on the `close` handler could go away.
    let paused = false
    const onDrain = () => {
      // The listener outlives the readable: `off` below cannot reach the zlib
      // stream either, so a late drain can arrive after teardown.
      if (!paused || readable.destroyed) return

      paused = false
      readable.resume()
    }
    res.on('drain', onDrain)

    res.once('close', () => {
      // Only removes the listener when compression is inactive, which is the
      // case where it was added to the response itself. Otherwise it lives on
      // the zlib stream, which is released with the response.
      res.off('drain', onDrain)
      readable.destroy()
      finished.resolve()
    })

    readable.on('data', (chunk: string | Uint8Array) => {
      // Object-mode readables carry strings and raw views. Custom servers
      // wrap `res.write` and may assume `Buffer.isBuffer(chunk)`.
      if (typeof chunk === 'string') {
        chunk = Buffer.from(chunk)
      } else if (!Buffer.isBuffer(chunk)) {
        chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      }

      if (!started) {
        started = true

        if (
          'performance' in globalThis &&
          process.env.NEXT_OTEL_PERFORMANCE_PREFIX
        ) {
          const metrics = clientComponentLoadTracker?.snapshot()
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
          },
          () => undefined
        )
      }

      const ok = res.write(chunk)

      if ('flush' in res && typeof res.flush === 'function') {
        res.flush()
      }

      if (!ok) {
        paused = true
        readable.pause()
      }
    })

    readable.on('end', async () => {
      if (waitUntilForEnd) {
        await waitUntilForEnd
      }

      if (!res.writableFinished) {
        res.end()
      }

      finished.resolve()
    })

    readable.on('error', (err) => {
      if (isAbortError(err)) {
        finished.resolve()
        return
      }

      res.destroy(err)
      finished.resolve()
    })

    await finished.promise
  } catch (err: any) {
    if (isAbortError(err)) return

    throw new Error('failed to pipe response', { cause: err })
  }
}
