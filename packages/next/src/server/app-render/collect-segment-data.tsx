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
import { renderToReadableStream } from 'react-server-dom-webpack/server.edge'

import {
  streamFromBuffer,
  streamToBuffer,
} from '../stream-utils/node-web-streams-helper'
import { UNDERSCORE_NOT_FOUND_ROUTE } from '../../api/constants'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import type { LoadingModuleData } from '../../shared/lib/app-router-context.shared-runtime'

// Contains metadata about the route tree. The client must fetch this before
// it can fetch any actual segment data.
type RootTreePrefetch = {
  tree: TreePrefetch
  staleTime: number
}

type TreePrefetch = {
  // The key to use when requesting the data for this segment (analogous to a
  // URL). Also used as a cache key, although the server may specify a different
  // cache key when it responds (analagous to a Vary header), like to omit
  // params if they aren't used to compute the response. (This part not
  // yet implemented)
  key: string

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

type SegmentPrefetch = {
  rsc: React.ReactNode | null
  loading: LoadingModuleData

  // Access tokens for the child segments.
  slots: null | {
    [parallelRouteKey: string]: string
  }
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

  // Generate a stream for the route tree prefetch. While we're walking the
  // tree, we'll also spawn additional tasks to generate the segment prefetches.
  // The promises for these tasks are pushed to a mutable array that we will
  // await once the route tree is fully rendered.
  const segmentTasks: Array<Promise<[string, Buffer]>> = []
  const treeStream = await renderToReadableStream(
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
    />,
    clientModules,
    {
      // Unlike when rendering the segment streams, we do not pass an abort
      // controller here. There's nothing dynamic in the prefetch metadata; we
      // will always render the result. We do still have to account for hanging
      // promises, but we use a different strategy. See PrefetchTreeData.
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
}: {
  fullPageDataBuffer: Buffer
  serverConsumerManifest: any
  clientModules: ManifestNode
  staleTime: number
  segmentTasks: Array<Promise<[string, Buffer]>>
}): Promise<RootTreePrefetch | null> {
  // We're currently rendering a Flight response for the route tree prefetch.
  // Inside this component, decode the Flight stream for the whole page. This is
  // a hack to transfer the side effects from the original Flight stream (e.g.
  // Float preloads) onto the Flight stream for the tree prefetch.
  // TODO: React needs a better way to do this. Needed for Server Actions, too.
  const initialRSCPayload: InitialRSCPayload = await createFromReadableStream(
    streamFromBuffer(fullPageDataBuffer),
    {
      serverConsumerManifest,
    }
  )

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

  // Compute the route metadata tree by traversing the FlightRouterState. As we
  // walk the tree, we will also spawn a task to produce a prefetch response for
  // each segment.
  const tree = await collectSegmentDataImpl(
    flightRouterState,
    seedData,
    fullPageDataBuffer,
    clientModules,
    serverConsumerManifest,
    '',
    '',
    segmentTasks
  )

  // Render the route tree to a special `/_tree` segment.
  const treePrefetch: RootTreePrefetch = {
    tree,
    staleTime,
  }
  return treePrefetch
}

async function collectSegmentDataImpl(
  route: FlightRouterState,
  seedData: CacheNodeSeedData,
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

  // Access tokens for the child segments. Sent as part of layout's data. Null
  // if there are no children.
  let childAccessTokens: { [parallelRouteKey: string]: string } | null = null

  const children = route[1]
  const seedDataChildren = seedData[2]
  for (const parallelRouteKey in children) {
    const childRoute = children[parallelRouteKey]
    const childSegment = childRoute[0]
    const childSeedData = seedDataChildren[parallelRouteKey]
    if (!childSeedData) {
      // No corresponding seed data for this segment.
      continue
    }
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
      seedData,
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

    if (childAccessTokens === null) {
      childAccessTokens = {}
    }
    childAccessTokens[parallelRouteKey] = childAccessToken
  }

  // Spawn a task to write the segment data to a new Flight stream.
  segmentTasks.push(
    // Since we're already in the middle of a render, wait until after the
    // current task to escape the current rendering context.
    waitAtLeastOneReactRenderTask().then(() =>
      renderSegmentPrefetch(
        seedData,
        segmentPathStr,
        accessToken,
        childAccessTokens,
        clientModules
      )
    )
  )

  // Metadata about the segment. Sent to the client as part of the
  // tree prefetch.
  const segment = route[0]
  const isRootLayout = route[4]
  return {
    key: segmentPathStr === '' ? '/' : segmentPathStr,
    slots: slotMetadata,
    extra: [segment, isRootLayout === true],
  }
}

async function renderSegmentPrefetch(
  seedData: CacheNodeSeedData,
  segmentPathStr: string,
  accessToken: string,
  childAccessTokens: { [parallelRouteKey: string]: string } | null,
  clientModules: ManifestNode
): Promise<[string, Buffer]> {
  // Render the segment data to a stream.
  // In the future, this is where we can include additional metadata, like the
  // stale time and cache tags.
  const rsc = seedData[1]
  const loading = seedData[3]
  const segmentPrefetch: SegmentPrefetch = {
    rsc,
    loading,
    slots: childAccessTokens,
  }
  // Since all we're doing is decoding and re-encoding a cached prerender, if
  // it takes longer than a microtask, it must because of hanging promises
  // caused by dynamic data. Abort the stream at the end of the current task.
  const abortController = new AbortController()
  waitAtLeastOneReactRenderTask().then(() => abortController.abort())
  const segmentStream = await renderToReadableStream(
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
  // itself — a shared layout must produce the same access tokens for its
  // children regardless of their segment values, so that the client only has to
  // fetch the layout once.
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
