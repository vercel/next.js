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
 */

import { Transform, Readable, PassThrough } from 'node:stream'
import type { ServerResponse } from 'node:http'
import { bindSnapshot } from '../app-render/async-local-storage'
import { DetachedPromise } from '../../lib/detached-promise'

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

    const onError = bindSnapshot((err: Error) => {
      output.destroy(err)
    })

    // `end: false` prevents the PassThrough from closing when each
    // individual source ends -- we close it manually after the last one.
    current.pipe(output, { end: false })
    current.once('end', onEnd)
    current.once('error', onError)
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
 * - A `setImmediate` tick fires, flushing whatever has been buffered.
 *
 * This is the Node.js equivalent of `createBufferedTransformStream()` in
 * `node-web-streams-helper.ts`.
 */
export function createBufferedTransformNode(
  maxBufferBytes: number = Infinity
): Transform {
  let bufferedChunks: Buffer[] = []
  let bufferByteLength = 0
  let pendingFlush: ReturnType<typeof setImmediate> | null = null

  function flushBuffer(transform: Transform) {
    if (bufferedChunks.length === 0) return

    const merged = Buffer.concat(bufferedChunks, bufferByteLength)
    bufferedChunks = []
    bufferByteLength = 0

    transform.push(merged)
  }

  return new Transform({
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
        if (pendingFlush !== null) {
          clearImmediate(pendingFlush)
          pendingFlush = null
        }
        flushBuffer(this)
        callback()
        return
      }

      // Schedule a flush on the next event loop iteration so that multiple
      // small chunks arriving in the same tick get batched together.
      if (pendingFlush === null) {
        pendingFlush = setImmediate(
          bindSnapshot(() => {
            pendingFlush = null
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
      if (pendingFlush !== null) {
        clearImmediate(pendingFlush)
        pendingFlush = null
      }
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
  let htmlStreamFinished = false
  let dataPullingStarted = false
  let dataExhausted = false

  // Collected data chunks that arrived from `dataStream` and are ready to
  // be pushed downstream.
  let pendingDataChunks: Buffer[] = []

  // A promise that resolves when all data has been consumed from
  // `dataStream`. Used in `flush()` to wait for remaining data.
  const dataComplete = new DetachedPromise<void>()

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
      setImmediate(
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

  return new Transform({
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
      if (delayDataUntilFirstHtmlChunk) {
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
 * of `pipe-readable.ts`'s `createWriterFromResponse()` → `pipeTo()` path
 * when we already have a Node.js native stream.
 *
 * Handles backpressure via the standard `.pipe()` mechanism and properly
 * cleans up on client disconnect.
 *
 * @param readable - The source Node.js Readable stream
 * @param res - The Node.js ServerResponse to write to
 * @param onEnd - Optional callback invoked when piping completes
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

  const done = new DetachedPromise<void>()

  const onFinish = bindSnapshot(() => {
    cleanup()
    done.resolve()
    onEnd?.()
  })

  const onError = bindSnapshot((err: Error) => {
    cleanup()
    if (!res.destroyed) {
      res.destroy(err)
    }
    done.resolve()
    // Do not call onEnd on error -- the response is already destroyed.
  })

  const onClose = bindSnapshot(() => {
    // Client disconnected. Destroy the readable to stop processing.
    if (!readable.destroyed) {
      readable.destroy()
    }
    cleanup()
    done.resolve()
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
 */
export async function nodeStreamToString(readable: Readable): Promise<string> {
  const buf = await nodeStreamToBuffer(readable)
  return buf.toString('utf-8')
}
