/* eslint-disable @next/internal/no-ambiguous-jsx -- Bundled in entry-base so it gets the right JSX runtime. */
import type {
  CacheNodeSeedData,
  FlightRouterState,
  InitialRSCPayload,
  DynamicParamTypesShort,
  HeadData,
  PrefetchHints,
} from '../../shared/lib/app-router-types'
import {
  PrefetchHint,
  StaticPrefetchDisabled,
} from '../../shared/lib/app-router-types'
import {
  readVaryParams,
  type VaryParamsIterable,
} from '../../shared/lib/segment-cache/vary-params-decoding'
import type { ManifestNode } from '../../build/webpack/plugins/flight-manifest-plugin'

// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'
// eslint-disable-next-line import/no-extraneous-dependencies
import { prerender } from 'react-server-dom-webpack/static'

import {
  streamFromBuffer,
  streamToBuffer,
} from '../stream-utils/node-web-streams-helper'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import {
  type SegmentRequestKey,
  createSegmentRequestKeyPart,
  appendSegmentRequestKeyPart,
  ROOT_SEGMENT_REQUEST_KEY,
  HEAD_REQUEST_KEY,
} from '../../shared/lib/segment-cache/segment-value-encoding'
import { getDigestForWellKnownError } from './create-error-handler'
import {
  Phase,
  printDebugThrownValueForProspectiveRender,
} from './prospective-render-utils'
import { workAsyncStorage } from './work-async-storage.external'

// Contains metadata about the route tree. The client must fetch this before
// it can fetch any actual segment data.
export type RootTreePrefetch = {
  buildId?: string
  tree: TreePrefetch
  staleTime: number
}

export type TreePrefetchParam = {
  type: DynamicParamTypesShort
  // When cacheComponents is enabled, this field is always null.
  // Instead we parse the param on the client, allowing us to omit it from
  // the prefetch response and increase its cacheability.
  key: string | null
  // Static sibling segments at the same URL level. Used by the client
  // router to determine if a prefetch can be reused when navigating to
  // a static sibling of a dynamic route. For example, if the route is
  // /products/[id] and there's also /products/sale, then siblings
  // would be ['sale']. null means the siblings are unknown (e.g. in
  // webpack dev mode).
  siblings: readonly string[] | null
}

export type TreePrefetch = {
  name: string
  // Only present for parameterized (dynamic) segments.
  param: TreePrefetchParam | null

  // Child segments.
  slots: null | {
    [parallelRouteKey: string]: TreePrefetch
  }

  /** Bitmask of PrefetchHint flags for this segment and its subtree */
  prefetchHints: number
}

/**
 * Top-level response for a segment prefetch request. Contains the build ID
 * and an array of segment data (one per segment in the bundle).
 *
 * Ordering contract: data[0] is the requested (terminal) segment. Subsequent
 * elements are ancestors that were inlined into this response, built by
 * walking the SegmentBundleNode linked list. The client's SegmentBundle
 * linked list is constructed in the same order during scheduling, so the
 * two are walked in parallel when the response arrives. A null element
 * indicates a disabled segment (runtime prefetch or instant=false) that
 * occupies a slot but carries no data.
 */
export type SegmentPrefetchResponse = {
  buildId: string
  data: Array<SegmentPrefetch | null>
  /**
   * True if this response was generated from a fallback shell render (i.e. the
   * page had not yet been prerendered with concrete params, so it was rendered
   * with `fallbackRouteParams`). The client uses this to schedule a retry,
   * since a more complete version may become available once the server's
   * background regeneration finishes.
   *
   * Note: this is distinct from per-segment `isPartial`. A fully-prerendered
   * PPR page can have partial segments (dynamic holes filled by runtime
   * requests); those should not be retried. `isUpgradeableISRFallback` specifically means a
   * more complete *static* version may become available.
   */
  isUpgradeableISRFallback: boolean
}

export type SegmentPrefetch = {
  rsc: React.ReactNode | null
  isPartial: boolean
  staleTime: number
  /**
   * The set of params that this segment's output depends on. Used by the client
   * cache to determine which entries can be reused across different param
   * values.
   * - `null` means vary params were not tracked (conservative: assume all
   *   params matter)
   * - Empty set means no params were accessed (segment is reusable for any
   *   param values)
   */
  varyParams: Set<string> | null
}

/**
 * Server-side equivalent of the client's SegmentBundle linked list. Each
 * node holds the RSC data and vary params for a segment whose data will
 * be bundled into a descendant's response. Flattened to an array only at
 * serialization time in renderSegmentPrefetch.
 */
type SegmentBundleNode = {
  rsc: React.ReactNode
  varyParams: Set<string> | null
  next: SegmentBundleNode | null
}

const filterStackFrame =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .filterStackFrameDEV
    : undefined
const findSourceMapURL =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .findSourceMapURLDEV
    : undefined

