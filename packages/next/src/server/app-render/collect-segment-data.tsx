import type {
  CacheNodeSeedData,
  FlightRouterState,
  InitialRSCPayload,
  Segment,
} from './types'
import type { ManifestNode } from '../../build/webpack/plugins/flight-manifest-plugin'

// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client.edge'
// eslint-disable-next-line import/no-extraneous-dependencies
import { prerender } from 'react-server-dom-webpack/static.edge'

import {
  streamFromBuffer,
  streamToBuffer,
} from '../stream-utils/node-web-streams-helper'
import { UNDERSCORE_NOT_FOUND_ROUTE } from '../../api/constants'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import type { LoadingModuleData } from '../../shared/lib/app-router-context.shared-runtime'

// Contains metadata about the route tree. The client must fetch this before
// it can fetch any actual segment data.
export type RootTreePrefetch = {
  buildId: string
  tree: TreePrefetch
  head: React.ReactNode | null
  isHeadPartial: boolean
  staleTime: number
}

export type TreePrefetch = {
  // Access token. Required to fetch the segment data. In the future this will
  // not be provided during a prefetch if the parent segment did not include it
  // in its prerender; the client will have to perform a dynamic navigation in
  // order to get the access token.
  token: string

  // The path to use when requesting the data for this segment (analogous to a
  // URL). Also used as a cache key, although the server may specify a different
  // cache key when it responds (analagous to a Vary header), like to omit
  // params if they aren't used to compute the response. (This part not
  // yet implemented)
  path: string

  // Child segments.
  slots: null | {
    [parallelRouteKey: string]: TreePrefetch
  }

  // Extra fields that only exist so we can reconstruct a FlightRouterState on
  // the client. We may be able to unify TreePrefetch and FlightRouterState
  // after some refactoring, but in the meantime it would be wasteful to add a
  // bunch of new prefetch-only fields to FlightRouterState. So think of
  // TreePrefetch as a superset of FlightRouterState.
  extra: [segment: Segment, isRootLayout: boolean]
}

export type SegmentPrefetch = {
  buildId: string
  rsc: React.ReactNode | null
  loading: LoadingModuleData | Promise<LoadingModuleData>
  isPartial: boolean
}

