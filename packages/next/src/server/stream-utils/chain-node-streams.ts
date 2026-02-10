import type { Readable as NodeReadable } from 'node:stream'

export function chainNodeStreams(...streams: NodeReadable[]): NodeReadable {
  if (!process.env.__NEXT_USE_NODE_STREAMS) {
    throw new Error(
      'Invariant: Node.js stream chaining is only available in node streams mode'
    )
  } else {
    const { chainNodeStreams: chainNodeStreamsImpl } =
      require('./node-stream-helpers') as typeof import('./node-stream-helpers')
    return chainNodeStreamsImpl(...streams)
  }
}
