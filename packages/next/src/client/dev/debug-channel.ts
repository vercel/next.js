import { NEXT_REQUEST_ID_HEADER } from '../components/app-router-headers'
import { InvariantError } from '../../shared/lib/invariant-error'

export interface DebugChannelReadableWriterPair {
  /**
   * The remaining, not-yet-handed-out copy of the request's debug stream. A
   * request can be decoded more than once (the primary decode plus any stage
   * extractions that re-parse a slice of the same response, see
   * `decodeStageUntilBoundary`), and each decode needs its own reader. Every
   * time a consumer asks for the readable we tee it and reassign this field to
   * the remainder, so each consumer gets an independent branch. The remainder
   * is only ever tee'd again, never read directly, so it retains every chunk
   * from the start and replays the full stream into each new branch.
   */
  readable: ReadableStream<Uint8Array>
  readonly writer: WritableStreamDefaultWriter<Uint8Array>
}

const pairs = new Map<string, DebugChannelReadableWriterPair>()

/**
 * Upper bound on the number of in-memory debug-channel pairs we retain, evicted
 * least-recently-used, bounding the live per-request map.
 *
 * A pair must outlive its stream's close so a late decode of the same response
 * (the primary decode plus stage extractions via `decodeStageUntilBoundary`,
 * which can run after the channel closed over the WebSocket) still finds the
 * buffered data. The cap only needs to exceed the pairs live or recently closed
 * at once (bounded by how many prefetch/navigation requests are in flight
 * together), so a few dozen leaves ample headroom even for the segment-heavy
 * bursts the Instant Navs DevTools capture can produce.
 */
const MAX_DEBUG_CHANNEL_PAIRS = 64

/**
 * Reclaim the least-recently-used debug-channel pairs once the map exceeds
 * `MAX_DEBUG_CHANNEL_PAIRS`. The map is iterated in insertion order and we
 * re-insert entries on access (see
 * `getOrCreateDebugChannelReadableWriterPair`), so the least-recently-used
 * pairs sit at the front. Evicting only ever affects future lookups for that
 * request id; consumers that already hold a tee branch keep reading
 * independently of the map.
 */
function evictExcessDebugChannelPairs(): void {
  while (pairs.size > MAX_DEBUG_CHANNEL_PAIRS) {
    const oldestRequestId = pairs.keys().next().value
    if (oldestRequestId === undefined) {
      break
    }
    pairs.delete(oldestRequestId)
  }
}

export function getOrCreateDebugChannelReadableWriterPair(
  requestId: string
): DebugChannelReadableWriterPair {
  const existingPair = pairs.get(requestId)
  if (existingPair) {
    // Refresh the LRU recency of an already-known channel by re-inserting it at
    // the most-recent position, so a channel that's still being written to or
    // read from isn't evicted while a late consumer (e.g. a stage re-decode of
    // the same response) still needs it.
    pairs.delete(requestId)
    pairs.set(requestId, existingPair)
    return existingPair
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()

  const pair: DebugChannelReadableWriterPair = {
    readable,
    writer: writable.getWriter(),
  }
  pairs.set(requestId, pair)
  // Retain the pair past its stream's close (see MAX_DEBUG_CHANNEL_PAIRS) and
  // bound the map by reclaiming the least-recently-used.
  evictExcessDebugChannelPairs()

  // An errored stream rejects `writer.closed`. Observe the rejection so that it
  // does not surface as an unhandled rejection.
  pair.writer.closed.catch((error) => {
    console.debug('Debug channel writer closed with error', error)
  })

  return pair
}

export function createDebugChannel(
  requestHeaders: Record<string, string> | undefined
): {
  writable?: WritableStream
  readable?: ReadableStream
} {
  let requestId: string | undefined

  if (requestHeaders) {
    requestId = requestHeaders[NEXT_REQUEST_ID_HEADER] ?? undefined

    if (!requestId) {
      throw new InvariantError(
        `Expected a ${JSON.stringify(NEXT_REQUEST_ID_HEADER)} request header.`
      )
    }
  } else {
    requestId = self.__next_r

    if (!requestId) {
      throw new InvariantError(
        `Expected a request ID to be defined for the document via self.__next_r.`
      )
    }
  }

  const pair = getOrCreateDebugChannelReadableWriterPair(requestId)
  // Hand out a fresh tee branch per consumer and keep the remainder for the
  // next one (see the `readable` field doc above).
  const [branch, rest] = pair.readable.tee()
  pair.readable = rest

  return { readable: branch }
}
