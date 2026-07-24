import type { ServerResponse } from 'node:http'
import { Duplex } from 'node:stream'

const noop = () => {}

/**
 * Destroys the zlib stream that the `compression` middleware left open on a
 * response that never finished.
 *
 * The middleware ends its stream only from its own `res.end()` wrapper, so a
 * client disconnect leaves it open, and an open zlib stream is pinned by its
 * native handle. Ending it rather than destroying it can leave the stream
 * paused while it tries to write to a dead response.
 *
 * `res.on('drain', ...)` is forwarded to the zlib stream once compression is
 * active. EventEmitter#on returns its emitter, which is the only handle the
 * middleware exposes. When compression is inactive, the call returns `res`.
 *
 * Compression creates its stream lazily while sending headers. If the response
 * closes before that happens, defer one more release until `writeHead` so a
 * subsequent asynchronous write cannot create a stream after cleanup ran.
 */
export function releaseCompressionStream(res: ServerResponse): void {
  const maybeStream: unknown = res.on('drain', noop)

  if (maybeStream !== res && maybeStream instanceof Duplex) {
    maybeStream.off('drain', noop)
    maybeStream.destroy()
    return
  }

  res.off('drain', noop)

  if (res.headersSent) {
    return
  }

  const writeHead = res.writeHead
  res.writeHead = function deferredCompressionStreamRelease(
    this: ServerResponse,
    ...args: any[]
  ) {
    // Only intercept the first attempt. The compression middleware also wraps
    // writeHead and creates its stream before the captured function returns.
    res.writeHead = writeHead
    try {
      return writeHead.apply(this, args as any)
    } finally {
      releaseCompressionStream(res)
    }
  } as typeof res.writeHead
}
