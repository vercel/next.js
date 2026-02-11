import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'

// Enable the node streams code path. pipeNodeReadableToResponse is gated
// behind this env var and is a no-op without it.
process.env.__NEXT_USE_NODE_STREAMS = 'true'

import { pipeNodeReadableToResponse } from './pipe-readable'

/**
 * Creates a minimal mock ServerResponse backed by EventEmitter so tests can
 * manually emit 'drain' and 'close' events to simulate backpressure and
 * client disconnects.
 *
 * @param opts.backpressureAfter - After this many write() calls, write()
 *   starts returning false to simulate kernel buffer full / TCP backpressure.
 *   Callers must emit 'drain' on the mock to unblock the pipe.
 */
function createMockResponse(opts: { backpressureAfter: number }) {
  const ee = new EventEmitter()
  const { backpressureAfter } = opts
  let writeCount = 0
  let _destroyed = false

  const mock = Object.assign(ee, {
    write(_chunk: any): boolean {
      writeCount++
      // Returning false tells the caller to stop writing until 'drain' fires.
      // This mirrors real ServerResponse behavior when the socket buffer is full.
      return writeCount < backpressureAfter
    },
    end() {},
    destroy(_err?: Error) {
      _destroyed = true
      mock.emit('close')
    },
    flushHeaders() {},
    flush() {},
    get errored() {
      return null
    },
    get destroyed() {
      return _destroyed
    },
    get writableFinished() {
      return false
    },
  })

  return mock as typeof mock & ServerResponse
}

describe('pipeNodeReadableToResponse', () => {
  // Regression test for the backpressure + disconnect hang.
  //
  // Reproduction sequence:
  //   1. Readable pushes a chunk, res.write() returns false (backpressure)
  //   2. The writable registers res.once('drain', callback) to resume
  //   3. Client disconnects: res emits 'close' but never emits 'drain'
  //   4. Without the fix, the orphaned drain callback means the writable's
  //      destroy() handler never fires, so finished.resolve() is never
  //      called, and `await finished.promise` hangs forever.
  //
  // The fix: onClose destroys BOTH readable and writable. Destroying the
  // writable triggers its destroy() handler which calls finished.resolve().
  it('resolves when client disconnects during backpressure (no hang)', async () => {
    const readable = Readable.from([
      Buffer.from('chunk1'),
      Buffer.from('chunk2'),
      Buffer.from('chunk3'),
    ])
    // write() returns false on the very first call to immediately trigger backpressure
    const res = createMockResponse({ backpressureAfter: 1 })

    const pipePromise = pipeNodeReadableToResponse(readable, res as any)

    // Let the pipe start and hit backpressure (waiting on 'drain')
    await new Promise((r) => setTimeout(r, 50))

    // Client disconnects without ever emitting 'drain'
    res.emit('close')

    // Race against a 2s timeout. If the bug is present, pipePromise never
    // resolves and we get 'timeout' instead of 'resolved'.
    const timeout = new Promise<'timeout'>((r) =>
      setTimeout(() => r('timeout'), 2000)
    )
    const result = await Promise.race([
      pipePromise.then(() => 'resolved' as const),
      timeout,
    ])

    expect(result).toBe('resolved')
  })
})
