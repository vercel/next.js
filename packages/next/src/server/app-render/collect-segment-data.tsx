import type {
  CacheNodeSeedData,
  FlightRouterState,
  InitialRSCPayload,
  Segment as FlightRouterStateSegment,
} from './types'
import type { ManifestNode } from '../../build/webpack/plugins/flight-manifest-plugin'

// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge'
// eslint-disable-next-line import/no-extraneous-dependencies
import { unstable_prerender as prerender } from 'react-server-dom-webpack/static.edge'

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
} from './segment-value-encoding'
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
  // Access token. Required to fetch the segment data. In the future this will
  // not be provided during a prefetch if the parent segment did not include it
  // in its prerender; the client will have to perform a dynamic navigation in
  // order to get the access token.
  token: string

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
}

export type SegmentPrefetch = {
  buildId: string
  rsc: React.ReactNode | null
  loading: LoadingModuleData | Promise<LoadingModuleData>
  isPartial: boolean
}

function onSegmentPrerenderError(error: unknown) {
  const digest = getDigestForWellKnownError(error)
  if (digest) {
    return digest
  }
  // We don't need to log the errors because we would have already done that
  // when generating the original Flight stream for the whole page.
}

export async function collectSegmentData(
  shouldAssumePartialData: boolean,
  fullPageDataBuffer: Buffer,
  staleTime: number,
  clientModules: ManifestNode,
  serverConsumerManifest: any
): Promise<Map<string, Buffer>> {
  // Traverse the router tree and generate a prefetch response for each segment.

  // A mutable map to collect the results as we traverse the route tree.
  const resultMap = new Map<string, Buffer>()

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
  // tree, we'll also spawn additional tasks to generate the segment prefetches.
  // The promises for these tasks are pushed to a mutable array that we will
  // await once the route tree is fully rendered.
  const segmentTasks: Array<Promise<[string, Buffer]>> = []
  const { prelude: treeStream } = await prerender(
    // RootTreePrefetch is not a valid return type for a React component, but
    // we need to use a component so that when we decode the original stream
    // inside of it, the side effects are transferred to the new stream.
    // @ts-expect-error
    <PrefetchTreeData
      shouldAssumePartialData={shouldAssumePartialData}
      fullPageDataBuffer={fullPageDataBuffer}
      serverConsumerManifest={serverConsumerManifest}
      clientModules={clientModules}
      staleTime={staleTime}
      segmentTasks={segmentTasks}
      onCompletedProcessingRouteTree={onCompletedProcessingRouteTree}
    />,
    clientModules,
    {
      signal: abortController.signal,
      onError: onSegmentPrerenderError,
    }
  )

  // Write the route tree to a special `/_tree` segment.
  const treeBuffer = await streamToBuffer(treeStream)
  resultMap.set('/_tree', treeBuffer)

  // Now that we've finished rendering the route tree, all the segment tasks
  // should have been spawned. Await them in parallel and write the segment
  // prefetches to the result map.
  for (const [segmentPath, buffer] of await Promise.all(segmentTasks)) {
    resultMap.set(segmentPath, buffer)
  }

  return resultMap
}

