/* eslint-disable @next/internal/no-ambiguous-jsx -- Bundled in entry-base so it gets the right JSX runtime. */
import type {
  CacheNodeSeedData,
  FlightRouterState,
  InitialRSCPayload,
  DynamicParamTypesShort,
  HeadData,
  PrefetchHints,
} from '../../shared/lib/app-router-types'
import { PrefetchHint } from '../../shared/lib/app-router-types'
import { readVaryParams } from '../../shared/lib/segment-cache/vary-params-decoding'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import type { ManifestNode } from '../../build/webpack/plugins/flight-manifest-plugin'

// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'
// eslint-disable-next-line import/no-extraneous-dependencies
import { prerender } from 'react-server-dom-webpack/static'

import {
  streamFromBuffer,
  streamToBuffer,
} from '../stream-utils/node-web-streams-helper'
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
 */
export type SegmentPrefetchResponse = {
  buildId: string
  data: Array<SegmentPrefetch | null>
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
 * A node in the inlined prefetch tree. Wraps a SegmentPrefetch with child
 * slots so all segments for a route can be bundled into a single response.
 *
 * This is a separate type from SegmentPrefetch because the inlined flow is
 * still gated behind a feature flag. Eventually inlining will always be
 * enabled, and the per-segment and inlined paths will merge.
 */
export type InlinedSegmentPrefetch = {
  segment: SegmentPrefetch
  slots: null | {
    [parallelRouteKey: string]: InlinedSegmentPrefetch
  }
}

/**
 * The response shape for the /_inlined prefetch endpoint. Contains all segment
 * data for a route bundled into a single tree structure, plus the head segment.
 */
export type InlinedPrefetchResponse = {
  buildId: string
  tree: InlinedSegmentPrefetch
  head: SegmentPrefetch
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
  hints: PrefetchHints | null
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
  for (const [segmentPath, buffer] of await Promise.all(segmentTasks)) {
    resultMap.set(segmentPath, buffer)
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

  // Measure the head (metadata/viewport) gzip size so the main traversal
  // can decide whether to inline it into a page's bundle.
  const headVaryParamsThenable = initialRSCPayload.h
  const headVaryParams =
    headVaryParamsThenable !== null
      ? readVaryParams(headVaryParamsThenable)
      : null

  const [, headBuffer] = await renderSegmentPrefetch(
    buildId,
    staleTime,
    head,
    HEAD_REQUEST_KEY,
    headVaryParams,
    clientModules
  )
  const headGzipSize = await getGzipSize(headBuffer)

  // Mutable accumulator: the first page leaf that can fit the head sets
  // this to true. Once set, subsequent leaves skip the check.
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
    headInlineState
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
  headInlineState: { inlined: boolean }
): Promise<{
  node: PrefetchHints
  // Total inlined bytes accumulated along the deepest accepting path in this
  // subtree. Used by ancestors for budget checks.
  inlinedBytes: number
}> {
  // Render current segment and measure its gzip size.
  let currentGzipSize: number | null = null
  if (seedData !== null) {
    const varyParamsThenable = seedData[4]
    const varyParams =
      varyParamsThenable !== null ? readVaryParams(varyParamsThenable) : null

    const [, buffer] = await renderSegmentPrefetch(
      buildId,
      staleTime,
      seedData[0],
      requestKey,
      varyParams,
      clientModules
    )
    currentGzipSize = await getGzipSize(buffer)
  }

  // Only offer this segment to its children for inlining if its gzip size
  // is below maxSize. Segments above this get their own response.
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
      seedDataChildren !== null ? seedDataChildren[parallelRouteKey] : null

    const childRequestKey = appendSegmentRequestKeyPart(
      requestKey,
      parallelRouteKey,
      createSegmentRequestKeyPart(childSegment)
    )

    const childResult = await collectPrefetchHintsImpl(
      childRoute,
      buildId,
      staleTime,
      childSeedData,
      clientModules,
      childRequestKey,
      // Once a child has accepted us, stop offering to remaining siblings.
      didInlineIntoChild ? null : sizeToInline,
      maxSize,
      maxBundleSize,
      headGzipSize,
      headInlineState
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

  // Try to inline the head (metadata/viewport) into this segment's
  // response. The head can only be inlined into a page, not a layout,
  // because pages may access additional params (e.g. searchParams) that
  // layouts cannot. The head is treated like an additional inlined
  // entry — it counts against the same total budget. Only the first page
  // that has room gets the head; subsequent pages skip via the shared
  // headInlineState accumulator.
  const segment = route[0]
  const isPageSegment =
    typeof segment === 'string'
      ? segment === PAGE_SEGMENT_KEY
      : segment[0] === PAGE_SEGMENT_KEY
  if (isPageSegment && !headInlineState.inlined) {
    if (inlinedBytes + headGzipSize < maxBundleSize) {
      hints |= PrefetchHint.HeadInlinedIntoSelf
      inlinedBytes += headGzipSize
      headInlineState.inlined = true
    }
  }

  // Decide whether to accept our own parent's data. Two conditions:
  //
  // 1. The parent offered us a size (parentGzipSize is not null). It's null
  //    when the parent is too large to inline or when this is the root.
  //
  // 2. The total inlined bytes along this branch wouldn't exceed the budget.
  //    Even if each segment is individually small, at some point it no
  //    longer makes sense to keep adding bytes because the combined response
  //    is unique per URL and can't be deduped.
  //
  // A node can be both InlinedIntoChild and ParentInlinedIntoSelf. This
  // happens in multi-level chains: GP → P → C where all are small. C
  // accepts P (P is InlinedIntoChild), then P also accepts GP (P is
  // ParentInlinedIntoSelf). The result: C's response includes both P's
  // and GP's data. The parent's data flows through to the deepest
  // accepting descendant.
  if (parentGzipSize !== null) {
    if (inlinedBytes + parentGzipSize < maxBundleSize) {
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

  // Extract the head vary params from the decoded response.
  // The head vary params thenable should be fulfilled by now; if not, treat
  // as unknown (null).
  const headVaryParamsThenable = initialRSCPayload.h
  const headVaryParams =
    headVaryParamsThenable !== null
      ? readVaryParams(headVaryParamsThenable)
      : null

  // Compute the route metadata tree by traversing the FlightRouterState. As we
  // walk the tree, we will also spawn a task to produce a prefetch response for
  // each segment (unless prefetch inlining is enabled, in which case all
  // segments are bundled into a single /_inlined response).
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
    hints
  )

  if (prefetchInlining) {
    // When prefetch inlining is enabled, bundle all segment data into a single
    // /_inlined response instead of individual per-segment responses. The head
    // is also included in the inlined response.
    segmentTasks.push(
      waitAtLeastOneReactRenderTask().then(() =>
        renderInlinedPrefetchResponse(
          flightRouterState,
          buildId,
          staleTime,
          seedData,
          head,
          headVaryParams,
          clientModules
        )
      )
    )
  } else {
    // Also spawn a task to produce a prefetch response for the "head" segment.
    // The head contains metadata, like the title; it's not really a route
    // segment, but it contains RSC data, so it's treated like a segment by
    // the client cache.
    segmentTasks.push(
      waitAtLeastOneReactRenderTask().then(() =>
        renderSegmentPrefetch(
          buildId,
          staleTime,
          head,
          HEAD_REQUEST_KEY,
          headVaryParams,
          clientModules
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
  hintTree: PrefetchHints | null
): TreePrefetch {
  // Metadata about the segment. Sent as part of the tree prefetch. Null if
  // there are no children.
  let slotMetadata: { [parallelRouteKey: string]: TreePrefetch } | null = null

  const children = route[1]
  const seedDataChildren = seedData !== null ? seedData[1] : null
  for (const parallelRouteKey in children) {
    const childRoute = children[parallelRouteKey]
    const childSegment = childRoute[0]
    const childSeedData =
      seedDataChildren !== null ? seedDataChildren[parallelRouteKey] : null

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
      childHintTree
    )
    if (slotMetadata === null) {
      slotMetadata = {}
    }
    slotMetadata[parallelRouteKey] = childTree
  }

  // Union the hints already embedded in the FlightRouterState with the
  // separately-computed build-time hints. During the initial build, the
  // FlightRouterState was produced before collectPrefetchHints ran, so
  // inlining hints (ParentInlinedIntoSelf, InlinedIntoChild) won't be in
  // route[4] yet. On subsequent renders the hints are already in the
  // FlightRouterState, so the union is idempotent.
  //
  // Strip InliningHintsStale — it's a transient flag set on the initial
  // build-time FlightRouterState and must never appear in /_tree responses.
  // If it leaked through, the client would re-fetch the tree in an infinite
  // loop.
  const prefetchHints =
    ((route[4] ?? 0) & ~PrefetchHint.InliningHintsStale) |
    (hintTree !== null ? hintTree.hints : 0)

  // Determine which params this segment varies on.
  // Read the vary params thenable directly from the seed data. By the time
  // collectSegmentData runs, the thenable should be fulfilled. If it's not
  // fulfilled or null, treat as unknown (null means we can't share cache
  // entries across param values).
  const varyParamsThenable = seedData !== null ? seedData[4] : null
  const varyParams =
    varyParamsThenable !== null ? readVaryParams(varyParamsThenable) : null

  if (!prefetchInlining) {
    // When prefetch inlining is disabled, spawn individual segment tasks.
    // When enabled, segment data is bundled into the /_inlined response
    // instead, so we skip per-segment tasks here.
    if (seedData !== null) {
      // Spawn a task to write the segment data to a new Flight stream.
      segmentTasks.push(
        // Since we're already in the middle of a render, wait until after the
        // current task to escape the current rendering context.
        waitAtLeastOneReactRenderTask().then(() =>
          renderSegmentPrefetch(
            buildId,
            staleTime,
            seedData[0],
            requestKey,
            varyParams,
            clientModules
          )
        )
      )
    } else {
      // This segment does not have any seed data. Skip generating a prefetch
      // response for it. We'll still include it in the route tree, though.
      // TODO: We should encode in the route tree whether a segment is missing
      // so we don't attempt to fetch it for no reason. As of now this shouldn't
      // ever happen in practice, though.
    }
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
  clientModules: ManifestNode
): Promise<[SegmentRequestKey, Buffer]> {
  // Render the segment data to a stream.
  const segmentPrefetch: SegmentPrefetch = {
    rsc,
    isPartial: await isPartialRSCData(rsc, clientModules),
    staleTime,
    varyParams,
  }
  // Wrap in a SegmentPrefetchResponse with a top-level buildId.
  // For non-bundled responses, the data array has a single element.
  const response: SegmentPrefetchResponse = {
    buildId: buildId ?? '',
    data: [segmentPrefetch],
  }
  // Since all we're doing is decoding and re-encoding a cached prerender, if
  // it takes longer than a microtask, it must because of hanging promises
  // caused by dynamic data. Abort the stream at the end of the current task.
  const abortController = new AbortController()
  waitAtLeastOneReactRenderTask().then(() => abortController.abort())
  const { prelude: segmentStream } = await prerender(response, clientModules, {
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

async function renderInlinedPrefetchResponse(
  route: FlightRouterState,
  buildId: string | undefined,
  staleTime: number,
  seedData: CacheNodeSeedData | null,
  head: HeadData,
  headVaryParams: Set<string> | null,
  clientModules: ManifestNode
): Promise<[SegmentRequestKey, Buffer]> {
  // Build the inlined tree by walking the route and collecting all segments.
  const inlinedTree = await buildInlinedSegmentPrefetch(
    route,
    buildId,
    staleTime,
    seedData,
    clientModules
  )

  // Build the head segment.
  const headPrefetch: SegmentPrefetch = {
    rsc: head,
    isPartial: await isPartialRSCData(head, clientModules),
    staleTime,
    varyParams: headVaryParams,
  }

  const response: InlinedPrefetchResponse = {
    buildId: buildId ?? '',
    tree: inlinedTree,
    head: headPrefetch,
  }

  // Render as a single Flight response.
  const abortController = new AbortController()
  waitAtLeastOneReactRenderTask().then(() => abortController.abort())
  const { prelude } = await prerender(response, clientModules, {
    filterStackFrame,
    signal: abortController.signal,
    onError: onSegmentPrerenderError,
  })
  const buffer = await streamToBuffer(prelude)
  return [('/' + PAGE_SEGMENT_KEY) as SegmentRequestKey, buffer]
}

async function buildInlinedSegmentPrefetch(
  route: FlightRouterState,
  buildId: string | undefined,
  staleTime: number,
  seedData: CacheNodeSeedData | null,
  clientModules: ManifestNode
): Promise<InlinedSegmentPrefetch> {
  let slots: {
    [parallelRouteKey: string]: InlinedSegmentPrefetch
  } | null = null

  const children = route[1]
  const seedDataChildren = seedData !== null ? seedData[1] : null
  for (const parallelRouteKey in children) {
    const childRoute = children[parallelRouteKey]
    const childSeedData =
      seedDataChildren !== null ? seedDataChildren[parallelRouteKey] : null
    const childPrefetch = await buildInlinedSegmentPrefetch(
      childRoute,
      buildId,
      staleTime,
      childSeedData,
      clientModules
    )
    if (slots === null) {
      slots = {}
    }
    slots[parallelRouteKey] = childPrefetch
  }

  const rsc = seedData !== null ? seedData[0] : null
  const varyParamsThenable = seedData !== null ? seedData[4] : null
  const varyParams =
    varyParamsThenable !== null ? readVaryParams(varyParamsThenable) : null

  const segment: SegmentPrefetch = {
    rsc,
    isPartial: rsc !== null ? await isPartialRSCData(rsc, clientModules) : true,
    staleTime,
    varyParams,
  }
  return { segment, slots }
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
