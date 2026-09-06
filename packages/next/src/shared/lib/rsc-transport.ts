/**
 * The transport format for RSC responses.
 *
 * Every type in this module is prefixed with `Transport` to distinguish the
 * wire format from client-local types (`Segment`, `RouteTree`, `CacheNode`,
 * `FlightRouterState`). Client code converts out of Transport types at the
 * decode boundary and never stores them.
 *
 * A response carries a single tree, anchored at the root segment, where each
 * node has both its identity and (optionally) its render output. Partial
 * responses are expressed per node: the convention across the format is that
 * absence means "nothing here" — an omitted `d` means the segment was not
 * rendered as part of the response, an omitted slot key means the response
 * carries no information about that slot.
 */

import type React from 'react'
import type {
  DynamicParamTypesShort,
  FlightRouterState,
  Segment,
} from './app-router-types'
import type { VaryParamsIterable } from './segment-cache/vary-params-decoding'

/**
 * Segment identity on the wire. A string for static segments; an object for
 * dynamic (parameterized) segments.
 *
 * TODO: Page segments currently smuggle search params inside the string
 * (`__PAGE__?{...}`, see addSearchParamsIfPageSegment). This convention is
 * carried over as-is for now. Consider giving search params a dedicated
 * field (or removing them from the response entirely, since the client
 * already knows the rendered search from the response-level `q`).
 */
export type TransportSegment = string | TransportDynamicSegment

export type TransportDynamicSegment = {
  /** name — the param name, e.g. 'id' for [id] */
  n: string
  /** type — dynamic param type */
  t: DynamicParamTypesShort
  /**
   * key — the param value / cache key. null when the client is expected to
   * parse the value from the URL itself, which keeps the response cacheable
   * across param values.
   */
  k: string | null
  /** siblings — static sibling segments at this URL level; null = unknown */
  s: readonly string[] | null
}

/**
 * Render output for a single segment. Grouped into one object so a node's
 * "rendered vs skipped" state is a single presence check. Also used for the
 * head (metadata/viewport), which is output without structure.
 *
 * `r` may be null: the segment was skipped — the response acknowledges its
 * position without rendering anything for it, e.g. a shared layout the
 * client is expected to already have. This is distinct from `d` being absent
 * on the node, which means the response makes no claim about the segment's
 * output at all (the client should fetch it lazily if it doesn't have it).
 */
export type TransportSegmentData = {
  /** rsc — the React node for this segment; null = skipped (not rendered) */
  r: React.ReactNode
  /**
   * isPartial — whether anything in the segment's output is not fully
   * resolved: dynamic holes, runtime holes, anything suspended.
   *
   * Navigation responses carry a plain boolean, known at render time. It is
   * a render-wide constant (isPossiblyPartialResponse in
   * create-component-tree.tsx), identical on every node and only
   * conservatively accurate, so the client resolves a boolean-form node's
   * actual partiality from the response-level signal instead (see
   * decodeTransportNode).
   *
   * Per-segment prefetch responses carry the rewindable promise encoding
   * instead: fulfilled = complete, pending forever = partial. Partiality is
   * only discovered there by probing the buffered prerender (a partial
   * segment's probe never resolves, the same way Flight encodes the holes
   * themselves), and the encoding must survive the client's shell
   * double-decode — the response buffer is decoded a second time truncated
   * at the shell byte boundary (`a`), and a fulfillment row that landed past
   * the boundary must read as "partial" in that decode. The promise form is
   * only ever read off a fully-buffered decode's thenable status.
   */
  p: boolean | Promise<void>
  /**
   * varyParams — an iterable of the route params this segment's output
   * depends on (one name per yield, deduped). Used by the client router to
   * determine cache key specificity: segments that only access certain
   * params can be reused across navigations where unaccessed params change.
   *
   * Does NOT include root params; those are emitted once at the response
   * level (`r` on the response wrapper) and unioned in by the consumer.
   *
   * - null: tracking was not enabled for this render (e.g., not a
   *   prerender). Treat conservatively — assume all params vary.
   * - Drains to empty: segment accesses no params (e.g., client components,
   *   or server components that don't read params). Can be shared across
   *   all param values.
   * - Drains to non-empty: segment depends on those params. Can only be
   *   reused when those specific params match.
   */
  v: VaryParamsIterable | null
  /**
   * staleTime in seconds — present only in per-segment prefetch responses,
   * where staleness is tracked per node. Navigation responses carry
   * staleness at the response level instead (the wrapper's `s` iterable or
   * the Next-Router-Stale-Time header).
   *
   * An async iterable rather than a plain number because the final value is
   * only known late in the stream, and the iterable form survives a
   * truncated/rewound shell decode (read via thenable status from the
   * buffered response). The client takes the last yielded value.
   */
  s?: AsyncIterable<number>
}

