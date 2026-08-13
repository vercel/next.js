/**
 * Decoding of RSC server responses (the transport format defined in
 * shared/lib/rsc-transport) into the client's own representations. This is
 * the only place on the client that consumes transport types; everything
 * downstream operates on RouteTree / NavigationSeed / CacheNode.
 */

import type {
  FlightRouterState,
  HeadData,
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
} from '../../../shared/lib/rsc-transport'
import { transportSegmentToSegment } from '../../../shared/lib/rsc-transport'
import type { VaryParamsIterable } from '../../../shared/lib/segment-cache/vary-params-decoding'
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
import { matchSegment } from '../match-segments'
import type { NormalizedSearch } from './cache-key'
import type {
  PageVaryPath,
  PartialSegmentVaryPath,
  SegmentVaryPath,
} from './vary-path'
import {
  appendLayoutVaryPath,
  finalizeLayoutVaryPath,
  finalizeMetadataVaryPath,
  finalizePageVaryPath,
  getPartialLayoutVaryPath,
  getPartialPageVaryPath,
  getShellSegmentVaryPath,
} from './vary-path'
import {
  type RouteTree,
  type RSCSegmentData,
  type RefreshState,
  type RouteTreeAccumulator,
  convertFlightRouterStateToRouteTree,
  convertRootFlightRouterStateToRouteTree,
} from './cache'
import { computeDynamicStaleAt } from './bfcache'

export type NavigationSeed = {
  renderedSearch: string
  routeTree: RouteTree<RSCSegmentData | null>
  metadataVaryPath: PageVaryPath | null
  head: HeadData | null
  isHeadPartial: boolean
  headVaryParams: VaryParamsIterable | null
  dynamicStaleAt: number
  // Whether the response rendered a segment whose identity differs from the
  // base tree's at the same position (inactive parallel route branches are
  // expected to differ and don't count). Only meaningful when the base is a
  // request tree derived from a cached route entry, as during a prefetch:
  // divergence then means the entry doesn't describe what the server renders
  // — the URL has a rewrite that behaves dynamically (see
  // fetchSegmentPrefetchesUsingDynamicRequest). During a navigation the base
  // is the current page's tree, so divergence carries no signal. False when
  // there was no base to compare against.
  treeDivergedFromBase: boolean
}

export function convertServerPatchToFullTree(
  now: number,
  currentTree: FlightRouterState,
  transportData: PartialTransportData | null,
  renderedSearch: string,
  dynamicStaleTimeSeconds: number
): NavigationSeed {
  // During a client navigation or prefetch, the server responds with a
  // transport tree that covers only the parts of the route that have changed.
  // Decode it into a full RouteTree, overlaying it on the base tree so that
  // the slots the response carries no information about are reused from the
  // client's current state.
  //
  // The returned RouteTree carries the response's render output on each node
  // (RSCSegmentData). Pass a null transportData to convert the base tree
  // alone (e.g. for refreshes and history restores, before a response
  // is received).
  const acc: RouteTreeAccumulator = {
    metadataVaryPath: null,
    treeDivergedFromBase: false,
  }
  let routeTree: RouteTree<RSCSegmentData | null>
  let head: HeadData | null = null
  let isHeadPartial = true
  let headVaryParams: VaryParamsIterable | null = null
  if (transportData !== null) {
    routeTree = decodeTransportTreeIntoRouteTree(
      transportData.t,
      currentTree,
      renderedSearch as NormalizedSearch,
      acc
    )
    const transportHead = transportData.h
    if (transportHead !== undefined) {
      head = transportHead.r
      isHeadPartial = transportHead.p
      headVaryParams = transportHead.v
    }
  } else {
    routeTree = convertRootFlightRouterStateToRouteTree(
      currentTree,
      renderedSearch as NormalizedSearch,
      acc
    )
  }

  return {
    routeTree,
    metadataVaryPath: acc.metadataVaryPath,
    renderedSearch,
    head,
    isHeadPartial,
    headVaryParams,
    dynamicStaleAt: computeDynamicStaleAt(now, dynamicStaleTimeSeconds),
    treeDivergedFromBase: acc.treeDivergedFromBase,
  }
}

/**
 * Creates a RouteTree node for a segment, with its identity and cache-key
 * information (vary paths, page-ness, the normalized segment value)
 * initialized, and the remaining fields set to their defaults. The caller
 * finishes initializing those in place after recursing into the children.
 * Shared by the FlightRouterState converter and the transport decoder so the
 * two cannot drift, and so every node they produce has the same property
 * order (one hidden class).
 */
