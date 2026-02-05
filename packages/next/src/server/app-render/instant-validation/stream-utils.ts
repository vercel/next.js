import type { Readable } from 'node:stream'
import { InvariantError } from '../../../shared/lib/invariant-error'

/**
 * When we abort a staged render, we can still provide react with more chunks from later phases
 * to use for their debug info. This will not cause more contents to be rendered.
 */
export function createNodeStreamWithLateRelease(
  partialChunks: Array<Uint8Array>,
  allChunks: Array<Uint8Array>,
  releaseSignal: AbortSignal
): Readable {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'createNodeStreamWithLateRelease cannot be used in the edge runtime'
    )
  } else {
    const { Readable } = require('node:stream') as typeof import('node:stream')

    let nextIndex = 0

    const readable = new Readable({
      read() {
        while (nextIndex < partialChunks.length) {
          this.push(partialChunks[nextIndex])
          nextIndex++
        }
      },
    })

    releaseSignal.addEventListener(
      'abort',
      () => {
        // Flush any remaining chunks from the original set
        while (nextIndex < partialChunks.length) {
          readable.push(partialChunks[nextIndex])
          nextIndex++
        }
        // Flush all chunks since we're now aborted and can't schedule
        // any new work but these chunks might unblock debugInfo
        while (nextIndex < allChunks.length) {
          readable.push(allChunks[nextIndex])
          nextIndex++
        }

        setImmediate(() => {
          readable.push(null)
        })
      },
      { once: true }
    )

    return readable
  }
}

export function createNodeStreamFromChunks(
  chunks: Array<Uint8Array>,
  signal?: AbortSignal
): Readable {
  if (process.env.NEXT_RUNTIME === 'edge') {
    throw new InvariantError(
      'createNodeStreamFromChunks cannot be used in the edge runtime'
    )
  } else {
    const { Readable } = require('node:stream') as typeof import('node:stream')

    // If there's a signal, delay closing until it fires
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          readable.push(null)
        },
        { once: true }
      )
    }

    let nextIndex = 0
    const readable = new Readable({
      read() {
        while (nextIndex < chunks.length) {
          this.push(chunks[nextIndex])
          nextIndex++
        }
        if (!signal) {
          this.push(null)
        }
      },
    })
    return readable
  }
}
