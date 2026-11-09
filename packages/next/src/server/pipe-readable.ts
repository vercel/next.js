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

/**
 * Returns a chunk of a web stream as a `Buffer` over the same memory: same
 * bytes, same offset, no copy.
 *
 * The `compression` middleware copies every chunk it is given that is not a
 * `Buffer` before it passes it to zlib. A copy of the body per response, in
 * an `ArrayBuffer` that V8 only stops counting as external memory when a GC
 * sweeps it, is enough to make V8 run major GCs where scavenges would do
 * while compressed responses are sent. `pipeNodeReadableToNodeResponse` below
 * hands over a `Buffer` for the same reason.
 *
 * Without the middleware nothing changes: a Node.js stream wraps a
 * `Uint8Array` it is given in the same view. With it, the response now
 * refers to the chunk's memory until zlib has read it, where it used to copy
 * it at once. That is what the response already does whenever it is not
 * compressed (the socket is corked until the next tick), so a stream must not
 * change a chunk after it has enqueued it either way.
 *
 * An empty chunk is passed on as it is: there is nothing to copy, and a view
 * cannot be created on a detached buffer, which has no bytes.
 *
 * So is a chunk that is not a `Uint8Array` of this realm. A stream can enqueue
 * any value, and the response decides what it accepts: a string is written,
 * anything else is reported as an invalid chunk.
 */
function toBufferView(chunk: Uint8Array): Uint8Array {
  if (
    !(chunk instanceof Uint8Array) ||
    chunk.byteLength === 0 ||
    Buffer.isBuffer(chunk)
  ) {
    return chunk
  }

  return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
}

/** What `pipeToNodeResponse` writes a body to: the underlying sink of a `WritableStream`. */
type ResponseSink = {
  write(chunk: Uint8Array): Promise<void>
  abort(err: any): void
  close(): Promise<void>
}

function createWriterFromResponse(
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>,
  clientComponentLoadTracker?: ClientComponentLoadTracker,
  sendSmallBodyWithLength: boolean = false
): ResponseSink {
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

  // Create the sink that writes to the response.
  return {
    write: async (chunk) => {
      chunk = toBufferView(chunk)

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
  }
}

/**
 * Pipes `readable` to `sink`, and stops when `signal` is aborted. It does what
 * `readable.pipeTo(new WritableStream(sink), { signal })` does, for a sink that
 * writes one chunk at a time:
 *
 * - a chunk is only read once the previous one has been written;
 * - when the readable is done, the sink is closed;
 * - when the readable errors, the sink is aborted with the error, which is
 *   then thrown;
 * - when the sink fails to write, the readable is cancelled with the error,
 *   which is then thrown;
 * - when the signal is aborted, the sink is aborted and the readable is
 *   cancelled with the reason, after a write in progress has finished, and
 *   the reason is thrown. If that write fails, its error is thrown and nothing
 *   else is done. Once the sink is closing the signal is ignored;
 * - an error from aborting the sink or from cancelling the readable replaces
 *   the error that would have been thrown.
 *
 * It reads the stream directly because a `WritableStream` and `pipeTo` cost
 * more than everything else that is done to send a small response, and what
 * they allocate keeps the response, and everything it references, alive
 * until the next major GC.
 */
async function pipeToSink(
  readable: ReadableStream<Uint8Array>,
  sink: ResponseSink,
  signal: AbortSignal
): Promise<void> {
  const reader = readable.getReader()

  let aborted = false
  let abortReason: unknown
  // What aborting the sink and cancelling the readable resulted in.
  let abortActions: Promise<unknown> | undefined
  let writing = false
  let closing = false

  function abort() {
    try {
      sink.abort(abortReason)
      abortActions = reader.cancel(abortReason)
    } catch (err) {
      abortActions = Promise.reject(err)
    }
    // It is awaited by the loop below, which may not have got there yet.
    abortActions.then(undefined, () => {})
  }

  function onAbort() {
    if (closing || aborted) return
    aborted = true
    abortReason = signal.reason
    // A write in progress is finished first.
    if (!writing) abort()
  }

  try {
    if (signal.aborted) {
      onAbort()
    } else {
      signal.addEventListener('abort', onAbort)
    }

    for (;;) {
      if (aborted) {
        await abortActions
        throw abortReason
      }

      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch (err) {
        if (aborted) {
          await abortActions
          throw abortReason
        }
        sink.abort(err)
        throw err
      }

      // Cancelling the readable finishes a read that was in progress.
      if (aborted) continue
      if (result.done) break

      writing = true
      try {
        await sink.write(result.value)
      } catch (err) {
        writing = false
        if (!aborted) {
          await reader.cancel(err)
        }
        throw err
      }
      writing = false

      if (aborted) abort()
    }

    closing = true
    await sink.close()
  } finally {
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
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

    if (getTracer().isTracing()) {
      // `pipeTo` hands a chunk to the sink in the async context of whoever
      // enqueued it, `pipeToSink` in the async context of this call. A span
      // that is started while writing (`start response`) is a child of the
      // span that is active there, so with tracing on the response is piped
      // as before.
      await readable.pipeTo(new WritableStream(writer), {
        signal: controller.signal,
      })
    } else {
      await pipeToSink(readable, writer, controller.signal)
    }
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