export async function collectSegmentData(
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
      onError() {
        // Ignore any errors. These would have already been reported when
        // we created the full page data.
      },
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
  fullPageDataBuffer,
  serverConsumerManifest,
  clientModules,
  staleTime,
  segmentTasks,
  onCompletedProcessingRouteTree,
}: {
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
  const head: React.ReactNode | null = flightDataPaths[0][2]

  // Compute the route metadata tree by traversing the FlightRouterState. As we
  // walk the tree, we will also spawn a task to produce a prefetch response for
  // each segment.
  const tree = await collectSegmentDataImpl(
    flightRouterState,
    buildId,
    seedData,
    fullPageDataBuffer,
    clientModules,
    serverConsumerManifest,
    '',
    '',
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

async function collectSegmentDataImpl(
  route: FlightRouterState,
  buildId: string,
  seedData: CacheNodeSeedData | null,
  fullPageDataBuffer: Buffer,
  clientModules: ManifestNode,
  serverConsumerManifest: any,
  segmentPathStr: string,
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
    const childSegmentPathStr =
      segmentPathStr +
      '/' +
      encodeChildSegmentAsFilesystemSafePathname(parallelRouteKey, childSegment)

    // Create an access token for each child slot.
    const childAccessToken = await createSegmentAccessToken(
      segmentPathStr,
      parallelRouteKey
    )
    const childTree = await collectSegmentDataImpl(
      childRoute,
      buildId,
      childSeedData,
      fullPageDataBuffer,
      clientModules,
      serverConsumerManifest,
      childSegmentPathStr,
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
          buildId,
          seedData,
          segmentPathStr,
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
  const segment = route[0]
  const isRootLayout = route[4]
  return {
    path: segmentPathStr === '' ? '/' : segmentPathStr,
    token: accessToken,
    slots: slotMetadata,
    extra: [segment, isRootLayout === true],
  }
}

async function renderSegmentPrefetch(
  buildId: string,
  seedData: CacheNodeSeedData,
  segmentPathStr: string,
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
      signal: abortController.signal,
      onError() {
        // Ignore any errors. These would have already been reported when
        // we created the full page data.
      },
    }
  )
  const segmentBuffer = await streamToBuffer(segmentStream)
  // Add the buffer to the result map.
  if (segmentPathStr === '') {
    return ['/', segmentBuffer]
  } else {
    // The access token is appended to the end of the segment name. To request
    // a segment, the client sends a header like:
    //
    //   Next-Router-Segment-Prefetch: /path/to/segment.accesstoken
    //
    // The segment path is provided by the tree prefetch, and the access
    // token is provided in the parent layout's data.
    const fullPath = `${segmentPathStr}.${accessToken}`
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

// TODO: Consider updating or unifying this encoding logic for segments with
// createRouterCacheKey on the client, perhaps by including it as part of
// the FlightRouterState. Theoretically the client should never have to do its
// own encoding of segment keys; it can pass back whatever the server gave it.
function encodeChildSegmentAsFilesystemSafePathname(
  parallelRouteKey: string,
  segment: Segment
): string {
  // Encode a child segment and its corresponding parallel route key to a
  // filesystem-safe pathname. The format is internal-only and can be somewhat
  // arbitrary as long as there are no collisions, because these will be used
  // as filenames during build and in the incremental cache. They will also
  // be sent by the client to request the corresponding segment, but they
  // do not need to be decodable. The server will merely look for a matching
  // file in the cache.
  //
  // For ease of debugging, the format looks roughly similar to the App Router
  // convention for defining routes in the source, but again the exact format is
  // not important as long as it's consistent between the client and server and
  // meets the above requirements.
  //
  // TODO: If the segment did not read from params, then we can omit the
  // params from the cache key. Need to track this during the prerender somehow.
  let safeSegmentValue
  if (typeof segment === 'string') {
    safeSegmentValue = encodeParamValue(segment)
  } else {
    // Parameterized segments.
    const [paramName, paramValue, paramType] = segment
    let paramPrefix
    switch (paramType) {
      case 'c':
      case 'ci':
        paramPrefix = `[...${paramName}]`
        break
      case 'oc':
        paramPrefix = `[[...${paramName}]]`
        break
      case 'd':
      case 'di':
        paramPrefix = `[${paramName}]`
        break
      default:
        throw new Error('Unknown dynamic param type')
    }
    safeSegmentValue = `${paramPrefix}-${encodeParamValue(paramValue)}`
  }
  let result
  if (parallelRouteKey === 'children') {
    // Omit the parallel route key for children, since this is the most
    // common case. Saves some bytes.
    result = `${safeSegmentValue}`
  } else {
    result = `@${parallelRouteKey}/${safeSegmentValue}`
  }
  return result
}

// Define a regex pattern to match the most common characters found in a route
// param. It excludes anything that might not be cross-platform filesystem
// compatible, like |. It does not need to be precise because the fallback is to
// just base64url-encode the whole parameter, which is fine; we just don't do it
// by default for compactness, and for easier debugging.
const simpleParamValueRegex = /^[a-zA-Z0-9\-_@]+$/

function encodeParamValue(segment: string): string {
  if (segment === UNDERSCORE_NOT_FOUND_ROUTE) {
    // TODO: FlightRouterState encodes Not Found routes as "/_not-found". But
    // params typically don't include the leading slash. We should use a
    // different encoding to avoid this special case.
    return '_not-found'
  }
  if (simpleParamValueRegex.test(segment)) {
    return segment
  }
  // If there are any unsafe characters, base64url-encode the entire segment.
  // We also add a $ prefix so it doesn't collide with the simple case.
  return '$' + Buffer.from(segment, 'utf-8').toString('base64url')
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
