/**
 * Node.js native stream utilities for the Next.js render pipeline.
 *
 * These are the Node.js `stream` equivalents of the WhatWG stream helpers
 * in `node-web-streams-helper.ts`. Using Node.js native streams avoids the
 * overhead of WhatWG stream polyfills and the web-to-node conversion layer,
 * which profiling shows accounts for 35%+ of CPU time in SSR workloads.
 *
 * **ALS context propagation**: All stream callbacks use `bindSnapshot()` from
 * `async-local-storage.ts` to capture and restore the current
 * `AsyncLocalStorage` context. This ensures that request-scoped stores
 * (workUnitAsyncStorage, workAsyncStorage, etc.) remain accessible in
 * transform callbacks even when they execute in a different async context
 * (e.g. via `setImmediate` or `process.nextTick`).
 *
 * This addresses the review feedback from @lubieowoce on PRs #89859/#90500
 * where ALS context was incorrectly propagated by wrapping the callback
 * return value rather than binding the callback itself.
 *
 * **Edge/DCE safety**: `node:stream` is loaded lazily via `require()` so
 * that this module can be safely imported (and tree-shaken) in Edge and
 * client bundles without causing a hard failure at import time.
 */

import type { Transform, Readable } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { bindSnapshot } from '../app-render/async-local-storage'
import { DetachedPromise } from '../../lib/detached-promise'
import { scheduleImmediate } from '../../lib/scheduler'

// ---------------------------------------------------------------------------
// Lazy node:stream accessor (Edge/DCE-safe)
// ---------------------------------------------------------------------------

/**
 * Lazily loads `node:stream` at runtime. This avoids a top-level import that
 * would break Edge runtime and prevents Webpack/Turbopack from pulling the
 * module into client bundles.
 */
function getNodeStream(): typeof import('node:stream') {
  return require('node:stream') as typeof import('node:stream')
}

// ---------------------------------------------------------------------------
// safePipe – error-forwarding pipe helper
// ---------------------------------------------------------------------------

/**
 * Pipes `source` into `dest` while ensuring errors on the source stream
 * are forwarded to the destination. The built-in `.pipe()` does NOT forward
 * errors, so without this helper an erroring source can leave the
 * destination hanging.
 */
function safePipe<T extends Transform>(
  source: Readable,
  dest: T,
  opts?: { end?: boolean }
): T {
  source.once('error', (err) => {
    if (!dest.destroyed) dest.destroy(err)
  })
  return source.pipe(dest, opts)
}

// ---------------------------------------------------------------------------
// chainNodeStreams
// ---------------------------------------------------------------------------

/**
 * Chains multiple Node.js Readable streams sequentially into a single
 * Readable. Data from the first stream is emitted first, then the second,
 * and so on.
 *
 * This is the Node.js equivalent of `chainStreams()` in
 * `node-web-streams-helper.ts`.
 */
export function chainNodeStreams(...streams: Readable[]): Readable {
  const { PassThrough } = getNodeStream()

  if (streams.length === 0) {
    // Return an immediately-ended readable (equivalent to ReadableStream that
    // closes in start()).
    const empty = new PassThrough()
    empty.end()
    return empty
  }

  if (streams.length === 1) {
    return streams[0]
  }

  const output = new PassThrough()

  // Pipe streams sequentially. When one ends, start the next.
  let index = 0

  function pipeNext() {
    if (index >= streams.length) {
      output.end()
      return
    }

    const current = streams[index++]

    // Bind the 'end' handler so that ALS context is preserved across the
    // async boundary between streams.
    const onEnd = bindSnapshot(() => {
      pipeNext()
    })

    // `end: false` prevents the PassThrough from closing when each
    // individual source ends -- we close it manually after the last one.
    // Use safePipe so errors on the source propagate to the output.
    safePipe(current, output, { end: false })
    current.once('end', onEnd)
  }

  pipeNext()

  return output
}

// ---------------------------------------------------------------------------
// createBufferedTransformNode
// ---------------------------------------------------------------------------

/**
 * Creates a Transform stream that batches small chunks before flushing them
 * downstream. Chunks are accumulated until either:
 * - The buffer reaches `maxBufferBytes`, at which point it flushes
 *   synchronously, or
 * - A scheduled immediate tick fires, flushing whatever has been buffered.
 *
 * This is the Node.js equivalent of `createBufferedTransformStream()` in
 * `node-web-streams-helper.ts`.
 */
