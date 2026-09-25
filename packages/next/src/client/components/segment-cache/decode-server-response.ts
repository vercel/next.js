/**
 * Decoding of RSC server responses (the transport format defined in
 * shared/lib/rsc-transport) into the client's own representations. This is
 * the only place on the client that consumes transport types; everything
 * downstream operates on RouteTree / NavigationSeed / CacheNode.
 */

import type {
  FlightRouterState,
  Segment as FlightRouterStateSegment,
} from '../../../shared/lib/app-router-types'
import {
  PrefetchHint,
  SubtreePrefetchHints,
  propagateSubtreeBits,
} from '../../../shared/lib/app-router-types'
import type {
  PartialTransportData,
  PartialTransportNode,
  TransportSegment,
} from '../../../shared/lib/rsc-transport'
import { readFulfilledValue } from '../../../shared/lib/rsc-transport'
import type { VaryParamsIterable } from '../../../shared/lib/segment-cache/vary-params-decoding'
import { decodeVaryParams } from '../../../shared/lib/segment-cache/vary-params-decoding'
import {
  type SegmentRequestKey,
  ROOT_SEGMENT_REQUEST_KEY,
  appendSegmentRequestKeyPart,
  createSegmentRequestKeyPart,
} from '../../../shared/lib/segment-cache/segment-value-encoding'
import {
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import { InvariantError } from '../../../shared/lib/invariant-error'
import {
  doesStaticSegmentAppearInURL,
  getCacheKeyForDynamicParam,
  parseDynamicParamFromURLPart,
} from '../../route-params'
import type { NormalizedSearch } from './cache-key'
import { splitPathnameIntoParts } from './cache-key'
import type { PartialVaryPath, VaryPath } from './vary-path'
import {
  appendLayoutVaryPath,
  finalizeVaryPath,
  getPartialVaryPath,
  getShellSegmentVaryPath,
} from './vary-path'
import {
  type RouteTree,
  type RootRouteTree,
  type RSCSegmentData,
  type RefreshState,
  type RouteTreeAccumulator,
  convertFlightRouterStateToRouteTree,
  convertRootFlightRouterStateToRouteTree,
  createMetadataRouteTree,
  createRootRouteTree,
  getHeadRequestKey,
} from './cache'
import { computeDynamicStaleAt } from './bfcache'

export type NavigationSeed = {
  renderedSearch: NormalizedSearch
  /**
   * The decoded response. The head's `data` is decoded exactly like a segment
   * node's: null when the response carries no head.
   */
  root: RootRouteTree<RSCSegmentData | null>
  dynamicStaleAt: number
  // Whether the response rendered a segment whose identity differs from the
  // base tree's at the same position (inactive parallel route branches are
  // expected to differ and don't count). Only meaningful when the base is a
  // request tree derived from a cached route entry, as during a prefetch:
  // divergence then means the entry doesn't describe what the server renders
  // — the URL has a rewrite that behaves dynamically (see
  // fetchSegmentPrefetchesUsingRuntimeRequest). During a navigation the base
  // is the current page's tree, so divergence carries no signal. False when
  // there was no base to compare against.
  treeDivergedFromBase: boolean
}

/**
 * During a client navigation or prefetch, the server responds with a
 * transport tree that covers only the parts of the route that have changed.
 * This overlays it onto the base tree to produce a full RouteTree — slots the
 * response carries no information about are reused from the client's current
 * state — with the response's render output (RSCSegmentData) attached to
 * each node.
 *
 * "Create", not "decode": callers may pass no transport data at all
 * (refreshes and history restores do), in which case this converts the base
 * tree alone rather than decoding a response.
 */
export function createNavigationSeed(
  now: number,
  // Null when the response is not an overlay over existing client state —
  // per-segment prefetch responses, whose root-anchored tree covers its own
  // spine. Must be non-null when transportData is null (there'd be nothing
  // to convert otherwise).
  currentTree: FlightRouterState | null,
  transportData: PartialTransportData | null,
  // The response's root vary params (its `r` field): the root params
  // accessed anywhere in the response, emitted once at the response level
  // and unioned into the head's and every segment's own drained set here at
  // the decode boundary. Pass null when the response streams in
  // incrementally (navigation and reducer flows): the wire iterables can
  // only be drained completely from a fully-buffered response, so their sets
  // decode as null ("unknown; key on all params") without touching the wire
  // iterables.
  rootVaryParams: VaryParamsIterable | null,
  // Whether anything in the response is not fully resolved: dynamic holes, runtime holes, anything suspended.
  // Boolean-form nodes resolve their partiality to this value (their wire
  // boolean is a render-wide constant that carries no per-node information —
  // see decodeTransportNode), and under Cache Components so does a
  // boolean-form head (see the head read below); staged (promise-form)
  // nodes encode it per-node and ignore it. Only segment-cache writes
  // consume the decoded partiality, so callers whose seeds are never
  // written to the cache may pass the conservative value (true).
  isResponsePartial: boolean,
  // The pathname the response was rendered for. Required to resolve dynamic
  // segments the server sent without a param value (`k: null`); see
  // decodeTransportTreeIntoRouteTree. Callers whose responses always carry
  // concrete values (navigation responses) may pass null.
  renderedPathname: string | null,
  // Already normalized by the response reader (see getRenderedSearch); the
  // router state stores it as a plain string, so it is re-branded here.
  renderedSearch: string,
  // Where to key the head. Null derives it from the route's own first page
  // node (see createRouteTreeNode). Per-segment prefetch payloads pass the
  // route's own metadata vary path instead: a standalone head response's tree
  // is a bare root identity with no page node.
  metadataVaryPath: VaryPath | null,
  dynamicStaleTimeSeconds: number
): NavigationSeed {
  const normalizedRenderedSearch = renderedSearch as NormalizedSearch
  const acc: RouteTreeAccumulator = {
    metadataVaryPath: null,
    treeDivergedFromBase: false,
  }
  let routeTree: RouteTree<RSCSegmentData | null>
  let headData: RSCSegmentData | null = null
  if (transportData !== null) {
    routeTree = decodeTransportTreeIntoRouteTree(
      transportData.t,
      currentTree,
      rootVaryParams,
      isResponsePartial,
      renderedPathname,
      normalizedRenderedSearch,
      acc
    )
    const transportHead = transportData.h
    if (transportHead !== undefined) {
      // The wire form of `p` determines which signal is authoritative for
      // the head's partiality, mirroring the per-node rule in
      // decodeTransportNode:
      //
      // - Promise form (per-segment prefetch responses, fully buffered
      //   before they're decoded): partiality is encoded exactly, per node,
      //   via the staged encoding, so the thenable-status read is
      //   authoritative.
      // - Boolean form (navigation and live-render responses): when Cache
      //   Components is enabled, the server's flag (isPossiblyPartialHead in
      //   app-render.tsx) is unreliable: it's computed before the head is
      //   serialized, so it's conservatively `true` for every
      //   statically-generated PPR page — even pages whose head is actually
      //   complete — and it's `false` for live-render responses whose head
      //   is actually partial (e.g. a route with an async
      //   `generateMetadata`). So we ignore it and derive the head's
      //   partiality from whether the response itself was partial, exactly
      //   as the per-node rule does for segments. A non-partial response
      //   carries a complete head; a partial (postponed) one does not.
      //   Without Cache Components, the server sends the correct
      //   isHeadPartial, so the wire boolean is used as-is.
      headData = {
        rsc: transportHead.r,
        isPartial:
          typeof transportHead.p === 'boolean'
            ? process.env.__NEXT_CACHE_COMPONENTS
              ? isResponsePartial
              : transportHead.p
            : readFulfilledIsPartial(transportHead.p),
        varyParams: decodeVaryParams(transportHead.v, rootVaryParams),
        staleTimeSeconds:
          transportHead.s !== undefined
            ? readFulfilledStaleTimeSeconds(transportHead.s)
            : null,
      }
    }
  } else {
    if (currentTree === null) {
      throw new InvariantError(
        'Cannot convert a server response with no transport data and no ' +
          'base tree.'
      )
    }
    routeTree = convertRootFlightRouterStateToRouteTree(
      currentTree,
      normalizedRenderedSearch,
      acc
    )
  }

  if (metadataVaryPath === null) {
    metadataVaryPath = acc.metadataVaryPath
    if (metadataVaryPath === null) {
      // Every route renders a page, so a rendered tree always has a node to
      // key the head under.
      throw new InvariantError(
        'Cannot key the head of a server response: its tree has no page ' +
          'segment.'
      )
    }
  }

  return {
    root: createRootRouteTree(
      routeTree,
      createMetadataRouteTree(
        metadataVaryPath,
        routeTree.prefetchHints,
        headData
      )
    ),
    renderedSearch: normalizedRenderedSearch,
    dynamicStaleAt: computeDynamicStaleAt(now, dynamicStaleTimeSeconds),
    treeDivergedFromBase: acc.treeDivergedFromBase,
  }
}

/**
 * Creates a RouteTree node for a segment, with its identity and cache-key
 * information (vary paths, the normalized segment value, the refresh state)
 * initialized, and the remaining fields set to their defaults. The caller
 * finishes initializing those in place after recursing into the children.
 * Shared by FlightRouterState conversion, transport decoding, and subtree
 * rebasing so their routing identity stays consistent.
 */
export function createRouteTreeNode<TData>(
  originalSegment: FlightRouterStateSegment,
  isRootParam: boolean,
  requestKey: SegmentRequestKey,
  parentPartialVaryPath: PartialVaryPath | null,
  renderedSearch: NormalizedSearch,
  refreshState: RefreshState | null,
  acc: RouteTreeAccumulator
): RouteTree<TData | null> {
  let segment: FlightRouterStateSegment
  let partialVaryPath: PartialVaryPath | null
  let varyPath: VaryPath
  if (Array.isArray(originalSegment)) {
    const paramCacheKey = originalSegment[1]
    const paramName = originalSegment[0]
    partialVaryPath = appendLayoutVaryPath(
      parentPartialVaryPath,
      paramCacheKey,
      paramName,
      isRootParam
    )
    varyPath = finalizeVaryPath(requestKey, null, partialVaryPath)
    segment = originalSegment
  } else {
    // This segment does not have a param. Inherit the partial vary path of
    // the parent.
    partialVaryPath = parentPartialVaryPath
    if (requestKey.endsWith(PAGE_SEGMENT_KEY)) {
      // This is a page segment.
      segment = PAGE_SEGMENT_KEY
      varyPath = finalizeVaryPath(requestKey, renderedSearch, partialVaryPath)
      // The head is keyed under the route's own first page and varies on the
      // same params as that page (see getHeadRequestKey). A page reused from
      // another URL carries a refresh state and never keys it.
      if (refreshState === null && acc.metadataVaryPath === null) {
        acc.metadataVaryPath = finalizeVaryPath(
          getHeadRequestKey(requestKey),
          renderedSearch,
          partialVaryPath
        )
      }
    } else {
      // This is a layout segment.
      segment = originalSegment
      varyPath = finalizeVaryPath(requestKey, null, partialVaryPath)
    }
  }
  return {
    requestKey,
    segment,
    shellVaryPath: getShellSegmentVaryPath(varyPath),
    refreshState,
    data: null,
    varyPath,
    slots: null,
    prefetchHints: 0,
  }
}

/**
 * Decodes a response's transport tree into a RouteTree, using the client's
 * current router state as the base for the parts of the route the response
 * carries no information about.
 *
 * The response is an overlay over the base:
 *
 * - Nodes with rendered output — and nodes with no data at all, which are
 *   server-sent structure whose output the client fetches lazily — are
 *   authoritative: their identity, hints, and subtree come entirely from
 *   the response.
 * - Skipped nodes (data with a null rsc) sit on the path from the root down
 *   to the rendered subtrees. The client is expected to already have them,
 *   so their refresh state and hints are inherited from the base tree, and
 *   any slot the response doesn't mention is reused from the base as-is.
 *
 * TODO: The base is a FlightRouterState only because that's the
 * representation the client router currently renders from (the router
 * reducer's `state.tree`, which the render tree and layout-router are
 * keyed against). Once the rendering path is updated to use RouteTree as its
 * source of truth, the base tree here can be a RouteTree, and the base-only
 * conversion path (convertFlightRouterStateToRouteTree) goes away with it.
 */
export function decodeTransportTreeIntoRouteTree(
  transportNode: PartialTransportNode,
  baseRouterState: FlightRouterState | null,
  // The response's root vary params, unioned into every segment's drained
  // set. Pass null when vary params are unavailable or unwanted; see
  // createNavigationSeed.
  rootVaryParams: VaryParamsIterable | null,
  // The response-level partiality, which boolean-form nodes resolve their
  // own partiality to; see createNavigationSeed.
  isResponsePartial: boolean,
  // The pathname the response was rendered for (from the response headers).
  // Required to resolve dynamic segments the server sent without a param
  // value (`k: null` — per-segment prefetch responses omit the value to stay
  // cacheable across param values); the client parses the value from the
  // pathname instead. Callers whose responses always carry concrete values
  // (navigation responses) may pass null.
  renderedPathname: string | null,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree<RSCSegmentData | null> {
  const pathnameParts =
    renderedPathname !== null ? splitPathnameIntoParts(renderedPathname) : null
  return decodeTransportNode(
    transportNode,
    resolveTransportSegment(transportNode.s, pathnameParts, 0),
    baseRouterState ?? undefined,
    baseRouterState ?? undefined,
    rootVaryParams,
    isResponsePartial,
    ROOT_SEGMENT_REQUEST_KEY,
    null,
    renderedSearch,
    pathnameParts,
    0,
    acc
  )
}

/**
 * Converts a segment's wire identity to the client `Segment` type, resolving
 * dynamic segments whose param value the server omitted (`k: null`) by
 * parsing the value from the rendered pathname. `pathnamePartsIndex` is the
 * URL position this segment occupies (tracked by the tree walk: incremented
 * only for segments that appear in the URL, so route groups and other
 * virtual segments don't consume a part).
 */
function resolveTransportSegment(
  transportSegment: TransportSegment,
  pathnameParts: Array<string> | null,
  pathnamePartsIndex: number
): FlightRouterStateSegment {
  if (typeof transportSegment === 'string') {
    return transportSegment
  }
  const paramKey = transportSegment.k
  if (paramKey !== null) {
    return [
      transportSegment.n,
      paramKey,
      transportSegment.t,
      transportSegment.s,
    ]
  }
  if (pathnameParts === null) {
    throw new InvariantError(
      'Cannot resolve a dynamic segment that has no param value: the ' +
        'response provides no rendered pathname to parse it from.'
    )
  }
  const paramValue = parseDynamicParamFromURLPart(
    transportSegment.t,
    pathnameParts,
    pathnamePartsIndex
  )
  return [
    transportSegment.n,
    getCacheKeyForDynamicParam(paramValue),
    transportSegment.t,
    transportSegment.s,
  ]
}

function doSegmentsMatch(
  baseSegment: FlightRouterStateSegment,
  segment: FlightRouterStateSegment
): boolean {
  if (typeof baseSegment === 'string' || typeof segment === 'string') {
    // Static segments have to match exactly.
    return baseSegment === segment
  }
  // Both segments are dynamic. The static sibling hints aren't part of the
  // segment's identity, so only compare the param name, type, and value.
  const [baseParamName, baseParamValue, baseParamType] = baseSegment
  const [paramName, paramValue, paramType] = segment
  return (
    baseParamName === paramName &&
    baseParamType === paramType &&
    baseParamValue === paramValue
  )
}

function decodeTransportNode(
  node: PartialTransportNode,
  // The node's identity, already resolved by the caller (the parent's child
  // loop, which has the URL position needed to parse omitted param values).
  originalSegment: FlightRouterStateSegment,
  base: FlightRouterState | undefined,
  // The base node to compare segment identities against (see
  // NavigationSeed.treeDivergedFromBase). Tracked separately from `base`:
  // inheritance drops the base inside authoritative subtrees, where the
  // comparison must continue, and keeps it through inactive parallel routes,
  // where the comparison must stop.
  compareBase: FlightRouterState | undefined,
  rootVaryParams: VaryParamsIterable | null,
  isResponsePartial: boolean,
  requestKey: SegmentRequestKey,
  parentPartialVaryPath: PartialVaryPath | null,
  parentRenderedSearch: NormalizedSearch,
  pathnameParts: Array<string> | null,
  // The URL position this node's children read from.
  pathnamePartsIndex: number,
  acc: RouteTreeAccumulator
): RouteTree<RSCSegmentData | null> {
  const nodeData = node.d
  const inheritsFromBase = nodeData !== undefined && nodeData.r === null
  // The base node this position inherits from, when it does.
  const inheritedBase = inheritsFromBase ? base : undefined

  if (compareBase !== undefined && !acc.treeDivergedFromBase) {
    // Every transport node echoes the segment's identity, even "skipped"
    // ones, so each position can be compared against the base.
    const transportSegment = node.s
    if (typeof transportSegment !== 'string' && transportSegment.k == null) {
      // The server omitted the param value for the client to parse from the
      // URL (see resolveTransportSegment). Nothing to compare; the children
      // are still checked.
    } else {
      const baseSegment = compareBase[0]
      if (originalSegment === DEFAULT_SEGMENT_KEY) {
        // A default filled in by the server is not a claim about the
        // position's identity.
      } else if (!doSegmentsMatch(baseSegment, originalSegment)) {
        acc.treeDivergedFromBase = true
      }
    }
  }

  const baseHints = inheritedBase !== undefined ? (inheritedBase[4] ?? 0) : 0
  let prefetchHints = node.h ?? baseHints

  // This segment's param (if any) is a root param iff the segment is at or
  // above the root layout, which the server marks directly.
  const isRootParam = (prefetchHints & PrefetchHint.IsRootLayoutOrAbove) !== 0

  // Inherited positions keep the base tree's refresh state. Its rendered
  // search is updated to this response's, since all pages within the same
  // response share the same search value. (The refresh state acts like a
  // "context provider" for inactive parallel routes.)
  const baseCompressedRefreshState =
    inheritedBase !== undefined ? (inheritedBase[2] ?? null) : null
  const refreshState: RefreshState | null =
    baseCompressedRefreshState !== null
      ? {
          canonicalUrl: baseCompressedRefreshState[0] as string,
          renderedSearch: parentRenderedSearch,
        }
      : null
  const renderedSearch =
    refreshState !== null ? refreshState.renderedSearch : parentRenderedSearch

  const tree = createRouteTreeNode<RSCSegmentData>(
    originalSegment,
    isRootParam,
    requestKey,
    parentPartialVaryPath,
    renderedSearch,
    refreshState,
    acc
  )
  const partialVaryPath = getPartialVaryPath(tree.varyPath)

  let slots: Map<string, RouteTree<RSCSegmentData | null>> | null = null
  const transportChildren = node.c
  const baseChildren =
    inheritedBase !== undefined ? inheritedBase[1] : undefined
  if (transportChildren !== undefined) {
    for (const [parallelRouteKey, childNode] of transportChildren) {
      const childBase =
        baseChildren !== undefined ? baseChildren[parallelRouteKey] : undefined
      const childSegment = resolveTransportSegment(
        childNode.s,
        pathnameParts,
        pathnamePartsIndex
      )

      let childCompareBase: FlightRouterState | undefined
      if (compareBase !== undefined && !acc.treeDivergedFromBase) {
        const childCompareCandidate = compareBase[1][parallelRouteKey]
        if (childCompareCandidate === undefined) {
          // A slot the base tree doesn't have. Unless the server merely
          // filled it with a default, the trees have different structures.
          if (childSegment !== DEFAULT_SEGMENT_KEY) {
            acc.treeDivergedFromBase = true
          }
        } else if ((childCompareCandidate[2] ?? null) !== null) {
          // The base branch carries a refresh state: an inactive parallel
          // route reused from a different route (e.g. a "default" slot). The
          // server's answer is expected to differ, so skip the branch.
        } else {
          childCompareBase = childCompareCandidate
        }
      }

      // Only advance the URL position for segments that appear in the URL.
      // Virtual segments, like route groups, don't consume a part.
      const childDoesAppearInURL =
        typeof childSegment === 'string'
          ? doesStaticSegmentAppearInURL(childSegment)
          : true
      const childPathnamePartsIndex = childDoesAppearInURL
        ? pathnamePartsIndex + 1
        : pathnamePartsIndex
      const childRequestKey = appendSegmentRequestKeyPart(
        requestKey,
        parallelRouteKey,
        createSegmentRequestKeyPart(childSegment)
      )
      const childTree = decodeTransportNode(
        childNode,
        childSegment,
        childBase,
        childCompareBase,
        rootVaryParams,
        isResponsePartial,
        childRequestKey,
        partialVaryPath,
        renderedSearch,
        pathnameParts,
        childPathnamePartsIndex,
        acc
      )
      if (slots === null) {
        slots = new Map()
      }
      slots.set(parallelRouteKey, childTree)
    }
  }
  if (baseChildren !== undefined) {
    // Slots the response carries no information about are reused from the
    // base tree, structure-only.
    for (const parallelRouteKey in baseChildren) {
      if (
        transportChildren !== undefined &&
        transportChildren.has(parallelRouteKey)
      ) {
        continue
      }
      const childBase = baseChildren[parallelRouteKey]
      const childRequestKey = appendSegmentRequestKeyPart(
        requestKey,
        parallelRouteKey,
        createSegmentRequestKeyPart(childBase[0])
      )
      const childTree = convertFlightRouterStateToRouteTree(
        childBase,
        childRequestKey,
        partialVaryPath,
        renderedSearch,
        acc
      )
      if (slots === null) {
        slots = new Map()
      }
      slots.set(parallelRouteKey, childTree)
    }
  }

  if (inheritsFromBase) {
    // Recompute the propagated "subtree" prefetch hints for this segment,
    // since its children may combine response and base subtrees. Mirrors the
    // propagation done on the server in createTransportTreeFromLoaderTree.
    let propagated = prefetchHints & ~SubtreePrefetchHints
    if (slots !== null) {
      for (const childTree of slots.values()) {
        propagated = propagateSubtreeBits(propagated, childTree.prefetchHints)
      }
    }
    prefetchHints = propagated
  }

  if (nodeData !== undefined) {
    tree.data = {
      rsc: nodeData.r,
      // The wire form of `p` determines which signal is authoritative for
      // this segment's partiality:
      //
      // - Boolean form (navigation and live-render responses): the wire
      //   value is a render-wide constant (`isPossiblyPartialResponse` in
      //   create-component-tree.tsx), identical on every node, so it carries
      //   no per-node information — and it's inaccurate in both directions:
      //   `true` for every node of a statically-generated PPR page even when
      //   the page is actually complete, and `false` for every node of a
      //   dynamic render even when this decode is a truncated stage prefix
      //   whose dynamic rows landed past the boundary. The caller's
      //   response-level value captures both (the `~`/`#` marker for whole
      //   responses; truncation-implied partiality for stage decodes), so it
      //   replaces the wire boolean here.
      // - Promise form (per-segment prefetch responses, fully buffered
      //   before they're decoded): partiality is encoded per node, exactly,
      //   and survives the truncated shell double-decode — a fulfillment row
      //   past the boundary reads as partial. The fulfillment (or its
      //   absence) is already visible on the thenable's status, so it's
      //   authoritative and the response-level value is ignored.
      isPartial:
        typeof nodeData.p === 'boolean'
          ? isResponsePartial
          : readFulfilledIsPartial(nodeData.p),
      // The source of the params this segment's output depends on: the
      // segment's wire iterable, drained here, unioning in the response-level
      // root params (same buffered-read reasoning as `p` above), or decoded
      // as null ("unknown") when the caller passed no root params — see
      // createNavigationSeed.
      varyParams: decodeVaryParams(nodeData.v, rootVaryParams),
      // Per-node staleTime, only present in per-segment prefetch responses
      // (same buffered-read reasoning as `p` above).
      staleTimeSeconds:
        nodeData.s !== undefined
          ? readFulfilledStaleTimeSeconds(nodeData.s)
          : null,
    }
  }

  tree.slots = slots
  tree.prefetchHints = prefetchHints
  return tree
}

// A sentinel `readFulfilledValue` fallback that no fulfillment can produce,
// for reads that only care whether the row settled at all.
const notFulfilled = Symbol()

/**
 * Reads a segment's partialness from its `isPartial` promise. (The
 * fulfillment value is void — partialness is encoded as the ABSENCE of a
 * fulfillment.) The server fulfills it only for a fully-static segment and
 * leaves it pending for a partial one (see the promise form of
 * `TransportSegmentData['p']`), so partial == not fulfilled. A pending row,
 * or a truncated shell decode whose fulfillment landed past the boundary,
 * reads as partial, which is correct either way.
 */
export function readFulfilledIsPartial(isPartial: Promise<void>): boolean {
  return readFulfilledValue(isPartial, notFulfilled) === notFulfilled
}

/**
 * Reads a staleTime (in seconds) from the staleTime async iterable of a
 * fully-buffered response. Because the bytes are all present, each yielded
 * value is already visible on its chunk's thenable status, so this drains
 * synchronously and takes the last value (the final staleTime, matching the
 * async `resolveStaleAt` in cache.ts). Returns null when no usable value was
 * yielded — e.g. a truncated shell decode whose value landed past the
 * boundary — so the caller can fall back to its response-level staleness.
 */
export function readFulfilledStaleTimeSeconds(
  staleTime: AsyncIterable<number>
): number | null {
  const iterator = staleTime[Symbol.asyncIterator]()
  let staleTimeSeconds: number | undefined
  while (true) {
    const chunk = readFulfilledValue(iterator.next(), undefined)
    if (chunk === undefined || chunk.done) {
      break
    }
    staleTimeSeconds = chunk.value
  }
  if (staleTimeSeconds === undefined || isNaN(staleTimeSeconds)) {
    return null
  }
  return staleTimeSeconds
}
