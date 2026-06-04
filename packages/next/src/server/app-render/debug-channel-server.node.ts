/**
 * Node debug channel implementation.
 * Loaded by debug-channel-server.ts when __NEXT_USE_NODE_STREAMS is enabled.
 */

import { PassThrough, Writable } from 'node:stream'
import type { DebugChannelPair } from './debug-channel-server.web'

export { createWebDebugChannel } from './debug-channel-server.web'

/**
 * Creates a debug channel using Node.js streams.
 * Use with renderToNodeFlightStream (React's renderToPipeableStream),
 * which expects debugChannel to be a Node.js stream with a .write() method.
 */
export function createNodeDebugChannel(): DebugChannelPair {
  // The readable side is a PassThrough that the client reads from. The
  // server-side write target is a separate, write-only Writable that forwards
  // into it rather than the PassThrough itself: React's renderToPipeableStream
  // detects `.read()` on the debug channel and would enter bidirectional mode,
  // reading its own output back as commands.
  //
  // The forwarding must use `passthrough.write()` / `passthrough.end()`, not
  // `passthrough.push()` / `passthrough.push(null)`. A PassThrough is a Duplex;
  // pushing `null` ends only its readable half and leaves the writable half
  // open (`writableEnded` stays false). The readable is later consumed via
  // `Readable.toWeb()` (in `connectReactDebugChannel`, and inside `teeStream`),
  // and `Readable.toWeb()` never closes the resulting web stream while the
  // PassThrough's writable half is still open — so the debug channel never
  // closes on the client. Ending it via `passthrough.end()` closes both halves
  // and the close propagates.
  const passthrough = new PassThrough()

  const writable = new Writable({
    write(chunk, encoding, callback) {
      passthrough.write(chunk, encoding, callback)
    },
    final(callback) {
      passthrough.end(callback)
    },
  })

  return {
    serverSide: writable,
    clientSide: { readable: passthrough },
  }
}