function onSegmentPrerenderError(error: unknown) {
  const digest = getDigestForWellKnownError(error)
  if (digest) {
    return digest
  }
  // We don't need to log the errors because we would have already done that
  // when generating the original Flight stream for the whole page.
  if (process.env.NEXT_DEBUG_BUILD || process.env.__NEXT_VERBOSE_LOGGING) {
    const workStore = workAsyncStorage.getStore()
    printDebugThrownValueForProspectiveRender(
      error,
      workStore?.route ?? 'unknown route',
      Phase.SegmentCollection
    )
  }
}

/**
 * Extract the FlightRouterState, seed data, and head from a prerendered
 * InitialRSCPayload. Returns null if the payload doesn't match the expected
 * shape (single path with 3 elements).
 */
function extractFlightData(initialRSCPayload: InitialRSCPayload): {
  buildId: string | undefined
  flightRouterState: FlightRouterState
  seedData: CacheNodeSeedData
  head: HeadData
} | null {
  const flightDataPaths = initialRSCPayload.f
  // FlightDataPath is an unsound type, hence the additional checks.
  if (flightDataPaths.length !== 1 && flightDataPaths[0].length !== 3) {
    console.error(
      'Internal Next.js error: InitialRSCPayload does not match the expected ' +
        'shape for a prerendered page during segment prefetch generation.'
    )
    return null
  }
  return {
    buildId: initialRSCPayload.b,
    flightRouterState: flightDataPaths[0][0],
    seedData: flightDataPaths[0][1],
    head: flightDataPaths[0][2],
  }
}

export async function collectSegmentData(
  isCacheComponentsEnabled: boolean,
  fullPageDataBuffer: Buffer,
  staleTime: number,
  clientModules: ManifestNode,
  serverConsumerManifest: any,
  prefetchInlining: boolean,
  hints: PrefetchHints | null,
  isUpgradeableISRFallback: boolean
): Promise<Map<SegmentRequestKey, Buffer>> {
  // Traverse the router tree and generate a prefetch response for each segment.

  // A mutable map to collect the results as we traverse the route tree.
  const resultMap = new Map<SegmentRequestKey, Buffer>()

  // Before we start, warm up the module cache by decoding the page data once.
  // Then we can assume that any remaining async tasks that occur the next time
  // are due to hanging promises caused by dynamic data access. Note we only
  // have to do this once per page, not per individual segment.
  //
  try {
    await createFromReadableStream(streamFromBuffer(fullPageDataBuffer), {
      findSourceMapURL,
      serverConsumerManifest,
    })
    await waitAtLeastOneReactRenderTask()
  } catch {}

  // Create an abort controller that we'll use to stop the stream.
  const abortController = new AbortController()
  const onCompletedProcessingRouteTree = async () => {
    // Since all we're doing is decoding and re-encoding a cached prerender, if
    // serializing the stream takes longer than a microtask, it must because of
    // hanging promises caused by dynamic data.
    await waitAtLeastOneReactRenderTask()
    abortController.abort()
  }

  // Generate a stream for the route tree prefetch. While we're walking the
  // tree, we'll also spawn additional tasks to generate the segment prefetches.
  // The promises for these tasks are pushed to a mutable array that we will
  // await once the route tree is fully rendered.
  const segmentTasks: Array<Promise<[SegmentRequestKey, Buffer]>> = []
  const { prelude: treeStream } = await prerender(
    // RootTreePrefetch is not a valid return type for a React component, but
    // we need to use a component so that when we decode the original stream
    // inside of it, the side effects are transferred to the new stream.
    // @ts-expect-error
    <PrefetchTreeData
      isClientParamParsingEnabled={isCacheComponentsEnabled}
      fullPageDataBuffer={fullPageDataBuffer}
      serverConsumerManifest={serverConsumerManifest}
      clientModules={clientModules}
      staleTime={staleTime}
      segmentTasks={segmentTasks}
      onCompletedProcessingRouteTree={onCompletedProcessingRouteTree}
      prefetchInlining={prefetchInlining}
      hints={hints}
      isUpgradeableISRFallback={isUpgradeableISRFallback}
    />,
    clientModules,
    {
      filterStackFrame,
      signal: abortController.signal,
      onError: onSegmentPrerenderError,
    }
  )

  // Write the route tree to a special `/_tree` segment.
  const treeBuffer = await streamToBuffer(treeStream)
  resultMap.set('/_tree' as SegmentRequestKey, treeBuffer)

  // Also output the entire full page data response
  resultMap.set('/_full' as SegmentRequestKey, fullPageDataBuffer)

  // Now that we've finished rendering the route tree, all the segment tasks
  // should have been spawned. Await them in parallel and write the segment
  // prefetches to the result map.
  let hasPageSegment = false
  for (const [segmentPath, buffer] of await Promise.all(segmentTasks)) {
    resultMap.set(segmentPath, buffer)
    if (segmentPath.endsWith('__PAGE__')) {
      hasPageSegment = true
    }
  }

  if (!hasPageSegment) {
    // The build requires at least one segment path ending with __PAGE__ to
    // register the catch-all segment data route. When all page segments are
    // disabled (e.g. every leaf has runtime prefetching), no __PAGE__ entry
    // is emitted. Write a dummy entry with a path that doesn't match any
    // real route segment so the client will never request it.
    //
    // TODO: Remove the __PAGE__ requirement from the build instead of
    // working around it here. The invariant is outdated now that segments
    // can be disabled.
    resultMap.set(
      '/todo-remove-fake-segment/__PAGE__' as SegmentRequestKey,
      Buffer.alloc(0)
    )
  }

  return resultMap
}