export function createBufferedTransformNode(
  maxBufferBytes: number = Infinity
): Transform {
  const { Transform: NodeTransform } = getNodeStream()

  let bufferedChunks: Buffer[] = []
  let bufferByteLength = 0
  let pendingFlush = false

  function flushBuffer(transform: Transform) {
    if (bufferedChunks.length === 0) return

    const merged = Buffer.concat(bufferedChunks, bufferByteLength)
    bufferedChunks = []
    bufferByteLength = 0

    transform.push(merged)
  }

  return new NodeTransform({
    transform: bindSnapshot(function (
      this: Transform,
      chunk: Buffer,
      _encoding: string,
      callback: (error?: Error | null) => void
    ) {
      bufferedChunks.push(chunk)
      bufferByteLength += chunk.length

      if (bufferByteLength >= maxBufferBytes) {
        // Flush synchronously when the buffer is large enough.
        // Mark pendingFlush as false so the scheduled callback is a no-op.
        pendingFlush = false
        flushBuffer(this)
        callback()
        return
      }

      // Schedule a flush on the next event loop iteration so that multiple
      // small chunks arriving in the same tick get batched together.
      if (!pendingFlush) {
        pendingFlush = true
        scheduleImmediate(
          bindSnapshot(() => {
            if (!pendingFlush) return
            pendingFlush = false
            flushBuffer(this)
          })
        )
      }
      callback()
    }),

    flush: bindSnapshot(function (
      this: Transform,
      callback: (error?: Error | null) => void
    ) {
      // Cancel any pending scheduled flush by marking it as handled.
      pendingFlush = false
      flushBuffer(this)
      callback()
    }),
  })
}

// ---------------------------------------------------------------------------
// createInlinedDataNodeStream
// ---------------------------------------------------------------------------

/**
 * Creates a Transform that inlines flight data from a source Readable stream
 * into the HTML stream. As the HTML flows through, chunks from `dataStream`
 * are pulled and enqueued into the output interleaved with the HTML.
 *
 * This is the Node.js equivalent of
 * `createFlightDataInjectionTransformStream()` in
 * `node-web-streams-helper.ts`.
 *
 * @param dataStream - The RSC / flight data stream to inline
 * @param delayDataUntilFirstHtmlChunk - When true, data pulling does not
 *   start until the first HTML chunk arrives (used for streaming SSR where
 *   we want the shell to flush first).
 */
export function createInlinedDataNodeStream(
  dataStream: Readable,
  delayDataUntilFirstHtmlChunk: boolean
): Transform {
  const { Transform: NodeTransform } = getNodeStream()

  let htmlStreamFinished = false
  let dataPullingStarted = false
  let dataExhausted = false

  // Collected data chunks that arrived from `dataStream` and are ready to
  // be pushed downstream.
  let pendingDataChunks: Buffer[] = []

  // A promise that resolves when all data has been consumed from
  // `dataStream`. Used in `flush()` to wait for remaining data.
  const dataComplete = new DetachedPromise<void>()

  // TODO: For future tag-searching transforms, pre-compute Buffer versions
  // of ENCODED_TAGS for fast C++ `Buffer.indexOf()` (~1.3-3.2x faster than
  // the JS `indexOfUint8Array` used by the web helpers).

  function startPulling(transform: Transform) {
    if (dataPullingStarted) return
    dataPullingStarted = true

    const onData = bindSnapshot((chunk: Buffer) => {
      if (htmlStreamFinished) {
        // If the HTML stream is already done, we push data directly.
        transform.push(chunk)
      } else {
        pendingDataChunks.push(chunk)
      }
    })

    const onEnd = bindSnapshot(() => {
      dataExhausted = true
      dataComplete.resolve()
    })

    const onError = bindSnapshot((err: Error) => {
      transform.destroy(err)
      dataComplete.resolve()
    })

    if (delayDataUntilFirstHtmlChunk) {
      // Wait one tick so the shell can flush first, matching the web stream
      // helper behavior.
      scheduleImmediate(
        bindSnapshot(() => {
          dataStream.on('data', onData)
          dataStream.once('end', onEnd)
          dataStream.once('error', onError)
        })
      )
    } else {
      dataStream.on('data', onData)
      dataStream.once('end', onEnd)
      dataStream.once('error', onError)
    }
  }

  return new NodeTransform({
    transform: bindSnapshot(function (
      this: Transform,
      chunk: Buffer,
      _encoding: string,
      callback: (error?: Error | null) => void
    ) {
      // Pass through the HTML chunk.
      this.push(chunk)

      // Start pulling data on the first HTML chunk if delayed, or
      // immediately on construction if not delayed.
      if (delayDataUntilFirstHtmlChunk && !dataPullingStarted) {
        startPulling(this)
      }

      // Flush any pending data chunks that have accumulated.
      if (pendingDataChunks.length > 0) {
        for (const dataChunk of pendingDataChunks) {
          this.push(dataChunk)
        }
        pendingDataChunks = []
      }

      callback()
    }),

    flush: bindSnapshot(function (
      this: Transform,
      callback: (error?: Error | null) => void
    ) {
      htmlStreamFinished = true

      // If data pulling was delayed and no HTML chunk ever arrived, start
      // pulling now so we don't hang waiting for a promise that will never
      // resolve.
      if (!dataPullingStarted) {
        startPulling(this)
      }

      // Flush any remaining pending data chunks.
      for (const dataChunk of pendingDataChunks) {
        this.push(dataChunk)
      }
      pendingDataChunks = []

      if (dataExhausted) {
        callback()
        return
      }

      // Wait for the data stream to finish.
      dataComplete.promise.then(() => {
        callback()
      })
    }),

    // Start pulling immediately if we are not delaying.
    ...(delayDataUntilFirstHtmlChunk
      ? {}
      : {
          construct: bindSnapshot(function (
            this: Transform,
            callback: (error?: Error | null) => void
          ) {
            startPulling(this)
            callback()
          }),
        }),
  })
}