async function PrefetchTreeData({
  shouldAssumePartialData,
  fullPageDataBuffer,
  serverConsumerManifest,
  clientModules,
  staleTime,
  segmentTasks,
  onCompletedProcessingRouteTree,
}: {
  shouldAssumePartialData: boolean
  fullPageDataBuffer: Buffer
  serverConsumerManifest: any
  clientModules: ManifestNode
  staleTime: number
  segmentTasks: Array<Promise<[string, Buffer]>>
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
    shouldAssumePartialData,
    flightRouterState,
    buildId,
    seedData,
    fullPageDataBuffer,
    clientModules,
    serverConsumerManifest,
    ROOT_SEGMENT_KEY,
    '',
    segmentTasks
  )

  const isHeadPartial =
    shouldAssumePartialData || (await isPartialRSCData(head, clientModules))

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
  shouldAssumePartialData: boolean,
  route: FlightRouterState,
  buildId: string,
  seedData: CacheNodeSeedData | null,
  fullPageDataBuffer: Buffer,
  clientModules: ManifestNode,
  serverConsumerManifest: any,
  key: string,
  accessToken: string,
  segmentTasks: Array<Promise<[string, Buffer]>>
): Promise<TreePrefetch> {
  // Metadata about the segment. Sent as part of the tree prefetch. Null if
  // there are no children.
  let slotMetadata: { [parallelRouteKey: string]: TreePrefetch } | null = null

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
      encodeSegment(childSegment)
    )
    // Create an access token for each child slot.
    const childAccessToken = await createSegmentAccessToken(
      key,
      parallelRouteKey
    )
    const childTree = await collectSegmentDataImpl(
      shouldAssumePartialData,
      childRoute,
      buildId,
      childSeedData,
      fullPageDataBuffer,
      clientModules,
      serverConsumerManifest,
      childKey,
      childAccessToken,
      segmentTasks
    )
    if (slotMetadata === null) {
      slotMetadata = {}
    }
    slotMetadata[parallelRouteKey] = childTree
  }

  if (seedData !== null) {
    // Spawn a task to write the segment data to a new Flight stream.
    segmentTasks.push(
      // Since we're already in the middle of a render, wait until after the
      // current task to escape the current rendering context.
      waitAtLeastOneReactRenderTask().then(() =>
        renderSegmentPrefetch(
          shouldAssumePartialData,
          buildId,
          seedData,
          key,
          accessToken,
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

  // Metadata about the segment. Sent to the client as part of the
  // tree prefetch.
  return {
    segment: route[0],
    token: accessToken,
    slots: slotMetadata,
    isRootLayout: route[4] === true,
  }
}

async function renderSegmentPrefetch(
  shouldAssumePartialData: boolean,
  buildId: string,
  seedData: CacheNodeSeedData,
  key: string,
  accessToken: string,
  clientModules: ManifestNode
): Promise<[string, Buffer]> {
  // Render the segment data to a stream.
  // In the future, this is where we can include additional metadata, like the
  // stale time and cache tags.
  const rsc = seedData[1]
  const loading = seedData[3]
  const segmentPrefetch: SegmentPrefetch = {
    buildId,
    rsc,
    loading,
    isPartial:
      shouldAssumePartialData || (await isPartialRSCData(rsc, clientModules)),
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
      signal: abortController.signal,
      onError: onSegmentPrerenderError,
    }
  )
  const segmentBuffer = await streamToBuffer(segmentStream)
  // Add the buffer to the result map.
  if (key === ROOT_SEGMENT_KEY) {
    return [ROOT_SEGMENT_KEY, segmentBuffer]
  } else {
    // The access token is appended to the end of the segment name. To request
    // a segment, the client sends a header like:
    //
    //   Next-Router-Segment-Prefetch: /path/to/segment.accesstoken
    //
    // The segment path is provided by the tree prefetch, and the access
    // token is provided in the parent layout's data.
    const fullPath = `${key}.${accessToken}`
    return [fullPath, segmentBuffer]
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
    signal: abortController.signal,
    onError() {},
  })
  return isPartial
}

async function createSegmentAccessToken(
  parentSegmentPathStr: string,
  parallelRouteKey: string
): Promise<string> {
  // Create an access token that the client passes when requesting a segment.
  // The token is sent to the client as part of the parent layout's data.
  //
  // The token is hash of the parent segment path and the parallel route key. A
  // subtle detail here is that it does *not* include the value of the segment
  // itself — the token grants access to the parallel route slot, not the
  // particular segment that is rendered there.
  //
  // TODO: Because this only affects prefetches, this doesn't need to be secure.
  // It's just for obfuscation. But eventually we will use this technique when
  // performing dynamic navigations, to support auth checks in a layout that
  // conditionally renders its slots. At that point we'll need to add a salt.

  // Encode the inputs as Uint8Array
  const encoder = new TextEncoder()
  const data = encoder.encode(parentSegmentPathStr + parallelRouteKey)

  // Use the Web Crypto API to generate a SHA-256 hash.
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  // Convert the ArrayBuffer to a hex string
  const hashArray = new Uint8Array(hashBuffer)
  const hashHex = Array.from(hashArray)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return hashHex
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