/**
 * Compute prefetch hints for a route by measuring segment sizes and deciding
 * which segments should be inlined. Only runs at build time. The results are
 * written to prefetch-hints.json and loaded at server startup.
 *
 * This is a separate pass from collectSegmentData so that the inlining
 * decisions can be fed back into collectSegmentData to control which segments
 * are output as separate entries vs. inlined into their parent.
 */
export async function collectPrefetchHints(
  fullPageDataBuffer: Buffer,
  staleTime: number,
  clientModules: ManifestNode,
  serverConsumerManifest: any,
  maxSize: number,
  maxBundleSize: number
): Promise<PrefetchHints> {
  // Warm up the module cache, same as collectSegmentData.
  try {
    await createFromReadableStream(streamFromBuffer(fullPageDataBuffer), {
      findSourceMapURL,
      serverConsumerManifest,
    })
    await waitAtLeastOneReactRenderTask()
  } catch {}

  // Decode the Flight data to walk the route tree.
  const initialRSCPayload: InitialRSCPayload = await createFromReadableStream(
    createUnclosingPrefetchStream(streamFromBuffer(fullPageDataBuffer)),
    {
      findSourceMapURL,
      serverConsumerManifest,
    }
  )

  const flightData = extractFlightData(initialRSCPayload)
  if (flightData === null) {
    return { hints: 0, slots: null }
  }
  const { buildId, flightRouterState, seedData, head } = flightData

  // Root params are emitted once at the top level; readVaryParams unions them
  // into the head, and the iterable is threaded down so every segment below
  // unions it too.
  const rootVaryParamsIterable = initialRSCPayload.r ?? null

  // Measure the head (metadata/viewport) gzip size so the main traversal
  // can decide whether to inline it into a page's bundle.
  const headVaryParams = readVaryParams(
    initialRSCPayload.h,
    rootVaryParamsIterable
  )

  const [, headBuffer] = await renderSegmentPrefetch(
    buildId,
    staleTime,
    head,
    HEAD_REQUEST_KEY,
    headVaryParams,
    clientModules,
    null,
    // This pass only measures gzip sizes for inlining hints; fallback-ness
    // doesn't affect size, so pass false.
    false
  )
  const headGzipSize = await getGzipSize(headBuffer)

  // Mutable accumulator: the first segment that accepts the head sets this
  // to true. Once set, subsequent segments skip the check.
  //
  // When the route has any runtime prefetch segment, the head is only
  // assigned to a runtime segment (since the runtime response already
  // includes it). Static pages are skipped to avoid duplication.
  const rootHints = flightRouterState[4] ?? 0
  const subtreeHasRuntimePrefetch =
    (rootHints & PrefetchHint.SubtreeHasRuntimePrefetch) !== 0
  const headInlineState = { inlined: false }

  // Walk the tree with the parent-first, child-decides algorithm.
  const { node } = await collectPrefetchHintsImpl(
    flightRouterState,
    buildId,
    staleTime,
    seedData,
    clientModules,
    ROOT_SEGMENT_REQUEST_KEY,
    null, // root has no parent to inline
    maxSize,
    maxBundleSize,
    headGzipSize,
    headInlineState,
    subtreeHasRuntimePrefetch,
    rootVaryParamsIterable
  )

  if (!headInlineState.inlined) {
    // No page could accept the head. Set HeadOutlined on the root so the
    // client knows to fetch the head separately.
    node.hints |= PrefetchHint.HeadOutlined
  }

  return node
}

