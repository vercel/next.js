/* eslint-disable @next/internal/no-ambiguous-jsx -- Bundled in entry-base so it gets the right JSX runtime. */
import type {
  CacheNodeSeedData,
  FlightRouterState,
  InitialRSCPayload,
  DynamicParamTypesShort,
  HeadData,
  LoadingModuleData,
} from '../../shared/lib/app-router-types'
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
} from '../../shared/lib/segment-cache/segment-value-encoding'
import { getDigestForWellKnownError } from './create-error-handler'

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
  name: string
  paramType: DynamicParamTypesShort | null
  // When cacheComponents is enabled, this field is always null.
  // Instead we parse the param on the client, allowing us to omit it from
  // the prefetch response and increase its cacheability.
  paramKey: string | null

  // Child segments.
  slots: null | {
    [parallelRouteKey: string]: TreePrefetch
  }

  /** Whether this segment should be fetched using a runtime prefetch */
  hasRuntimePrefetch: boolean

  // Extra fields that only exist so we can reconstruct a FlightRouterState on
  // the client. We may be able to unify TreePrefetch and FlightRouterState
  // after some refactoring, but in the meantime it would be wasteful to add a
  // bunch of new prefetch-only fields to FlightRouterState. So think of
  // TreePrefetch as a superset of FlightRouterState.
  isRootLayout: boolean
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
}

export async function collectSegmentData(
  isCacheComponentsEnabled: boolean,
  fullPageDataBuffer: Buffer,
  staleTime: number,
  clientModules: ManifestNode,
  serverConsumerManifest: any
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

async function PrefetchTreeData({
  isClientParamParsingEnabled,
  fullPageDataBuffer,
  serverConsumerManifest,
  clientModules,
  staleTime,
  segmentTasks,
  onCompletedProcessingRouteTree,
}: {
  isClientParamParsingEnabled: boolean
  fullPageDataBuffer: Buffer
  serverConsumerManifest: any
  clientModules: ManifestNode
  staleTime: number
  segmentTasks: Array<Promise<[SegmentRequestKey, Buffer]>>
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
      findSourceMapURL,
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
  const tree = collectSegmentDataImpl(
    isClientParamParsingEnabled,
    flightRouterState,
    buildId,
    seedData,
    clientModules,
    ROOT_SEGMENT_REQUEST_KEY,
    segmentTasks
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

function collectSegmentDataImpl(
  isClientParamParsingEnabled: boolean,
  route: FlightRouterState,
  buildId: string,
  seedData: CacheNodeSeedData | null,
  clientModules: ManifestNode,
  requestKey: SegmentRequestKey,
  segmentTasks: Array<Promise<[string, Buffer]>>
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
    const childTree = collectSegmentDataImpl(
      isClientParamParsingEnabled,
      childRoute,
      buildId,
      childSeedData,
      clientModules,
      childRequestKey,
      segmentTasks
    )
    if (slotMetadata === null) {
      slotMetadata = {}
    }
    slotMetadata[parallelRouteKey] = childTree
  }

  const hasRuntimePrefetch = seedData !== null ? seedData[4] : false

  if (seedData !== null) {
    // Spawn a task to write the segment data to a new Flight stream.
    segmentTasks.push(
      // Since we're already in the middle of a render, wait until after the
      // current task to escape the current rendering context.
      waitAtLeastOneReactRenderTask().then(() =>
        renderSegmentPrefetch(buildId, seedData, requestKey, clientModules)
      )
    )
  } else {
    // This segment does not have any seed data. Skip generating a prefetch
    // response for it. We'll still include it in the route tree, though.
    // TODO: We should encode in the route tree whether a segment is missing
    // so we don't attempt to fetch it for no reason. As of now this shouldn't
    // ever happen in practice, though.
  }

  const segment = route[0]
  let name
  let paramType: DynamicParamTypesShort | null = null
  let paramKey: string | null = null
  if (typeof segment === 'string') {
    name = segment
    paramKey = segment
    paramType = null
  } else {
    name = segment[0]
    paramKey = segment[1]
    paramType = segment[2] as DynamicParamTypesShort
  }

  // Metadata about the segment. Sent to the client as part of the
  // tree prefetch.
  return {
    name,
    paramType,
    // This value is ommitted from the prefetch response when cacheComponents
    // is enabled.
    paramKey: isClientParamParsingEnabled ? null : paramKey,
    hasRuntimePrefetch,
    slots: slotMetadata,
    isRootLayout: route[4] === true,
  }
}

async function renderSegmentPrefetch(
  buildId: string,
  seedData: CacheNodeSeedData,
  requestKey: SegmentRequestKey,
  clientModules: ManifestNode
): Promise<[SegmentRequestKey, Buffer]> {
  // Render the segment data to a stream.
  // In the future, this is where we can include additional metadata, like the
  // stale time and cache tags.
  const rsc = seedData[0]
  const loading = seedData[2]
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
