/**
 * @jest-environment node
 */

import { Transform, type Writable } from 'node:stream'
import { renderToNodeFlightStream } from 'next/dist/server/app-render/stream-ops.node'
import { ResponseAborted } from 'next/dist/server/web/spec-extension/adapters/next-request'

interface MockPipeableStream {
  pipe: <T extends Writable>(destination: T) => T
  abort: (reason?: unknown) => void
}

describe('renderToNodeFlightStream - error and close event handling', () => {
  it('preserves ResponseAborted when destination stream errors before close', async () => {
    let aborted = false
    const abortedReasons: unknown[] = []

    // Mimic React Flight Server's listener setup and single-abort state transition
    const mockPipeable: MockPipeableStream = {
      pipe<T extends Writable>(destination: T): T {
        destination.on('drain', () => {})
        destination.on('error', () => {
          mockPipeable.abort(
            new Error('The destination stream errored while writing data.')
          )
        })
        destination.on('close', () => {
          mockPipeable.abort(new Error('The destination stream closed early.'))
        })
        return destination
      },
      abort(reason?: unknown) {
        if (!aborted) {
          aborted = true
          abortedReasons.push(reason)
        }
      },
    }

    const mockComponentMod = {
      renderToPipeableStream: () => mockPipeable,
    }

    const pt = renderToNodeFlightStream(
      mockComponentMod,
      null,
      {},
      {}
    ) as Transform

    // Node.js destroy(err) emits 'error' followed by 'close'.
    const clientAbortError = new ResponseAborted()
    pt.destroy(clientAbortError)

    await new Promise((resolve) => setImmediate(resolve))

    // Pre-pipe 'error' listener runs before React's and aborts with the client error
    expect(abortedReasons).toHaveLength(1)
    expect(abortedReasons[0]).toBe(clientAbortError)
    const err = abortedReasons[0] as Error
    expect(err.name).toBe('ResponseAborted')
    expect(err.message).not.toContain(
      'The destination stream errored while writing data'
    )
  })

  it('aborts with ResponseAborted via the close handler when destination is destroyed without an error argument', async () => {
    let aborted = false
    const abortedReasons: unknown[] = []

    const mockPipeable: MockPipeableStream = {
      pipe<T extends Writable>(destination: T): T {
        destination.on('drain', () => {})
        destination.on('error', () => {
          mockPipeable.abort(
            new Error('The destination stream errored while writing data.')
          )
        })
        destination.on('close', () => {
          mockPipeable.abort(new Error('The destination stream closed early.'))
        })
        return destination
      },
      abort(reason?: unknown) {
        if (!aborted) {
          aborted = true
          abortedReasons.push(reason)
        }
      },
    }

    const mockComponentMod = {
      renderToPipeableStream: () => mockPipeable,
    }

    const pt = renderToNodeFlightStream(
      mockComponentMod,
      null,
      {},
      {}
    ) as Transform

    // In Node.js, destroy() without arguments emits 'close' without an 'error' event.
    // This exercises the pre-pipe 'close' listener.
    pt.destroy()

    await new Promise((resolve) => setImmediate(resolve))

    // Pre-pipe 'close' listener runs before React's 'close' handler and aborts with ResponseAborted
    expect(abortedReasons).toHaveLength(1)
    expect(abortedReasons[0]).toBeInstanceOf(ResponseAborted)
    const err = abortedReasons[0] as Error
    expect(err.name).toBe('ResponseAborted')
    expect(err.message).not.toContain(
      'The destination stream closed early'
    )
  })

  it('falls back to ResponseAborted when destination emits an error event without an error object', async () => {
    let aborted = false
    const abortedReasons: unknown[] = []

    const mockPipeable: MockPipeableStream = {
      pipe<T extends Writable>(destination: T): T {
        destination.on('drain', () => {})
        destination.on('error', () => {
          mockPipeable.abort(
            new Error('The destination stream errored while writing data.')
          )
        })
        return destination
      },
      abort(reason?: unknown) {
        if (!aborted) {
          aborted = true
          abortedReasons.push(reason)
        }
      },
    }

    const mockComponentMod = {
      renderToPipeableStream: () => mockPipeable,
    }

    const pt = renderToNodeFlightStream(
      mockComponentMod,
      null,
      {},
      {}
    ) as Transform

    // Emitting 'error' with undefined exercises the `err || new ResponseAborted()` fallback
    pt.emit('error', undefined)

    await new Promise((resolve) => setImmediate(resolve))

    expect(abortedReasons).toHaveLength(1)
    expect(abortedReasons[0]).toBeInstanceOf(ResponseAborted)
    const err = abortedReasons[0] as Error
    expect(err.name).toBe('ResponseAborted')
  })

  it('does not abort when destination stream finishes writing normally', async () => {
    const abortedReasons: unknown[] = []

    const mockPipeable: MockPipeableStream = {
      pipe<T extends Writable>(destination: T): T {
        return destination
      },
      abort(reason?: unknown) {
        abortedReasons.push(reason)
      },
    }

    const mockComponentMod = {
      renderToPipeableStream: () => mockPipeable,
    }

    const pt = renderToNodeFlightStream(
      mockComponentMod,
      null,
      {},
      {}
    ) as Transform

    // Normal stream end
    pt.end()

    await new Promise((resolve) => setImmediate(resolve))

    expect(pt.writableEnded).toBe(true)
    expect(abortedReasons).toHaveLength(0)
  })

  it('preserves and passes unexpected destination errors without coercing them to ResponseAborted', async () => {
    let aborted = false
    const abortedReasons: unknown[] = []
    const unexpectedError = new Error('EIO: Disk write I/O failure')

    const mockPipeable: MockPipeableStream = {
      pipe<T extends Writable>(destination: T): T {
        destination.on('drain', () => {})
        destination.on('error', (err: unknown) => {
          mockPipeable.abort(err)
        })
        return destination
      },
      abort(reason?: unknown) {
        if (!aborted) {
          aborted = true
          abortedReasons.push(reason)
        }
      },
    }

    const mockComponentMod = {
      renderToPipeableStream: () => mockPipeable,
    }

    const pt = renderToNodeFlightStream(
      mockComponentMod,
      null,
      {},
      {}
    ) as Transform

    pt.destroy(unexpectedError)

    await new Promise((resolve) => setImmediate(resolve))

    expect(abortedReasons).toHaveLength(1)
    expect(abortedReasons[0]).toBe(unexpectedError)
    const err = abortedReasons[0] as Error
    expect(err.name).not.toBe('ResponseAborted')
    expect(err.message).toBe('EIO: Disk write I/O failure')
  })
})