// Measure a segment's gzip size and decide whether it should be inlined.
//
// These hints are computed once during build and never change for the
// lifetime of that deployment. The client can assume that hints delivered as
// part of one request will be the same during a subsequent request, given
// the same build ID. There's no skew to worry about as long as the build
// itself is consistent.
//
// In the Segment Cache, we split page prefetches into multiple requests so
// that each one can be cached and deduped independently. However, some
// segments are small enough that the potential caching benefits are not worth
// the additional network overhead. For these, we inline a parent's data into
// one of its children's responses, avoiding a separate request. The parent
// is inlined into the child (not the other way around) because the parent's
// response is more likely to be shared across multiple pages. The child's
// response is already page-specific, so adding the parent's data there
// doesn't meaningfully reduce deduplication. It's similar to how JS bundlers
// decide whether to inline a module into a chunk.
//
// The algorithm is parent-first, child-decides: the parent measures itself
// and passes its gzip size down. Each child decides whether to accept. A
// child rejects if the parent exceeds maxSize or if accepting would push
// the cumulative inlined bytes past maxBundleSize. This produces
// both ParentInlinedIntoSelf (on the child) and InlinedIntoChild (on the
// parent) in a single pass.
async function collectPrefetchHintsImpl(
  route: FlightRouterState,
  buildId: string | undefined,
  staleTime: number,
  seedData: CacheNodeSeedData | null,
  clientModules: ManifestNode,
  // TODO: Consider persisting the computed requestKey into the hints output
  // so it doesn't need to be recomputed during the build. This might also
  // suggest renaming prefetch-hints.json to something like
  // segment-manifest.json, since it would contain more than just hints.
  requestKey: SegmentRequestKey,
  parentGzipSize: number | null,
  maxSize: number,
  maxBundleSize: number,
  headGzipSize: number,
  headInlineState: { inlined: boolean },
  routeHasRuntimePrefetch: boolean,
  rootVaryParamsIterable: VaryParamsIterable | null
): Promise<{
  node: PrefetchHints
  // Total inlined bytes accumulated along the deepest accepting path in this
  // subtree. Used by ancestors for budget checks.
  inlinedBytes: number
}> {
  // Check if static prefetching is disabled for this segment (runtime
  // prefetch or instant = false). Such segments act as transparent
  // pass-throughs in the bundle chain: they contribute zero bytes of their
  // own and pass parent data through to children. However, they cannot be
  // the terminal of a chain — if no child accepts the parent data, the
  // parent cannot be inlined into this segment because there's no static
  // response to carry it. See the ParentInlinedIntoSelf check below.
  const isStaticPrefetchDisabled =
    ((route[4] ?? 0) & StaticPrefetchDisabled) !== 0

  // Render current segment and measure its gzip size. Skip measurement for
  // segments with static prefetching disabled since they contribute nothing.
  let currentGzipSize: number | null = null
  if (!isStaticPrefetchDisabled && seedData !== null) {
    const varyParams = readVaryParams(seedData[4], rootVaryParamsIterable)

    const [, buffer] = await renderSegmentPrefetch(
      buildId,
      staleTime,
      seedData[0],
      requestKey,
      varyParams,
      clientModules,
      null,
      // Size-measurement pass only; fallback-ness is irrelevant here.
      false
    )
    currentGzipSize = await getGzipSize(buffer)
  }

  // Only offer this segment to its children for inlining if its gzip size
  // is below maxSize. Segments with static prefetching disabled have
  // nothing to offer (their slot in the bundle is null).
  const sizeToInline =
    currentGzipSize !== null && currentGzipSize < maxSize
      ? currentGzipSize
      : null

  // Process children serially (not in parallel) to ensure deterministic
  // results. Since this only runs at build time and the rendering is just
  // re-encoding cached prerenders, this won't impact build times. Each child
  // receives our gzip size and decides whether to inline us. Once a child
  // accepts, we stop offering to remaining siblings — the parent is only
  // inlined into one child. In parallel routes, this avoids duplicating the
  // parent's data across multiple sibling responses.
  const children = route[1]
  const seedDataChildren = seedData !== null ? seedData[1] : null

  let slots: Record<string, PrefetchHints> | null = null
  let didInlineIntoChild = false
  let acceptingChildInlinedBytes = 0
  // Track the smallest inlinedBytes across all children so we know how much
  // budget remains along the best path. When our own parent asks whether we
  // can accept its data, the parent's bytes would flow through to the child
  // with the most remaining headroom.
  let smallestChildInlinedBytes = Infinity
  let hasChildren = false

  for (const parallelRouteKey in children) {
    hasChildren = true
    const childRoute = children[parallelRouteKey]
    const childSegment = childRoute[0]
    const childSeedData =
      seedDataChildren !== null
        ? (seedDataChildren[parallelRouteKey] ?? null)
        : null

    const childRequestKey = appendSegmentRequestKeyPart(
      requestKey,
      parallelRouteKey,
      createSegmentRequestKeyPart(childSegment)
    )

    // Determine what size to offer children for inlining. Normally we offer
    // our own size. But if static prefetching is disabled for this segment,
    // it has no data of its own — instead it passes the parent's offer
    // through to children. This allows a static grandparent to inline
    // through a disabled intermediate segment into a static grandchild.
    const sizeToOfferChild = isStaticPrefetchDisabled
      ? parentGzipSize
      : sizeToInline

    const childResult = await collectPrefetchHintsImpl(
      childRoute,
      buildId,
      staleTime,
      childSeedData,
      clientModules,
      childRequestKey,
      // Once a child has accepted us, stop offering to remaining siblings.
      didInlineIntoChild ? null : sizeToOfferChild,
      maxSize,
      maxBundleSize,
      headGzipSize,
      headInlineState,
      routeHasRuntimePrefetch,
      rootVaryParamsIterable
    )

    if (slots === null) {
      slots = {}
    }
    slots[parallelRouteKey] = childResult.node

    if (childResult.node.hints & PrefetchHint.ParentInlinedIntoSelf) {
      // This child accepted our data — it will include our segment's
      // response in its own. No need to track headroom anymore since
      // we already know which child we're inlined into.
      didInlineIntoChild = true
      acceptingChildInlinedBytes = childResult.inlinedBytes
    } else if (!didInlineIntoChild) {
      // Track the child with the most remaining headroom. Used below
      // when deciding whether to accept our own parent's data.
      if (childResult.inlinedBytes < smallestChildInlinedBytes) {
        smallestChildInlinedBytes = childResult.inlinedBytes
      }
    }
  }

  // Leaf segment: no children have consumed any budget yet.
  if (!hasChildren) {
    smallestChildInlinedBytes = 0
  }

  // Mark this segment as InlinedIntoChild if one of its children accepted.
  // This means this segment doesn't need its own prefetch response — its
  // data is included in the accepting child's response instead.
  let hints = 0
  if (didInlineIntoChild) {
    hints |= PrefetchHint.InlinedIntoChild
  }

  // inlinedBytes represents the total gzipped bytes of parent data inlined
  // into the deepest "inlining target" along this branch. It starts at 0 at
  // the leaves and grows as parents are inlined going back up the tree. If a
  // child accepted us, our size is already counted in that child's value.
  let inlinedBytes = didInlineIntoChild
    ? acceptingChildInlinedBytes
    : smallestChildInlinedBytes

  // Determine which segment is responsible for the head (metadata/viewport).
  //
  // When the route has any runtime prefetch segment, the head is only
  // assigned to a runtime segment — the runtime response already includes
  // the head, so assigning it to a static page would duplicate it.
  //
  // When the route has no runtime prefetch segments, the head is assigned
  // to the first static page terminal that has budget room. Head can only
  // be inlined into a page, not a layout, because pages may access
  // additional params (e.g. searchParams) that layouts cannot.
  //
  // A disabled segment with PrefetchDisabled (instant = false) is never a
  // valid target — it has no response at all.
  const hasRuntimePrefetch =
    ((route[4] ?? 0) & PrefetchHint.HasRuntimePrefetch) !== 0
  const isBundleTerminal = !didInlineIntoChild && !isStaticPrefetchDisabled
  const segment = route[0]
  const isPageSegment =
    typeof segment === 'string'
      ? segment === PAGE_SEGMENT_KEY
      : segment[0] === PAGE_SEGMENT_KEY
  if (!headInlineState.inlined) {
    if (hasRuntimePrefetch) {
      // Runtime prefetch segment — the runtime response includes the head.
      // No budget cost since it's already part of that response.
      hints |= PrefetchHint.HeadInlinedIntoSelf
      headInlineState.inlined = true
    } else if (isBundleTerminal && isPageSegment && !routeHasRuntimePrefetch) {
      // Static page terminal — only used when no runtime segments exist.
      // The head counts against the bundle budget.
      if (inlinedBytes + headGzipSize < maxBundleSize) {
        hints |= PrefetchHint.HeadInlinedIntoSelf
        inlinedBytes += headGzipSize
        headInlineState.inlined = true
      }
    }
  }

  // Decide whether to accept our own parent's data. Conditions:
  //
  // 1. The parent offered us a size (parentGzipSize is not null). It's null
  //    when the parent is too large to inline or when this is the root.
  //
  // 2. The total inlined bytes along this branch wouldn't exceed the budget.
  //    Even if each segment is individually small, at some point it no
  //    longer makes sense to keep adding bytes because the combined response
  //    is unique per URL and can't be deduped.
  //
  // 3. If this segment has static prefetching disabled, it can only accept
  //    the parent if it has successfully inlined into a child. A disabled
  //    segment is a transparent pass-through — it passes parent data through
  //    to descendants. But if no descendant accepted, there's no static
  //    response to carry the parent's data, so the parent must remain
  //    outlined.
  //
  // A node can be both InlinedIntoChild and ParentInlinedIntoSelf. This
  // happens in multi-level chains: GP → P → C where all are small. C
  // accepts P (P is InlinedIntoChild), then P also accepts GP (P is
  // ParentInlinedIntoSelf). The result: C's response includes both P's
  // and GP's data. The parent's data flows through to the deepest
  // accepting descendant.
  if (parentGzipSize !== null) {
    // A disabled segment can only pass through — it needs a child to
    // ultimately accept the parent's data.
    const canAcceptParent = !isStaticPrefetchDisabled || didInlineIntoChild
    if (canAcceptParent && inlinedBytes + parentGzipSize < maxBundleSize) {
      hints |= PrefetchHint.ParentInlinedIntoSelf
      inlinedBytes += parentGzipSize
    }
  }

  return {
    node: { hints, slots },
    inlinedBytes,
  }
}