export function createRouteTreeNode<TData>(
  originalSegment: FlightRouterStateSegment,
  isRootParam: boolean,
  requestKey: SegmentRequestKey,
  parentPartialVaryPath: PartialSegmentVaryPath | null,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree<TData | null> {
  let segment: FlightRouterStateSegment
  let partialVaryPath: PartialSegmentVaryPath | null
  let isPage: boolean
  let varyPath: SegmentVaryPath
  if (Array.isArray(originalSegment)) {
    isPage = false
    const paramCacheKey = originalSegment[1]
    const paramName = originalSegment[0]
    partialVaryPath = appendLayoutVaryPath(
      parentPartialVaryPath,
      paramCacheKey,
      paramName,
      isRootParam
    )
    varyPath = finalizeLayoutVaryPath(requestKey, partialVaryPath)
    segment = originalSegment
  } else {
    // This segment does not have a param. Inherit the partial vary path of
    // the parent.
    partialVaryPath = parentPartialVaryPath
    if (requestKey.endsWith(PAGE_SEGMENT_KEY)) {
      // This is a page segment.
      isPage = true

      // The navigation implementation expects the search params to be included
      // in the segment. However, in the case of a static response, the search
      // params are omitted. So the client needs to add them back in when reading
      // from the Segment Cache.
      //
      // For consistency, we'll do this for dynamic responses, too.
      //
      // TODO: We should move search params out of FlightRouterState and handle
      // them entirely on the client, similar to our plan for dynamic params.
      segment = PAGE_SEGMENT_KEY
      varyPath = finalizePageVaryPath(
        requestKey,
        renderedSearch,
        partialVaryPath
      )
      // The metadata "segment" is not part the route tree, but it has the same
      // conceptual params as a page segment. Write the vary path into the
      // accumulator object. If there are multiple parallel pages, we use the
      // first one. Which page we choose is arbitrary as long as it's
      // consistently the same one every time every time. See
      // finalizeMetadataVaryPath for more details.
      if (acc.metadataVaryPath === null) {
        acc.metadataVaryPath = finalizeMetadataVaryPath(
          requestKey,
          renderedSearch,
          partialVaryPath
        )
      }
    } else {
      // This is a layout segment.
      isPage = false
      segment = originalSegment
      varyPath = finalizeLayoutVaryPath(requestKey, partialVaryPath)
    }
  }
  return {
    requestKey,
    segment,
    shellVaryPath: getShellSegmentVaryPath(varyPath),
    refreshState: null,
    data: null,
    // TODO: Cheating the type system here a bit because TypeScript can't tell
    // that the type of isPage and varyPath are consistent. If isPage were
    // wrong it would break the behavior and we'd catch it quickly.
    varyPath: varyPath as any,
    isPage: isPage as boolean as any,
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
 * reducer's `state.tree`, which the CacheNode tree and layout-router are
 * keyed against). Once the rendering path is updated to use RouteTree as its
 * source of truth, the base tree here can be a RouteTree, and the base-only
 * conversion path (convertFlightRouterStateToRouteTree) goes away with it.
 */
export function decodeTransportTreeIntoRouteTree(
  transportNode: PartialTransportNode,
  baseRouterState: FlightRouterState | null,
  renderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree<RSCSegmentData | null> {
  return decodeTransportNode(
    transportNode,
    baseRouterState ?? undefined,
    baseRouterState ?? undefined,
    ROOT_SEGMENT_REQUEST_KEY,
    null,
    renderedSearch,
    acc
  )
}

function decodeTransportNode(
  node: PartialTransportNode,
  base: FlightRouterState | undefined,
  // The base node to compare segment identities against (see
  // NavigationSeed.treeDivergedFromBase). Tracked separately from `base`:
  // inheritance drops the base inside authoritative subtrees, where the
  // comparison must continue, and keeps it through inactive parallel routes,
  // where the comparison must stop.
  compareBase: FlightRouterState | undefined,
  requestKey: SegmentRequestKey,
  parentPartialVaryPath: PartialSegmentVaryPath | null,
  parentRenderedSearch: NormalizedSearch,
  acc: RouteTreeAccumulator
): RouteTree<RSCSegmentData | null> {
  const nodeData = node.d
  const inheritsFromBase = nodeData !== undefined && nodeData.r === null
  // The base node this position inherits from, when it does.
  const inheritedBase = inheritsFromBase ? base : undefined

  const originalSegment = transportSegmentToSegment(node.s)

  if (compareBase !== undefined && !acc.treeDivergedFromBase) {
    // Every transport node echoes the segment's identity, even "skipped"
    // ones, so each position can be compared against the base.
    const transportSegment = node.s
    if (typeof transportSegment !== 'string' && transportSegment.k == null) {
      // The server omitted the param value for the client to parse from the
      // URL (see the TODO in transportSegmentToSegment). Nothing to compare;
      // the children are still checked.
    } else {
      const baseSegment = compareBase[0]
      if (
        typeof originalSegment === 'string' &&
        typeof baseSegment === 'string' &&
        originalSegment.startsWith(PAGE_SEGMENT_KEY) &&
        baseSegment.startsWith(PAGE_SEGMENT_KEY)
      ) {
        // Page segments match modulo embedded search params, which are
        // validated separately (see getRenderedSearch).
      } else if (originalSegment === DEFAULT_SEGMENT_KEY) {
        // A default filled in by the server is not a claim about the
        // position's identity.
      } else if (!matchSegment(baseSegment, originalSegment)) {
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
    acc
  )
  tree.refreshState = refreshState
  const partialVaryPath = tree.isPage
    ? getPartialPageVaryPath(tree.varyPath)
    : getPartialLayoutVaryPath(tree.varyPath)

  let slots: Map<string, RouteTree<RSCSegmentData | null>> | null = null
  const transportChildren = node.c
  const baseChildren =
    inheritedBase !== undefined ? inheritedBase[1] : undefined
  if (transportChildren !== undefined) {
    for (const [parallelRouteKey, childNode] of transportChildren) {
      const childBase =
        baseChildren !== undefined ? baseChildren[parallelRouteKey] : undefined
      const childSegment = transportSegmentToSegment(childNode.s)

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

      const childRequestKey = appendSegmentRequestKeyPart(
        requestKey,
        parallelRouteKey,
        createSegmentRequestKeyPart(childSegment)
      )
      const childTree = decodeTransportNode(
        childNode,
        childBase,
        childCompareBase,
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
      isPartial: nodeData.p,
      varyParams: nodeData.v,
    }
  }

  tree.slots = slots
  tree.prefetchHints = prefetchHints
  return tree
}
