/**
 * Node debug channel implementation.
 * Loaded by debug-channel-server.ts when __NEXT_USE_NODE_STREAMS is enabled.
 */

import { PassThrough, Writable, type Readable } from 'node:stream'
import type { DebugChannelServer } from './debug-channel-server.web'

export { createWebDebugChannel } from './debug-channel-server.web'

/**
 * Node variant: identical to `DebugChannelPair` except the client-side readable
 * is narrowed to a Node `Readable`, so node call sites can consume it (e.g.
 * `new ReplayableNodeStream(...)`) without casting `AnyStream` down.
 */
export type NodeDebugChannelPair = {
  serverSide: DebugChannelServer
  clientSide: { readable: Readable }
}

/**
 * Creates a debug channel using Node.js streams.
 * Use with renderToNodeFlightStream (React's renderToPipeableStream),
 * which expects debugChannel to be a Node.js stream with a .write() method.
 */
export function createNodeDebugChannel(): NodeDebugChannelPair {
  // The readable side is a PassThrough that the client reads from. The
  // server-side write target is a separate, write-only Writable that forwards
  // into it rather than the PassThrough itself: React's renderToPipeableStream
  // detects `.read()` on the debug channel and would enter bidirectional mode,
  // reading its own output back as commands.
  //
  // The forwarding must use `passthrough.write()` / `passthrough.end()`, not
  // `passthrough.push()` / `passthrough.push(null)`. A PassThrough is a Duplex;
  // pushing `null` ends only its readable half and leaves the writable half
  // open (`writableEnded` stays false). If the readable is consumed via
  // `Readable.toWeb()`, that web stream never closes while the PassThrough's
  // writable half is still open — so the debug channel would never close on the
  // client. Ending it via `passthrough.end()` closes both halves and the close
  // propagates.
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
