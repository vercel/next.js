import type { ServerResponse } from 'node:http'
import type { Readable } from 'node:stream'

import {
  ResponseAbortedName,
  createAbortController,
} from './web/spec-extension/adapters/next-request'
import { DetachedPromise } from '../lib/detached-promise'
import { getTracer } from './lib/trace/tracer'
import { NextNodeServerSpan } from './lib/trace/constants'
import { createOneShotTracePhase } from './lib/trace/phase'
import { getClientComponentLoaderMetrics } from './client-component-renderer-logger'

export function isAbortError(e: any): e is Error & { name: 'AbortError' } {
  return e?.name === 'AbortError' || e?.name === ResponseAbortedName
}

const HAS_CLIENT_COMPONENT_METRICS_ENABLED =
  'performance' in globalThis && process.env.NEXT_OTEL_PERFORMANCE_PREFIX

function createResponseClosedBeforeFirstChunkError(): Error {
  const error = new Error('Response closed before its first chunk')
  error.name = ResponseAbortedName
  return error
}

function trackFirstResponseChunk() {
  const finishPhase = createOneShotTracePhase(
    NextNodeServerSpan.waitForFirstResponseChunk,
    'wait for first response chunk'
  )

  return (error?: unknown) => {
    if (error === undefined) {
      finishPhase()
      return
    }

    finishPhase({
      error:
        error instanceof Error
          ? error
          : new Error('Response stream failed before its first chunk', {
              cause: error,
            }),
    })
  }
}

function createWriterFromResponse(
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>
): WritableStream<Uint8Array> {
  let started = false
  const completeFirstResponseChunk = trackFirstResponseChunk()

  // Create a promise that will resolve once the response has drained. See
  // https://nodejs.org/api/stream.html#stream_event_drain
  let drained = new DetachedPromise<void>()
  function onDrain() {
    drained.resolve()
  }
  res.on('drain', onDrain)

  // If the finish event fires, it means we shouldn't block and wait for the
  // drain event.
  res.once('close', () => {
    completeFirstResponseChunk(
      !started && !res.writableFinished
        ? createResponseClosedBeforeFirstChunkError()
        : undefined
    )
    res.off('drain', onDrain)
    drained.resolve()
  })

  // Create a promise that will resolve once the response has finished. See
  // https://nodejs.org/api/http.html#event-finish_1
  const finished = new DetachedPromise<void>()
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
        completeFirstResponseChunk()

        if (HAS_CLIENT_COMPONENT_METRICS_ENABLED) {
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
          },
          () => undefined
        )
      }

      try {
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
          drained = new DetachedPromise<void>()
        }
      } catch (err) {
        res.end()
        throw new Error('failed to write chunk to response', { cause: err })
      }
    },
    abort: (err) => {
      completeFirstResponseChunk(
        err ?? createResponseClosedBeforeFirstChunkError()
      )
      if (res.writableFinished) return

      res.destroy(err)
    },
    close: async () => {
      completeFirstResponseChunk()
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

export async function pipeNodeReadableToNodeResponse(
  readable: Readable,
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>
) {
  try {
    const { errored, destroyed } = res
    if (errored || destroyed) return

    let started = false
    const completeFirstResponseChunk = trackFirstResponseChunk()

    const finished = new DetachedPromise<void>()

    res.once('close', () => {
      completeFirstResponseChunk(
        !started && !res.writableFinished
          ? createResponseClosedBeforeFirstChunkError()
          : undefined
      )
      readable.destroy()
      finished.resolve()
    })

    readable.on('data', (chunk: Buffer) => {
      if (!started) {
        started = true
        completeFirstResponseChunk()

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
          },
          () => undefined
        )
      }

      const ok = res.write(chunk)

      if ('flush' in res && typeof res.flush === 'function') {
        res.flush()
      }

      if (!ok) {
        readable.pause()
        res.once('drain', () => {
          readable.resume()
        })
      }
    })

    readable.on('end', async () => {
      completeFirstResponseChunk()
      if (waitUntilForEnd) {
        await waitUntilForEnd
      }

      if (!res.writableFinished) {
        res.end()
      }

      finished.resolve()
    })

    readable.on('error', (err) => {
      completeFirstResponseChunk(err)
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