// We use gzip size rather than raw size because it better reflects the actual
// transfer cost. The inlining trade-off is about whether the overhead of an
// additional HTTP request (connection setup, headers, round trip) is worth
// the deduplication benefit of keeping a segment separate. Below some
// compressed size, the request overhead dominates and inlining is better.
// Above it, the deduplication benefit of a cacheable standalone response
// wins out.
async function getGzipSize(buffer: Buffer): Promise<number> {
  const stream = new Blob([new Uint8Array(buffer)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  const compressedBlob = await new Response(stream).blob()
  return compressedBlob.size
}

async function PrefetchTreeData({
  isClientParamParsingEnabled,
  fullPageDataBuffer,
  serverConsumerManifest,
  clientModules,
  staleTime,
  segmentTasks,
  onCompletedProcessingRouteTree,
  prefetchInlining,
  hints,
  isUpgradeableISRFallback,
}: {
  isClientParamParsingEnabled: boolean
  fullPageDataBuffer: Buffer
  serverConsumerManifest: any
  clientModules: ManifestNode
  staleTime: number
  segmentTasks: Array<Promise<[SegmentRequestKey, Buffer]>>
  onCompletedProcessingRouteTree: () => void
  prefetchInlining: boolean
  hints: PrefetchHints | null
  isUpgradeableISRFallback: boolean
}): Promise<RootTreePrefetch | null> {
  // We're currently rendering a Flight response for the route tree prefetch.
  // Inside this component, decode the Flight stream for the whole page. This is
  // a hack to transfer the side effects from the original Flight stream (e.g.
  // Float preloads) onto the Flight stream for the tree prefetch.
  // TODO: React needs a better way to do this. Needed for Server Actions, too.
  const initialRSCPayload: InitialRSCPayload = await createFromReadableStream(
    createUnclosingPrefetchStream(streamFromBuffer(fullPageDataBuffer)),
    {
      findSourceMapURL,
      serverConsumerManifest,
    }
  )

  const flightData = extractFlightData(initialRSCPayload)
  if (flightData === null) {
    return null
  }
  const { buildId, flightRouterState, seedData, head } = flightData

  // Root params are emitted once at the top level; readVaryParams unions them
  // into the head, and the iterable is threaded down so every segment below
  // unions it too. The iterables should be drained to completion by now (the
  // stream is buffered); a hanging one reads as the params yielded so far.
  const rootVaryParamsIterable = initialRSCPayload.r ?? null

  // Extract the head vary params from the decoded response.
  const headVaryParams = readVaryParams(
    initialRSCPayload.h,
    rootVaryParamsIterable
  )

  // Only applies when prefetch inlining is enabled — the client doesn't
  // know to look for the head inside a page's response otherwise.
  const headIsInlined =
    prefetchInlining &&
    hints !== null &&
    !(hints.hints & PrefetchHint.HeadOutlined)

  // Compute the route metadata tree by traversing the FlightRouterState. As we
  // walk the tree, we will also spawn a task to produce a prefetch response for
  // each segment. When prefetch inlining is enabled, small segments are bundled
  // into their children's responses based on the hint bits.
  const headBundle: SegmentBundleNode | null = headIsInlined
    ? { rsc: head, varyParams: headVaryParams, next: null }
    : null
  const tree = collectSegmentDataImpl(
    isClientParamParsingEnabled,
    flightRouterState,
    buildId,
    staleTime,
    seedData,
    clientModules,
    ROOT_SEGMENT_REQUEST_KEY,
    segmentTasks,
    prefetchInlining,
    hints,
    null,
    headBundle,
    rootVaryParamsIterable,
    isUpgradeableISRFallback
  )

  // Spawn a task to produce a prefetch response for the "head" segment,
  // unless it was inlined into a page's bundle.
  if (!headIsInlined) {
    segmentTasks.push(
      waitAtLeastOneReactRenderTask().then(() =>
        renderSegmentPrefetch(
          buildId,
          staleTime,
          head,
          HEAD_REQUEST_KEY,
          headVaryParams,
          clientModules,
          null,
          isUpgradeableISRFallback
        )
      )
    )
  }

  // Notify the abort controller that we're done processing the route tree.
  // Anything async that happens after this point must be due to hanging
  // promises in the original stream.
  onCompletedProcessingRouteTree()

  // Render the route tree to a special `/_tree` segment.
  const treePrefetch: RootTreePrefetch = {
    tree,
    staleTime,
  }
  if (buildId) {
    treePrefetch.buildId = buildId
  }
  return treePrefetch
}

function collectSegmentDataImpl(
  isClientParamParsingEnabled: boolean,
  route: FlightRouterState,
  buildId: string | undefined,
  staleTime: number,
  seedData: CacheNodeSeedData | null,
  clientModules: ManifestNode,
  requestKey: SegmentRequestKey,
  segmentTasks: Array<Promise<[string, Buffer]>>,
  prefetchInlining: boolean,
  hintTree: PrefetchHints | null,
  parentBundle: SegmentBundleNode | null,
  headBundle: SegmentBundleNode | null,
  rootVaryParamsIterable: VaryParamsIterable | null,
  isUpgradeableISRFallback: boolean
): TreePrefetch {
  // Union the hints already embedded in the FlightRouterState with the
  // separately-computed build-time hints. During the initial build, the
  // FlightRouterState was produced before collectPrefetchHints ran, so
  // inlining hints (ParentInlinedIntoSelf, InlinedIntoChild) won't be in
  // route[4] yet. On subsequent renders the hints are already in the
  // FlightRouterState, so the union is idempotent.
  //
  // Always strip InliningHintsStale from the result. That bit is only
  // relevant for the initial RSC payload baked into HTML — the /_tree
  // response produced here always has correct hints, so the client should
  // never see InliningHintsStale in a /_tree response.
  const prefetchHints =
    ((route[4] ?? 0) | (hintTree !== null ? hintTree.hints : 0)) &
    ~PrefetchHint.InliningHintsStale

  // Determine which params this segment varies on, unioning in the
  // response-level root params.
  const varyParams = readVaryParams(
    seedData !== null ? seedData[4] : null,
    rootVaryParamsIterable
  )

  // If static prefetching is disabled for this segment (runtime prefetch or
  // instant = false), it still participates in the bundle chain but with
  // null data. The client will skip creating a cache entry for it.
  const staticPrefetchDisabled = (prefetchHints & StaticPrefetchDisabled) !== 0
  const rsc = seedData !== null && !staticPrefetchDisabled ? seedData[0] : null

  // Determine whether this segment's data should be accumulated into a
  // child's response (inlining) or spawned as its own task. When inlining
  // is disabled, the hint bits may still be set (they're computed at build
  // time regardless) but we ignore them — every segment is rendered
  // standalone because the client doesn't know how to parse bundled
  // responses.
  let childBundle: SegmentBundleNode | null = null
  if (prefetchInlining && prefetchHints & PrefetchHint.InlinedIntoChild) {
    // This segment is small enough that its data will be included in one
    // of its children's responses. Don't spawn a separate task — prepend
    // this segment's data onto the linked list so the accepting child can
    // bundle it into its response.
    if (seedData !== null) {
      childBundle = {
        rsc,
        varyParams,
        next: parentBundle,
      }
    }
  } else {
    // This segment is not inlined into a child. Spawn a task to render it.
    // If it has ParentInlinedIntoSelf, the accumulated parents are included
    // in its response. Otherwise parentBundle is null and it renders as a
    // standalone single-segment response.
    //
    // Skip spawning a task if rsc is null (disabled segment) — there's no
    // data to serve and the client won't request it.
    if (seedData !== null && rsc !== null) {
      let bundle =
        prefetchHints & PrefetchHint.ParentInlinedIntoSelf ? parentBundle : null
      // If this page accepts the head, append it at the tail of the chain.
      if (
        headBundle !== null &&
        prefetchHints & PrefetchHint.HeadInlinedIntoSelf
      ) {
        headBundle.next = bundle
        bundle = headBundle
      }
      segmentTasks.push(
        waitAtLeastOneReactRenderTask().then(() =>
          renderSegmentPrefetch(
            buildId,
            staleTime,
            rsc,
            requestKey,
            varyParams,
            clientModules,
            bundle,
            isUpgradeableISRFallback
          )
        )
      )
    }
    // childBundle stays null — reset the accumulator for children.
  }

  // Metadata about the segment. Sent as part of the tree prefetch. Null if
  // there are no children.
  let slotMetadata: { [parallelRouteKey: string]: TreePrefetch } | null = null

  const children = route[1]
  const seedDataChildren = seedData !== null ? seedData[1] : null
  for (const parallelRouteKey in children) {
    const childRoute = children[parallelRouteKey]
    const childSegment = childRoute[0]
    const childSeedData =
      seedDataChildren !== null
        ? (seedDataChildren[parallelRouteKey] ?? null)
        : null

    const childRequestKey = appendSegmentRequestKeyPart(
      requestKey,
      parallelRouteKey,
      createSegmentRequestKeyPart(childSegment)
    )
    const childHintTree =
      hintTree !== null && hintTree.slots !== null
        ? (hintTree.slots[parallelRouteKey] ?? null)
        : null
    const childTree = collectSegmentDataImpl(
      isClientParamParsingEnabled,
      childRoute,
      buildId,
      staleTime,
      childSeedData,
      clientModules,
      childRequestKey,
      segmentTasks,
      prefetchInlining,
      childHintTree,
      childBundle,
      headBundle,
      rootVaryParamsIterable,
      isUpgradeableISRFallback
    )
    if (slotMetadata === null) {
      slotMetadata = {}
    }
    slotMetadata[parallelRouteKey] = childTree
  }

  const segment = route[0]
  let name: string
  let param: TreePrefetchParam | null
  if (typeof segment === 'string') {
    name = segment
    param = null
  } else {
    name = segment[0]
    param = {
      type: segment[2],
      // This value is omitted from the prefetch response when cacheComponents
      // is enabled.
      key: isClientParamParsingEnabled ? null : segment[1],
      siblings: segment[3],
    }
  }

  // Metadata about the segment. Sent to the client as part of the
  // tree prefetch.
  return {
    name,
    param,
    prefetchHints,
    slots: slotMetadata,
  }
}

async function renderSegmentPrefetch(
  buildId: string | undefined,
  staleTime: number,
  rsc: React.ReactNode,
  requestKey: SegmentRequestKey,
  varyParams: Set<string> | null,
  clientModules: ManifestNode,
  bundle: SegmentBundleNode | null,
  isUpgradeableISRFallback: boolean
): Promise<[SegmentRequestKey, Buffer]> {
  // Build the SegmentPrefetch for the terminal (requested) segment.
  // The terminal always has non-null rsc data — disabled segments are
  // skipped by the caller and don't reach this function.
  const selfPrefetch: SegmentPrefetch = {
    rsc,
    isPartial: await isPartialRSCData(rsc, clientModules),
    staleTime,
    varyParams,
  }

  // Build the data array. Always an array, even for a single segment.
  const data: Array<SegmentPrefetch | null> = [selfPrefetch]
  if (bundle !== null) {
    // Walk the bundle linked list and append each entry to the array.
    let node: SegmentBundleNode | null = bundle
    while (node !== null) {
      if (node.rsc !== null) {
        data.push({
          rsc: node.rsc,
          isPartial: await isPartialRSCData(node.rsc, clientModules),
          staleTime,
          varyParams: node.varyParams,
        })
      } else {
        // This segment has static prefetching disabled (runtime prefetch
        // or instant = false). Emit null as a placeholder so the array
        // indices stay aligned with the client's SegmentBundle linked
        // list. The client will skip creating a cache entry for this slot.
        data.push(null)
      }
      node = node.next
    }
  }

  // Wrap in the response envelope with the build ID at the top level.
  // isUpgradeableISRFallback tells the client whether this came from a fallback shell
  // render (so it knows to retry — a more complete version may become
  // available once the server's background regeneration finishes).
  const payload: SegmentPrefetchResponse = {
    buildId: buildId ?? '',
    data,
    isUpgradeableISRFallback,
  }
  // Since all we're doing is decoding and re-encoding a cached prerender, if
  // it takes longer than a microtask, it must because of hanging promises
  // caused by dynamic data. Abort the stream at the end of the current task.
  const abortController = new AbortController()
  waitAtLeastOneReactRenderTask().then(() => abortController.abort())
  const { prelude: segmentStream } = await prerender(payload, clientModules, {
    filterStackFrame,
    signal: abortController.signal,
    onError: onSegmentPrerenderError,
  })
  const segmentBuffer = await streamToBuffer(segmentStream)
  if (requestKey === ROOT_SEGMENT_REQUEST_KEY) {
    return ['/_index' as SegmentRequestKey, segmentBuffer]
  } else {
    return [requestKey, segmentBuffer]
  }
}

async function isPartialRSCData(
  rsc: React.ReactNode,
  clientModules: ManifestNode
): Promise<boolean> {
  // We can determine if a segment contains only partial data if it takes longer
  // than a task to encode, because dynamic data is encoded as an infinite
  // promise. We must do this in a separate Flight prerender from the one that
  // actually generates the prefetch stream because we need to include
  // `isPartial` in the stream itself.
  let isPartial = false
  const abortController = new AbortController()
  waitAtLeastOneReactRenderTask().then(() => {
    // If we haven't yet finished the outer task, then it must be because we
    // accessed dynamic data.
    isPartial = true
    abortController.abort()
  })
  await prerender(rsc, clientModules, {
    filterStackFrame,
    signal: abortController.signal,
    onError() {},
  })
  return isPartial
}

function createUnclosingPrefetchStream(
  originalFlightStream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  // When PPR is enabled, prefetch streams may contain references that never
  // resolve, because that's how we encode dynamic data access. In the decoded
  // object returned by the Flight client, these are reified into hanging
  // promises that suspend during render, which is effectively what we want.
  // The UI resolves when it switches to the dynamic data stream
  // (via useDeferredValue(dynamic, static)).
  //
  // However, the Flight implementation currently errors if the server closes
  // the response before all the references are resolved. As a cheat to work
  // around this, we wrap the original stream in a new stream that never closes,
  // and therefore doesn't error.
  const reader = originalFlightStream.getReader()
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (!done) {
          // Pass to the target stream and keep consuming the Flight response
          // from the server.
          controller.enqueue(value)
          continue
        }
        // The server stream has closed. Exit, but intentionally do not close
        // the target stream.
        return
      }
    },
  })
}