/**
 * Structure of a segment node, independent of whether render output
 * is attached. Shared by both response variants.
 */
type TransportNodeShape = {
  /** segment — identity */
  s: TransportSegment
  /** hints — PrefetchHint bitmask; omitted when zero or unknown */
  h?: number
}

/**
 * A node in a FULL response tree: every node carries data, and slot maps are
 * exhaustive. Produced by full renders: the initial document payload and
 * error payloads. "Full" means the response accounts for every node — there
 * is nothing for the client to fetch lazily. Data-level holes
 * (`d.p === true`) and skipped nodes (`d.r === null`) are still possible.
 */
export type FullTransportNode = TransportNodeShape & {
  /** data — always present in a full tree */
  d: TransportSegmentData
  /**
   * children — parallel routes; omitted for leaf segments. A Map rather
   * than a plain object because slot names are app-defined; with a plain
   * object, every distinct combination of slot names creates a different
   * hidden class, making keyed access megamorphic.
   */
  c?: Map<string, FullTransportNode>
}

/**
 * A node in a PARTIAL response tree: produced by navigations, refreshes, and
 * actions — anywhere the server diffs against client state or renders a
 * subset of the route.
 *
 * The client treats the response as an overlay over its current tree:
 *
 * - A node present in the tree is authoritative for that position's identity.
 * - `d` present: the response accounts for this segment. Its output is `d.r`,
 *   which may be null when the segment was skipped — not rendered because
 *   the client already has it (e.g. a shared layout).
 * - `d` omitted: the response makes no claim about this segment's output.
 *   The client keeps what it has, or lazily fetches when it renders (e.g.
 *   segments beneath a loading boundary in a non-PPR prefetch).
 * - A slot key omitted from `c` (or `c` omitted): on a skipped node
 *   (`d.r === null`), the response carries no information about that slot
 *   and the client keeps its subtree untouched. On any other node the
 *   subtree is authoritative, so an omitted slot is simply absent.
 * - `h` omitted: on a skipped node, the client keeps its existing hints for
 *   the segment; on any other node it means the hints are zero.
 *
 * The client's cache write descends through nodes with `d` omitted (see
 * writeTreeDataIntoCache), so data may appear at any depth below a no-claim
 * node — the identity spine of a per-segment prefetch response is the
 * canonical producer of that shape.
 */
export type PartialTransportNode = TransportNodeShape & {
  /** data — omitted when this segment was not rendered in this response */
  d?: TransportSegmentData
  /** children — omitted field or key = no information about those slots */
  c?: Map<string, PartialTransportNode>
}

/**
 * Shared type for code that walks either variant. Note: FullTransportNode is
 * structurally assignable to PartialTransportNode, so this union collapses
 * to PartialTransportNode for the type checker; the union spelling
 * documents intent.
 */
export type TransportNode = FullTransportNode | PartialTransportNode

/**
 * The tree + head bundle of a response.
 */
export type FullTransportData = {
  /** tree */
  t: FullTransportNode
  /** head — always present and complete in a full response */
  h: TransportSegmentData
}