// ---------------------------------------------------------------------------
// pipeNodeReadableToResponse
// ---------------------------------------------------------------------------

/**
 * Pipes a Node.js Readable directly to a ServerResponse without going
 * through the WhatWG WritableStream conversion. This avoids the overhead
 * of `pipe-readable.ts`'s `createWriterFromResponse()` -> `pipeTo()` path
 * when we already have a Node.js native stream.
 *
 * Handles backpressure via the standard `.pipe()` mechanism and properly
 * cleans up on client disconnect.
 *
 * @param readable - The source Node.js Readable stream
 * @param res - The Node.js ServerResponse to write to
 * @param onEnd - Optional callback invoked when piping completes (on
 *   success or client disconnect). NOT called on stream error since the
 *   response is already destroyed in that case.
 */
export function pipeNodeReadableToResponse(
  readable: Readable,
  res: ServerResponse,
  onEnd?: () => void
): void {
  if (res.destroyed || res.writableEnded) {
    readable.destroy()
    onEnd?.()
    return
  }

  const onFinish = bindSnapshot(() => {
    cleanup()
    onEnd?.()
  })

  const onError = bindSnapshot((err: Error) => {
    cleanup()
    if (!res.destroyed) {
      res.destroy(err)
    }
    // Do not call onEnd on error -- the response is already destroyed.
  })

  const onClose = bindSnapshot(() => {
    // Client disconnected. Destroy the readable to stop processing.
    if (!readable.destroyed) {
      readable.destroy()
    }
    cleanup()
    // Call onEnd so the caller knows piping has finished and can clean up
    // resources (e.g. abort pending work).
    onEnd?.()
  })

  function cleanup() {
    readable.off('error', onError)
    res.off('close', onClose)
    res.off('finish', onFinish)
  }

  readable.once('error', onError)
  res.once('close', onClose)
  res.once('finish', onFinish)

  // Flush headers before data starts flowing.
  res.flushHeaders()

  // Use pipe() for automatic backpressure handling.
  readable.pipe(res)
}

// ---------------------------------------------------------------------------
// nodeStreamToBuffer / nodeStreamToString
// ---------------------------------------------------------------------------

/**
 * Collects all chunks from a Node.js Readable into a single Buffer.
 */
export async function nodeStreamToBuffer(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Collects all chunks from a Node.js Readable into a string.
 *
 * Uses a streaming `TextDecoder` to correctly handle multi-byte UTF-8
 * characters that may span chunk boundaries.
 */
export async function nodeStreamToString(readable: Readable): Promise<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let result = ''
  for await (const chunk of readable) {
    result += decoder.decode(chunk, { stream: true })
  }
  // Flush any remaining bytes in the decoder.
  result += decoder.decode()
  return result
}
