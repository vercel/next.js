import type {
  CacheNodeSeedData,
  FlightRouterState,
  InitialRSCPayload,
  Segment as FlightRouterStateSegment,
  DynamicParamTypesShort,
} from './types'
import type { ManifestNode } from '../../build/webpack/plugins/flight-manifest-plugin'

// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'
// eslint-disable-next-line import/no-extraneous-dependencies
import { unstable_prerender as prerender } from 'react-server-dom-webpack/static'

import {
  streamFromBuffer,
  streamToBuffer,
} from '../stream-utils/node-web-streams-helper'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import type {
  HeadData,
  LoadingModuleData,
} from '../../shared/lib/app-router-context.shared-runtime'
import {
  encodeChildSegmentKey,
  encodeSegment,
  ROOT_SEGMENT_KEY,
  type EncodedSegment,
} from '../../shared/lib/segment-cache/segment-value-encoding'
import { getDigestForWellKnownError } from './create-error-handler'
import type { FallbackRouteParams } from '../request/fallback-params'

// Contains metadata about the route tree. The client must fetch this before
// it can fetch any actual segment data.
export type RootTreePrefetch = {
  buildId: string
  tree: TreePrefetch
  head: HeadData
  isHeadPartial: boolean
  staleTime: number
}

export type TreePrefetch = {
  // The segment, in the format expected by a FlightRouterState.
  segment: FlightRouterStateSegment

  // Child segments.
  slots: null | {
    [parallelRouteKey: string]: TreePrefetch
  }

  // Extra fields that only exist so we can reconstruct a FlightRouterState on
  // the client. We may be able to unify TreePrefetch and FlightRouterState
  // after some refactoring, but in the meantime it would be wasteful to add a
  // bunch of new prefetch-only fields to FlightRouterState. So think of
  // TreePrefetch as a superset of FlightRouterState.
  isRootLayout: boolean

  // The segment data, if it's small enough to be inlined into the initial
  // prefetch. If empty, it's because we've decided to outline it. The client
  // will issue a separate request
  data: SegmentPrefetch | null
}

export type SegmentPrefetch = {
  buildId: string
  rsc: React.ReactNode | null
  loading: LoadingModuleData | Promise<LoadingModuleData>
  isPartial: boolean
}

const filterStackFrame =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .filterStackFrameDEV
    : undefined

function onSegmentPrerenderError(error: unknown) {
  const digest = getDigestForWellKnownError(error)
  if (digest) {
    return digest
  }
  // We don't need to log the errors because we would have already done that
  // when generating the original Flight stream for the whole page.
}

type AccumulatedSegmentData = {
  segmentData: Map<string, Buffer>
  inlinedGzipBytes: number
}