export type PartialTransportData = {
  t: PartialTransportNode
  /** omitted = this response carries no head (e.g. router-state-only responses) */
  h?: TransportSegmentData
}

export type TransportData = FullTransportData | PartialTransportData

/**
 * Creates the data for a skipped segment: a null `r` marks the position as
 * acknowledged by the response, with no output attached (see the note on
 * TransportSegmentData). Used by producers for the segments along the path
 * from the root down to the rendered subtrees.
 */
export function createSkippedSegmentData(): TransportSegmentData {
  return { r: null, p: true, v: null }
}

/**
 * Reads a late-resolving value from a fully-buffered Flight decode via the
 * thenable's status. Flight sets `status`/`value` on a row's promise once
 * its bytes are processed, and a buffered decode processes every byte
 * synchronously, so any row that made it into the payload is readable
 * without awaiting. Returns `unresolvedValue` for a row that is pending or
 * absent in this decode — e.g. one whose fulfillment landed past a
 * truncated shell decode's boundary; that's what scopes a response's
 * late-resolving signals to the payload being decoded. Returns
 * `rejectedValue` (defaults to `unresolvedValue`) for a rejected row — an
 * aborted render errors rows that were still pending when it happened.
 *
 * Shared by client and server: the client reads buffered prefetch
 * responses; the server (collect-segment-data) reads the buffered page
 * payload it re-serializes into per-segment responses.
 */
export function readFulfilledValue<T, TFallback>(
  valueFromServer: PromiseLike<T>,
  unresolvedValue: TFallback,
  rejectedValue: T | TFallback = unresolvedValue
): T | TFallback {
  const thenable = valueFromServer as PromiseLike<T> & {
    status?: string
    value?: T
  }
  // Force Flight to unwrap a received-but-not-yet-settled row.
  thenable.then(noop, noop)
  switch (thenable.status) {
    case 'fulfilled':
      return thenable.value as T
    case 'rejected':
      return rejectedValue
    // No status yet: the row is still pending, or absent from this decode.
    case undefined:
    default:
      return unresolvedValue
  }
}

const noop = () => {}

/**
 * Converts a segment's client/server-internal representation to its wire
 * representation.
 */
export function segmentToTransportSegment(segment: Segment): TransportSegment {
  if (typeof segment === 'string') {
    return segment
  }
  return {
    n: segment[0],
    t: segment[2],
    k: segment[1],
    s: segment[3],
  }
}

/**
 * Converts a segment's wire representation to the client/server-internal
 * `Segment` type.
 */
export function transportSegmentToSegment(
  transportSegment: TransportSegment
): Segment {
  if (typeof transportSegment === 'string') {
    return transportSegment
  }
  return [
    transportSegment.n,
    // `k` may be null when the client is expected to parse the param value
    // from the URL (per-segment prefetch responses). Callers that need the
    // real value resolve it from the rendered pathname instead of using this
    // function (see resolveTransportSegment in decode-server-response); the
    // remaining callers are value-insensitive (segment request keys, which
    // never include param values) or only see concrete keys.
    transportSegment.k ?? '',
    transportSegment.t,
    transportSegment.s,
  ]
}

/**
 * Derives a FlightRouterState from a transport tree. Used where the client
 * needs a router-state representation of a full response (e.g. the initial
 * hydration payload). Render output (`d`) is not carried over; page segments
 * keep their search params, which travel inside the segment string.
 */
export function transportNodeToFlightRouterState(
  node: TransportNode
): FlightRouterState {
  const parallelRoutes: Record<string, FlightRouterState> = {}
  const children = node.c
  if (children !== undefined) {
    for (const [parallelRouteKey, childNode] of children) {
      parallelRoutes[parallelRouteKey] =
        transportNodeToFlightRouterState(childNode)
    }
  }
  const flightRouterState: FlightRouterState = [
    transportSegmentToSegment(node.s),
    parallelRoutes,
  ]
  if (node.h !== undefined) {
    flightRouterState[4] = node.h
  }
  return flightRouterState
}
