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

/**
 * Pipes a Node.js Readable stream directly to a ServerResponse.
 * This avoids the overhead of wrapping in web WritableStream.
 */
export async function pipeNodeReadableToResponse(
  readable: import('node:stream').Readable,
  res: ServerResponse,
  waitUntilForEnd?: Promise<unknown>
) {
  // Guard so webpack can DCE node:stream require when the node-streams
  // runtime path is disabled.
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    try {
      const { errored, destroyed } = res
      if (errored || destroyed) return

      let started = false
      const finished = new DetachedPromise<void>()
      let pendingDrainCallback: ((error?: Error | null) => void) | null = null

      // Use a single drain listener for the entire response.
      //
      // The compression middleware proxies `res.on('drain', listener)` to an
      // internal Gzip stream. Repeated `res.once('drain', callback)` calls can
      // accumulate wrappers on that Gzip stream because `once` removal targets
      // `res`, not the proxied emitter.
      const onDrain = () => {
        const callback = pendingDrainCallback
        pendingDrainCallback = null
        callback?.()
      }
      res.on('drain', onDrain)

      const { Writable: NodeWritable } =
        require('node:stream') as typeof import('node:stream')

      const writable = new NodeWritable({
        write(chunk: Uint8Array, _encoding, callback) {
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

            if (!ok) {
              pendingDrainCallback = callback
            } else {
              callback()
            }
          } catch (err) {
            if (!res.writableFinished) {
              res.end()
            }
            // Destroy the readable to stop it from pushing more data
            if (!readable.destroyed) {
              readable.destroy()
            }
            callback(
              new Error('failed to write chunk to response', { cause: err })
            )
          }
        },
        final(callback) {
          if (waitUntilForEnd) {
            const finalize = () => {
              if (!res.writableFinished) {
                res.end()
              }
              callback()
              finished.resolve()
            }
            waitUntilForEnd.then(finalize, finalize)
          } else {
            if (!res.writableFinished) {
              res.end()
            }
            callback()
            finished.resolve()
          }
        },
        destroy(err, callback) {
          if (err && !res.writableFinished) {
            res.destroy(err)
          }
          callback(err)
          finished.resolve()
        },
      })

      // Handle client disconnect.
      //
      // When the client disconnects during backpressure, the failure chain is:
      //   1. res.write(chunk) returned false (backpressure)
      //   2. res.once('drain', callback) was registered to resume writing
      //   3. Client disconnects, res emits 'close'
      //   4. The 'drain' event will never fire on the closed response
      //
      // Node.js .pipe() does NOT propagate source destruction to the
      // destination, so destroying the readable alone is not enough:
      // the writable would stay alive waiting for a drain that never comes,
      // and finished.promise (awaited below) would never resolve.
      //
      // Destroying the writable triggers its destroy() handler above,
      // which calls finished.resolve() and unblocks the await.
      const onClose = () => {
        if (!readable.destroyed) {
          readable.destroy()
        }
        if (!writable.destroyed) {
          writable.destroy()
        }
      }
      res.once('close', onClose)

      // Forward errors since Node.js .pipe() does not propagate them.
      readable.on('error', (err) => {
        if (!writable.destroyed) {
          writable.destroy(err)
        }
      })

      readable.pipe(writable)

      await finished.promise
      res.off('close', onClose)
      res.off('drain', onDrain)
    } catch (err: any) {
      if (isAbortError(err)) return
      throw new Error('failed to pipe node readable to response', {
        cause: err,
      })
    }
  }
}
