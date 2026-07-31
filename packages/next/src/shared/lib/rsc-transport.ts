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
 * `r` may be null: the response covered this segment's position without
 * rendering anything for it — e.g. a shared layout the client is expected to
 * already have. This is distinct from `d` being absent on the node, which
 * means the response makes no claim about the segment's output at all (the
 * client should fetch it lazily if it doesn't have it).
 */
export type TransportSegmentData = {
  /** rsc — the React node for this segment; null = covered but not rendered */
  r: React.ReactNode
  /** isPartial — contains unresolved dynamic holes (static prerender) */
  p: boolean
  /**
   * varyParams — params this segment's output depends on. Does not include
   * root params, which are emitted once at the response level (`r` on the
   * response wrapper).
   */
  v: VaryParamsIterable | null
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
 * error payloads. "Full" means every node is covered by the response — there
 * is nothing for the client to fetch lazily. Data-level holes
 * (`d.p === true`) and covered-but-not-rendered nodes (`d.r === null`) are
 * still possible.
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
 *   which may be null when the position is covered without rendering (e.g. a
 *   shared layout the client already has).
 * - `d` omitted: the response makes no claim about this segment's output.
 *   The client keeps what it has, or lazily fetches when it renders (e.g.
 *   segments beneath a loading boundary in a non-PPR prefetch).
 * - A slot key omitted from `c` (or `c` omitted): on a covered node
 *   (`d.r === null`), the response carries no information about that slot
 *   and the client keeps its subtree untouched. On any other node the
 *   subtree is authoritative, so an omitted slot is simply absent.
 * - `h` omitted: on a covered node, the client keeps its existing hints for
 *   the segment; on any other node it means the hints are zero.
 *
 * TODO: A node with `d` omitted currently ends the client's cache write for
 * its subtree (see writeSeedDataIntoCache), so "skip a middle segment but
 * render below it" is not expressible yet. Extend the decode/write semantics
 * when a producer needs that.
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
    // TODO: `k` may be null when the client is expected to parse the param
    // value from the URL. Navigation responses always include the key today;
    // this becomes relevant when per-segment prefetch responses converge on
    // this format.
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