export async function collectSegmentData(
  fullPageDataBuffer: Buffer,
  staleTime: number,
  clientModules: ManifestNode,
  serverConsumerManifest: any,
  fallbackRouteParams: FallbackRouteParams | null
): Promise<Map<string, Buffer>> {
  // Traverse the router tree and generate a prefetch response for each segment.

  // A mutable object to collect the results as we traverse the route tree.
  const accumulation: AccumulatedSegmentData = {
    segmentData: new Map<string, Buffer>(),
    inlinedGzipBytes: 0,
  }

  // Before we start, warm up the module cache by decoding the page data once.
  // Then we can assume that any remaining async tasks that occur the next time
  // are due to hanging promises caused by dynamic data access. Note we only
  // have to do this once per page, not per individual segment.
  //
  try {
    await createFromReadableStream(streamFromBuffer(fullPageDataBuffer), {
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
  // tree, we'll also generate the segment prefetches and write the output
  // to resultMap.
  const { prelude: treeStream } = await prerender(
    // RootTreePrefetch is not a valid return type for a React component, but
    // we need to use a component so that when we decode the original stream
    // inside of it, the side effects are transferred to the new stream.
    // @ts-expect-error
    <PrefetchTreeData
      fullPageDataBuffer={fullPageDataBuffer}
      fallbackRouteParams={fallbackRouteParams}
      serverConsumerManifest={serverConsumerManifest}
      clientModules={clientModules}
      staleTime={staleTime}
      accumulation={accumulation}
      onCompletedProcessingRouteTree={onCompletedProcessingRouteTree}
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
  const segmentData = accumulation.segmentData
  segmentData.set('/_tree', treeBuffer)

  return segmentData
}

async function PrefetchTreeData({
  fullPageDataBuffer,
  fallbackRouteParams,
  serverConsumerManifest,
  clientModules,
  staleTime,
  accumulation,
  onCompletedProcessingRouteTree,
}: {
  fullPageDataBuffer: Buffer
  serverConsumerManifest: any
  fallbackRouteParams: FallbackRouteParams | null
  clientModules: ManifestNode
  staleTime: number
  accumulation: AccumulatedSegmentData
  onCompletedProcessingRouteTree: () => void
}): Promise<RootTreePrefetch | null> {
  // We're currently rendering a Flight response for the route tree prefetch.
  // Inside this component, decode the Flight stream for the whole page. This is
  // a hack to transfer the side effects from the original Flight stream (e.g.
  // Float preloads) onto the Flight stream for the tree prefetch.
  // TODO: React needs a better way to do this. Needed for Server Actions, too.
  const initialRSCPayload: InitialRSCPayload = await createFromReadableStream(
    createUnclosingPrefetchStream(streamFromBuffer(fullPageDataBuffer)),
    {
      serverConsumerManifest,
    }
  )

  const buildId = initialRSCPayload.b

  // FlightDataPath is an unsound type, hence the additional checks.
  const flightDataPaths = initialRSCPayload.f
  if (flightDataPaths.length !== 1 && flightDataPaths[0].length !== 3) {
    console.error(
      'Internal Next.js error: InitialRSCPayload does not match the expected ' +
        'shape for a prerendered page during segment prefetch generation.'
    )
    return null
  }
  const flightRouterState: FlightRouterState = flightDataPaths[0][0]
  const seedData: CacheNodeSeedData = flightDataPaths[0][1]
  const head: HeadData = flightDataPaths[0][2]

  // Compute the route metadata tree by traversing the FlightRouterState. As we
  // walk the tree, we will also spawn a task to produce a prefetch response for
  // each segment.
  const tree = await collectSegmentDataImpl(
    flightRouterState,
    buildId,
    seedData,
    fallbackRouteParams,
    clientModules,
    ROOT_SEGMENT_KEY,
    accumulation
  )

  const isHeadPartial = await isPartialRSCData(head, clientModules)

  // Notify the abort controller that we're done processing the route tree.
  // Anything async that happens after this point must be due to hanging
  // promises in the original stream.
  onCompletedProcessingRouteTree()

  // Render the route tree to a special `/_tree` segment.
  const treePrefetch: RootTreePrefetch = {
    buildId,
    tree,
    head,
    isHeadPartial,
    staleTime,
  }
  return treePrefetch
}

async function collectSegmentDataImpl(
  route: FlightRouterState,
  buildId: string,
  seedData: CacheNodeSeedData | null,
  fallbackRouteParams: FallbackRouteParams | null,
  clientModules: ManifestNode,
  key: string,
  accumulation: AccumulatedSegmentData
): Promise<TreePrefetch> {
  // Metadata about the segment. Sent as part of the tree prefetch. Null if
  // there are no children.
  const slotMetadata: { [parallelRouteKey: string]: TreePrefetch } | null = {}

  const children = route[1]
  const seedDataChildren = seedData !== null ? seedData[2] : null
  for (const parallelRouteKey in children) {
    const childRoute = children[parallelRouteKey]
    const childSegment = childRoute[0]
    const childSeedData =
      seedDataChildren !== null ? seedDataChildren[parallelRouteKey] : null

    const childKey = encodeChildSegmentKey(
      key,
      parallelRouteKey,
      Array.isArray(childSegment) && fallbackRouteParams !== null
        ? encodeSegmentWithPossibleFallbackParam(
            childSegment,
            fallbackRouteParams
          )
        : encodeSegment(childSegment)
    )

    // Intentionally rendering each child in serial. This is because we track the
    // total number of inlined bytes as we go, to decide whether to inline the
    // next segment. If we rendered them in parallel, the result would be
    // non-deterministic. Since this function is not bound by unresolved data,
    // this is unlikely to impact build times.
    const childTree = await collectSegmentDataImpl(
      childRoute,
      buildId,
      childSeedData,
      fallbackRouteParams,
      clientModules,
      childKey,
      accumulation
    )
    slotMetadata[parallelRouteKey] = childTree
  }

  let possiblyInlinedSegmentData: SegmentPrefetch | null = null

  if (seedData !== null) {
    const [segmentPath, buffer, segmentPrefetch] = await renderSegmentPrefetch(
      buildId,
      seedData,
      key,
      clientModules
    )
    accumulation.segmentData.set(segmentPath, buffer)

    // Measure the gzipped size of the segment response. If it's below the given
    // threshold, inline it into the route tree prefetch. This prevents the
    // client from having to prefetch it separately, at the cost of potentially
    // greater transfer size when prefetching multiple pages with shared
    // layouts. If it's above the threshold, omit it from the route tree
    // prefetch response, i.e. "outline" it to a separate response.
    //
    // The benefit of outlining is that the same segment response can be reused
    // across multiple pages. This is often worth the additional prefetch
    // request, since each response can be cached independently. It's similar
    // to how JS bundlers decide whether to inline a module chunk.
    //
    // The inlining threshold is only a heuristic. The idea is that below some
    // size, the potential deduping benefits are not worth the cost of the
    // additional request.
    //
    // TODO: The ideal theoretical thresholds depends on the network conditions.
    // Consider generating multiple tree prefetches with different thresholds.
    // The client would then request the appropriate one based on its
    // connection type.
    // TODO: We may make these configurable, but ideally the defaults are good
    // enough that it isn't necessary.
    const segmentGzipBytes = await getGzipSize(buffer)
    if (segmentGzipBytes < 2_048) {
      // In addition to using the size of the segment prefetch, we also take
      // into consideration the total inlined size of the tree prefetch. The
      // idea is that even if each individual segment is below the inlining
      // threshold, at some point it no longer makes sense to add more bytes to
      // the tree prefetch, because the tree prefetch requests are unique per
      // URL and cannot be deduped the way segments can.
      //
      // Deeper segments are more likely to be unique to a page, so they are
      // more likely to benefit from inlining. Since we're inside a depth-first
      // traversal, we're prioritizing inlining the deepest segments first.
      //
      // Note that this is only an estimate of the number of bytes added to the
      // tree prefetch. The actual number is likely smaller, because of object
      // deduplication by Flight and (similarly) additional gzip chunk
      // deduplication in the combined result.
      //
      // TODO: If we wanted a more accurate value, we could measure the size of
      // the actual output stream as we process the tree. Since the inlining
      // thresholds are just a heuristic, leaving this as a future improvement
      // for now.
      const totalInlinedGzipBytes =
        accumulation.inlinedGzipBytes + segmentGzipBytes
      if (totalInlinedGzipBytes < 10_240) {
        possiblyInlinedSegmentData = segmentPrefetch
        accumulation.inlinedGzipBytes = totalInlinedGzipBytes
      }
    }
  } else {
    // This segment does not have any seed data. Skip generating a prefetch
    // response for it. We'll still include it in the route tree, though.
    // TODO: We should encode in the route tree whether a segment is missing
    // so we don't attempt to fetch it for no reason. As of now this shouldn't
    // ever happen in practice, though.
  }

  // Metadata about the segment. Sent to the client as part of the
  // tree prefetch.
  return {
    segment: route[0],
    slots: slotMetadata,
    isRootLayout: route[4] === true,
    data: possiblyInlinedSegmentData,
  }
}

async function getGzipSize(buffer: Buffer): Promise<number> {
  const encoder = new TextEncoder()
  const encoded = encoder.encode(buffer.toString())
  const stream = new Blob([encoded])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  const compressedBlob = await new Response(stream).blob()
  return compressedBlob.size
}

function encodeSegmentWithPossibleFallbackParam(
  segment: [string, string, DynamicParamTypesShort],
  fallbackRouteParams: FallbackRouteParams
): EncodedSegment {
  const name = segment[0]
  if (!fallbackRouteParams.has(name)) {
    // Normal case. No matching fallback parameter.
    return encodeSegment(segment)
  }
  // This segment includes a fallback parameter. During prerendering, a random
  // placeholder value was used; however, for segment prefetches, we need the
  // segment path to be predictable so the server can create a rewrite for it.
  // So, replace the placeholder segment value with a "template" string,
  // e.g. `[name]`.
  // TODO: This will become a bit cleaner once remove route parameters from the
  // server response, and instead add them to the segment keys on the client.
  // Instead of a string replacement, like we do here, route params will always
  // be encoded in separate step from the rest of the segment, not just in the
  // case of fallback params.
  const encodedSegment = encodeSegment(segment)
  const lastIndex = encodedSegment.lastIndexOf('$')
  const encodedFallbackSegment =
    // NOTE: This is guaranteed not to clash with the rest of the segment
    // because non-simple characters (including [ and ]) trigger a base
    // 64 encoding.
    encodedSegment.substring(0, lastIndex + 1) + `[${name}]`
  return encodedFallbackSegment as EncodedSegment
}

async function renderSegmentPrefetch(
  buildId: string,
  seedData: CacheNodeSeedData,
  key: string,
  clientModules: ManifestNode
): Promise<[string, Buffer, SegmentPrefetch]> {
  // Render the segment data to a stream.
  // In the future, this is where we can include additional metadata, like the
  // stale time and cache tags.
  const rsc = seedData[1]
  const loading = seedData[3]
  const segmentPrefetch: SegmentPrefetch = {
    buildId,
    rsc,
    loading,
    isPartial: await isPartialRSCData(rsc, clientModules),
  }
  // Since all we're doing is decoding and re-encoding a cached prerender, if
  // it takes longer than a microtask, it must because of hanging promises
  // caused by dynamic data. Abort the stream at the end of the current task.
  const abortController = new AbortController()
  waitAtLeastOneReactRenderTask().then(() => abortController.abort())
  const { prelude: segmentStream } = await prerender(
    segmentPrefetch,
    clientModules,
    {
      filterStackFrame,
      signal: abortController.signal,
      onError: onSegmentPrerenderError,
    }
  )
  const segmentBuffer = await streamToBuffer(segmentStream)
  if (key === ROOT_SEGMENT_KEY) {
    return ['/_index', segmentBuffer, segmentPrefetch]
  } else {
    return [key, segmentBuffer, segmentPrefetch]
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
    onPostpone() {
      // If something postponed, i.e. when Cache Components is not enabled, we can
      // infer that the RSC data is partial.
      isPartial = true
    },
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
