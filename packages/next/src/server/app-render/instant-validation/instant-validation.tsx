import type {
  CacheNodeSeedData,
  FlightRouterState,
  HeadData,
  InitialRSCPayload,
  Segment,
} from '../../../shared/lib/app-router-types'
import type { VaryParamsThenable } from '../../../shared/lib/segment-cache/vary-params-decoding'
import { InvariantError } from '../../../shared/lib/invariant-error'
import { RenderStage } from '../staged-rendering'
import { getServerModuleMap } from '../manifests-singleton'
import { runInSequentialTasks } from '../app-render-render-utils'
import { workAsyncStorage } from '../work-async-storage.external'
import {
  Phase,
  printDebugThrownValueForProspectiveRender,
} from '../prospective-render-utils'
import { getDigestForWellKnownError } from '../create-error-handler'
import {
  // NOTE: we're in the server layer, so this is a client reference
  PlaceValidationBoundaryBelowThisLevel,
} from '../../../client/components/instant-validation/boundary'
import type { ValidationBoundaryTracking } from './boundary-tracking'
import {
  getLayoutOrPageModule,
  type LoaderTree,
} from '../../lib/app-dir-module'
import { parseLoaderTree } from '../../../shared/lib/router/utils/parse-loader-tree'
import type { GetDynamicParamFromSegment } from '../app-render'
import type {
  AppSegmentConfig,
  Instant,
} from '../../../build/segment-config/app/app-segment-config'
import { Readable } from 'node:stream'
import {
  createNodeStreamWithLateRelease,
  createNodeStreamFromChunks,
} from './stream-utils'
import { createDebugChannel } from '../debug-channel-server'
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromNodeStream } from 'react-server-dom-webpack/client'
// eslint-disable-next-line import/no-extraneous-dependencies
import { renderToReadableStream } from 'react-server-dom-webpack/server'
import {
  addSearchParamsIfPageSegment,
  isGroupSegment,
  PAGE_SEGMENT_KEY,
  DEFAULT_SEGMENT_KEY,
  NOT_FOUND_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import type { NextParsedUrlQuery } from '../../request-meta'

const filterStackFrame =
  process.env.NODE_ENV !== 'production'
    ? (
        require('../../lib/source-maps') as typeof import('../../lib/source-maps')
      ).filterStackFrameDEV
    : undefined
const findSourceMapURL =
  process.env.NODE_ENV !== 'production'
    ? (
        require('../../lib/source-maps') as typeof import('../../lib/source-maps')
      ).findSourceMapURLDEV
    : undefined

// FIXME: this causes typescript errors related to 'flight-client-entry-plugin.d.ts'
// type ClientReferenceManifest = ReturnType<
//   (typeof import('../manifests-singleton'))['getClientReferenceManifest']
// >
type ClientReferenceManifest = Record<string, any>

const debug =
  process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

//===============================================================
// 1. Validation planning
//===============================================================

/** Used to identify a segment. Conceptually similar to request keys in the Client Segment Cache. */
export type SegmentPath = string & { _tag: 'SegmentPath' }

/**
 * Isomorphic to a FlightRouterState, but with extra data attached.
 * Carries the segment path for each segment so we can easily get it from the cache.
 *  */
export type RouteTree = {
  path: SegmentPath
  segment: Segment
  module: null | {
    type: 'layout' | 'page'
    // TODO(instant-validation): We should know if a layout segment is shared
    instantConfig: Instant | null
    conventionPath: string
    createInstantStack: (() => Error) | null
  }

  slots: { [parallelRouteKey: string]: RouteTree } | null
}

function traverseRootSeedDataSegments(
  initialRSCPayload: InitialRSCPayload,
  processSegment: (
    segmentPath: SegmentPath,
    seedData: CacheNodeSeedData
  ) => void
) {
  const { flightRouterState, seedData } =
    getRootDataFromPayload(initialRSCPayload)

  const [rootSegment] = flightRouterState
  const rootPath = stringifySegment(rootSegment)
  return traverseCacheNodeSegments(
    rootPath,
    flightRouterState,
    seedData,
    processSegment
  )
}

function traverseCacheNodeSegments(
  path: SegmentPath,
  route: FlightRouterState,
  seedData: CacheNodeSeedData,
  processSegment: (
    segmentPath: SegmentPath,
    seedData: CacheNodeSeedData
  ) => void
): void {
  processSegment(path, seedData)

  const [_segment, childRoutes] = route
  const [_node, parallelRoutesData, _loading, _isPartial] = seedData

  for (const parallelRouteKey in childRoutes) {
    const childSeedData = parallelRoutesData[parallelRouteKey]
    if (!childSeedData) {
      throw new InvariantError(
        `Got unexpected empty seed data during instant validation`
      )
    }

    const childRoute = childRoutes[parallelRouteKey]
    // NOTE: if this is a __PAGE__ segment, it might have search params appended.
    // Whoever reads from the cache needs to append them as well.
    const [childSegment] = childRoute
    const childPath = createChildSegmentPath(
      path,
      parallelRouteKey,
      childSegment
    )

    traverseCacheNodeSegments(
      childPath,
      childRoute,
      childSeedData,
      processSegment
    )
  }
}

function createChildSegmentPath(
  parentPath: SegmentPath,
  parallelRouteKey: string,
  segment: Segment
): SegmentPath {
  const parallelRoutePrefix =
    parallelRouteKey === 'children'
      ? ''
      : `@${encodeURIComponent(parallelRouteKey)}/`
  return `${parentPath}/${parallelRoutePrefix}${stringifySegment(segment)}` as SegmentPath
}

function stringifySegment(segment: Segment): SegmentPath {
  return (
    typeof segment === 'string'
      ? encodeURIComponent(segment)
      : encodeURIComponent(segment[0]) + '|' + segment[1] + '|' + segment[2]
  ) as SegmentPath
}

//===============================================================
// 2. Separating a stream into segments
//===============================================================

export type SegmentStage =
  | RenderStage.Static
  | RenderStage.Runtime
  | RenderStage.Dynamic

export type StageChunks = Record<SegmentStage, Uint8Array[]>

export type StageEndTimes = {
  [RenderStage.Static]: number
  [RenderStage.Runtime]: number
}

/**
 * Splits an existing staged stream (represented as arrays of chunks)
 * into separate staged streams (also in arrays-of-chunks form), one for each segment.
 * */
export async function collectStagedSegmentData(
  fullPageChunks: StageChunks,
  fullPageDebugChunks: Uint8Array[] | null,
  startTime: number,
  hasRuntimePrefetch: boolean,
  clientReferenceManifest: ClientReferenceManifest
) {
  const debugChannelAbortController = new AbortController()
  const debugStream = fullPageDebugChunks
    ? createNodeStreamFromChunks(
        fullPageDebugChunks,
        debugChannelAbortController.signal
      )
    : null

  const { stream, controller } = createStagedStreamFromChunks(fullPageChunks)
  stream.on('end', () => {
    // When the stream finishes, we have to close the debug stream too,
    // but delay it to avoid "Connection closed." errors.
    setImmediate(() => debugChannelAbortController.abort())
  })

  // Technically we're just re-encoding, so nothing new should be emitted,
  // but we add an environment name just in case.
  const environmentName = () => {
    const currentStage = controller.currentStage
    switch (currentStage) {
      case RenderStage.Static:
        return 'Prerender'
      case RenderStage.Runtime:
        return hasRuntimePrefetch ? 'Prefetch' : 'Prefetchable'
      case RenderStage.Dynamic:
        return 'Server'
      default:
        currentStage satisfies never
        throw new InvariantError(`Invalid render stage: ${currentStage}`)
    }
  }

  // Deserialize the payload.
  // NOTE: the stream will initially be in the static stage, so that's as far as we get here.
  // We still expect the outer structure of the payload to be readable in this state.
  const serverConsumerManifest = {
    moduleLoading: null,
    moduleMap: clientReferenceManifest.rscModuleMapping,
    serverModuleMap: getServerModuleMap(),
  }

  const payload = await createFromNodeStream<InitialRSCPayload>(
    stream,
    serverConsumerManifest,
    {
      findSourceMapURL,
      debugChannel: debugStream ?? undefined,
      // Do not pass start/end timings - we do not want to omit any debug info.
      startTime: undefined,
      endTime: undefined,
    }
  )

  // Deconstruct the payload into separate streams per segment.
  // We have to preserve the stage information for each of them,
  // so that we can later render each segment in any stage we need.

  const { head } = getRootDataFromPayload(payload)

  const segments = new Map<SegmentPath, SegmentData>()
  traverseRootSeedDataSegments(payload, (segmentPath, seedData) => {
    segments.set(segmentPath, createSegmentData(seedData))
  })

  const cache = createSegmentCache()
  const pendingTasks: Promise<void>[] = []

  /** Track when we advance stages so we can pass them as `endTime` later. */
  const stageEndTimes: StageEndTimes = {
    [RenderStage.Static]: -1,
    [RenderStage.Runtime]: -1,
  }

  const renderIntoCacheItem = async (
    data: HeadData | SegmentData,
    cacheEntry: SegmentCacheItem
  ): Promise<void> => {
    const segmentDebugChannel = cacheEntry.debugChunks
      ? createDebugChannel()
      : undefined

    const itemStream = renderToReadableStream(
      data,
      clientReferenceManifest.clientModules,
      {
        filterStackFrame,
        debugChannel: segmentDebugChannel?.serverSide,
        environmentName,
        startTime,
        onError(error: unknown) {
          const digest = getDigestForWellKnownError(error)
          if (digest) {
            return digest
          }

          // Forward existing digests
          if (
            error &&
            typeof error === 'object' &&
            'digest' in error &&
            typeof error.digest === 'string'
          ) {
            return error.digest
          }

          // We don't need to log the errors because we would have already done that
          // when generating the original Flight stream for the whole page.
          if (
            process.env.NEXT_DEBUG_BUILD ||
            process.env.__NEXT_VERBOSE_LOGGING
          ) {
            const workStore = workAsyncStorage.getStore()
            printDebugThrownValueForProspectiveRender(
              error,
              workStore?.route ?? 'unknown route',
              Phase.InstantValidation
            )
          }
        },
      }
    )

    await Promise.all([
      // accumulate Flight chunks
      (async () => {
        for await (const chunk of itemStream.values()) {
          writeChunk(cacheEntry.chunks, controller.currentStage, chunk)
        }
      })(),
      // accumulate Debug chunks
      segmentDebugChannel &&
        (async () => {
          for await (const chunk of segmentDebugChannel.clientSide.readable.values()) {
            cacheEntry.debugChunks!.push(chunk)
          }
        })(),
    ])
  }

  await runInSequentialTasks(
    () => {
      {
        const headCacheItem = createSegmentCacheItem(!!fullPageDebugChunks)
        cache.head = headCacheItem
        pendingTasks.push(renderIntoCacheItem(head, headCacheItem))
      }

      for (const [segmentPath, segmentData] of segments) {
        const segmentCacheItem = createSegmentCacheItem(!!fullPageDebugChunks)
        cache.segments.set(segmentPath, segmentCacheItem)
        pendingTasks.push(renderIntoCacheItem(segmentData, segmentCacheItem))
      }
    },
    () => {
      stageEndTimes[RenderStage.Static] =
        performance.now() + performance.timeOrigin

      controller.advanceStage(RenderStage.Runtime)
    },
    () => {
      stageEndTimes[RenderStage.Runtime] =
        performance.now() + performance.timeOrigin

      controller.advanceStage(RenderStage.Dynamic)
    }
  )
  await Promise.all(pendingTasks)

  return { cache, payload, stageEndTimes }
}

/**
 * Turns accumulated stage chunks into a stream.
 * The stream starts out in Static stage, and can be advanced further
 * using the returned controller object.
 * Conceptually, this is similar to how we unblock more content
 * by advancing stages in a regular staged render.
 * */
function createStagedStreamFromChunks(stageChunks: StageChunks) {
  // The successive stages are supersets of one another,
  // so we can index into the dynamic chunks everywhere
  // and just look at the lengths of the Static/Runtime arrays
  const allChunks = stageChunks[RenderStage.Dynamic]

  const numStaticChunks = stageChunks[RenderStage.Static].length
  const numRuntimeChunks = stageChunks[RenderStage.Runtime].length
  const numDynamicChunks = stageChunks[RenderStage.Dynamic].length

  let chunkIx = 0
  let currentStage:
    | RenderStage.Static
    | RenderStage.Runtime
    | RenderStage.Dynamic = RenderStage.Static
  let closed = false

  function push(chunk: Uint8Array) {
    stream.push(chunk)
  }

  function close() {
    closed = true
    stream.push(null)
  }

  const stream = new Readable({
    read() {
      // Emit static chunks
      for (; chunkIx < numStaticChunks; chunkIx++) {
        push(allChunks[chunkIx])
      }

      // If there's no more chunks after this stage, finish the stream.
      if (chunkIx >= allChunks.length) {
        close()
        return
      }
    },
  })

  function advanceStage(
    stage: RenderStage.Runtime | RenderStage.Dynamic
  ): boolean {
    if (closed) return true

    switch (stage) {
      case RenderStage.Runtime: {
        currentStage = RenderStage.Runtime
        for (; chunkIx < numRuntimeChunks; chunkIx++) {
          push(allChunks[chunkIx])
        }
        break
      }

      case RenderStage.Dynamic: {
        currentStage = RenderStage.Dynamic
        for (; chunkIx < numDynamicChunks; chunkIx++) {
          push(allChunks[chunkIx])
        }
        break
      }

      default: {
        stage satisfies never
      }
    }

    // If there's no more chunks after this stage, finish the stream.
    if (chunkIx >= allChunks.length) {
      close()
      return true
    } else {
      return false
    }
  }

  return {
    stream,
    controller: {
      get currentStage() {
        return currentStage
      },
      advanceStage,
    },
  }
}

function writeChunk(
  stageChunks: StageChunks,
  stage: SegmentStage,
  chunk: Uint8Array
) {
  switch (stage) {
    case RenderStage.Static: {
      stageChunks[RenderStage.Static].push(chunk)
      // fallthrough
    }
    case RenderStage.Runtime: {
      stageChunks[RenderStage.Runtime].push(chunk)
      // fallthrough
    }
    case RenderStage.Dynamic: {
      stageChunks[RenderStage.Dynamic].push(chunk)
      break
    }
    default: {
      stage satisfies never
    }
  }
}

//===============================================================
// 3. Recombining segments into a new payload
//===============================================================

/**
 * Creates a late-release stream for a given payload.
 * When `renderSignal` is triggered, the stream will release late chunks
 * to provide extra debug info.
 * */
export async function createCombinedPayloadStream(
  payload: InitialRSCPayload,
  extraChunksAbortController: AbortController,
  renderSignal: AbortSignal,
  clientReferenceManifest: ClientReferenceManifest,
  startTime: number,
  isDebugChannelEnabled: boolean
) {
  // Collect all the chunks so that we're not dependent on timing of the render.

  let isRenderable = true
  const renderableChunks: Uint8Array[] = []
  const allChunks: Uint8Array[] = []

  const debugChunks: Uint8Array[] | null = isDebugChannelEnabled ? [] : null
  const debugChannel = isDebugChannelEnabled ? createDebugChannel() : null

  let streamFinished: Promise<any>

  await runInSequentialTasks(
    () => {
      const stream = renderToReadableStream(
        payload,
        clientReferenceManifest.clientModules,
        {
          filterStackFrame,
          debugChannel: debugChannel?.serverSide,
          startTime,
          onError(error: unknown) {
            const digest = getDigestForWellKnownError(error)
            if (digest) {
              return digest
            }

            // Forward existing digests
            if (
              error &&
              typeof error === 'object' &&
              'digest' in error &&
              typeof error.digest === 'string'
            ) {
              return error.digest
            }

            // We don't need to log the errors because we would have already done that
            // when generating the original Flight stream for the whole page.
            if (
              process.env.NEXT_DEBUG_BUILD ||
              process.env.__NEXT_VERBOSE_LOGGING
            ) {
              const workStore = workAsyncStorage.getStore()
              printDebugThrownValueForProspectiveRender(
                error,
                workStore?.route ?? 'unknown route',
                Phase.InstantValidation
              )
            }
          },
        }
      )

      streamFinished = Promise.all([
        // Accumulate Flight chunks
        (async () => {
          for await (const chunk of stream.values()) {
            allChunks.push(chunk)
            if (isRenderable) {
              renderableChunks.push(chunk)
            }
          }
        })(),
        // Accumulate debug chunks
        debugChannel &&
          (async () => {
            for await (const chunk of debugChannel.clientSide.readable.values()) {
              debugChunks!.push(chunk)
            }
          })(),
      ])
    },
    () => {
      isRenderable = false
      extraChunksAbortController.abort()
    }
  )

  await streamFinished!

  return {
    stream: createNodeStreamWithLateRelease(
      renderableChunks,
      allChunks,
      renderSignal
    ),
    debugStream: debugChunks
      ? createNodeStreamFromChunks(debugChunks, renderSignal)
      : null,
  }
}

function getRootDataFromPayload(initialRSCPayload: InitialRSCPayload) {
  // FlightDataPath is an unsound type, hence the additional checks.
  const flightDataPaths = initialRSCPayload.f
  if (flightDataPaths.length !== 1 && flightDataPaths[0].length !== 3) {
    throw new InvariantError(
      'InitialRSCPayload does not match the expected shape during instant validation.'
    )
  }
  const flightRouterState: FlightRouterState = flightDataPaths[0][0]
  const seedData: CacheNodeSeedData = flightDataPaths[0][1]
  // TODO: handle head
  const head: HeadData = flightDataPaths[0][2]

  return { flightRouterState, seedData, head }
}

async function createValidationHead(
  cache: SegmentCache,
  releaseSignal: AbortSignal,
  clientReferenceManifest: ClientReferenceManifest,
  stageEndTimes: StageEndTimes,
  stage: RenderStage.Static | RenderStage.Runtime
): Promise<HeadData> {
  const segmentCacheItem = cache.head
  if (!segmentCacheItem) {
    throw new InvariantError(`Missing segment data: <head>`)
  }
  return await deserializeFromChunks<HeadData>(
    segmentCacheItem.chunks[stage],
    segmentCacheItem.chunks[RenderStage.Dynamic],
    segmentCacheItem.debugChunks,
    releaseSignal,
    clientReferenceManifest,
    { startTime: undefined, endTime: stageEndTimes[stage] }
  )
}

type Timings = {
  startTime?: number
  endTime?: number
}

/**
 * Deserializes a (partial possibly partial) RSC stream, given as a chunk-array.
 * If the stream is partial, we'll wait for `releaseSignal` to fire
 * and then complete the deserialization using `allChunks`.
 *
 * This is used to obtain a partially-complete model (that might contain unresolved holes)
 * and then release any late debug info from chunks that came later before we abort the render.
 * */
function deserializeFromChunks<T>(
  partialChunks: Uint8Array[],
  allChunks: Uint8Array[],
  debugChunks: Uint8Array[] | null,
  releaseSignal: AbortSignal,
  clientReferenceManifest: ClientReferenceManifest,
  timings: Timings | null
): Promise<T> {
  const debugChannelAbortController = new AbortController()
  const debugStream = debugChunks
    ? createNodeStreamFromChunks(
        debugChunks,
        debugChannelAbortController.signal
      )
    : null

  const serverConsumerManifest = {
    moduleLoading: null,
    moduleMap: clientReferenceManifest.rscModuleMapping,
    serverModuleMap: getServerModuleMap(),
  }

  const segmentStream =
    partialChunks.length < allChunks.length
      ? createNodeStreamWithLateRelease(partialChunks, allChunks, releaseSignal)
      : createNodeStreamFromChunks(partialChunks)

  segmentStream.on('end', () => {
    // When the stream finishes, we have to close the debug stream too,
    // but delay it to avoid "Connection closed." errors.
    setImmediate(() => debugChannelAbortController.abort())
  })

  return createFromNodeStream(segmentStream, serverConsumerManifest, {
    findSourceMapURL,
    debugChannel: debugStream ?? undefined,
    startTime: timings?.startTime,
    endTime: timings?.endTime,
  }) as Promise<T>
}

//===============================================================
// Validation segment cache
//===============================================================

/** An object version of `CacheNodeSeedData`, without slots. */
type SegmentData = {
  node: React.ReactNode | null
  isPartial: boolean
  varyParams: VaryParamsThenable | null
}

function createSegmentData(seedData: CacheNodeSeedData): SegmentData {
  const [node, _parallelRoutesData, _unused, isPartial, varyParams] = seedData
  return {
    node,
    isPartial,
    varyParams,
  }
}
type CacheNodeSeedDataSlots = CacheNodeSeedData[1]

function getCacheNodeSeedDataFromSegment(
  data: SegmentData,
  slots: CacheNodeSeedDataSlots
): CacheNodeSeedData {
  return [
    data.node,
    slots,
    /* unused (previously `loading`) */ null,
    data.isPartial,
    data.varyParams,
  ]
}

function createSegmentCache(): SegmentCache {
  return { head: null, segments: new Map() }
}

function createSegmentCacheItem(withDebugChunks: boolean): SegmentCacheItem {
  return {
    chunks: {
      [RenderStage.Static]: [],
      [RenderStage.Runtime]: [],
      [RenderStage.Dynamic]: [],
    },
    debugChunks: withDebugChunks ? [] : null,
  }
}

export type SegmentCache = {
  head: SegmentCacheItem | null
  segments: Map<SegmentPath, SegmentCacheItem>
}

type SegmentCacheItem = {
  chunks: StageChunks
  debugChunks: Uint8Array[] | null
}

type TreeResult = {
  seedData: CacheNodeSeedData
  requiresInstantUI: boolean
  createInstantStack: (() => Error) | null
}

/**
 * Whether this segment consumes a URL depth level. Each URL depth
 * represents a potential navigation boundary.
 *
 * The root segment ('') consumes depth 0. Regular segments like
 * 'dashboard' consume the next depth — whether or not they have a
 * layout. Route groups, __PAGE__, __DEFAULT__, and /_not-found don't
 * consume a depth — they share the boundary of their parent.
 */
function segmentConsumesURLDepth(segment: Segment): boolean {
  // Dynamic segments (tuples) always consume a URL depth.
  if (typeof segment !== 'string') return true
  // Route groups, pages, defaults, and not-found don't consume a depth.
  if (
    segment.startsWith(PAGE_SEGMENT_KEY) ||
    isGroupSegment(segment) ||
    segment === DEFAULT_SEGMENT_KEY ||
    segment === NOT_FOUND_SEGMENT_KEY
  ) {
    return false
  }
  // Everything else consumes a depth, including the root segment ''.
  return true
}

/**
 * Builds a combined RSC payload for validation at a given URL depth.
 *
 * Walks the LoaderTree directly, loading modules and counting
 * URL-contributing layouts. When `depth` URL segments have been
 * consumed, the boundary flips from shared (dynamic stage) to new
 * (static/runtime stage). As the new subtree is built, we check for
 * instant configs. If none are found, returns null — no validation
 * needed at this depth or deeper.
 *
 * This combines module loading, tree walking, config discovery, and
 * payload construction into a single pass.
 */
export type ValidationPayloadResult = {
  payload: InitialRSCPayload
  /** Whether errors from this payload could be ambiguous between runtime
   * API access (cookies, headers) and uncached IO (connection, fetch).
   * True when some segments used Static stage. False when all segments
   * used Runtime stage and errors are definitively from uncached IO. */
  hasAmbiguousErrors: boolean
  createInstantStack: (() => Error) | null
}

export async function createCombinedPayloadAtDepth(
  initialRSCPayload: InitialRSCPayload,
  cache: SegmentCache,
  initialLoaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  query: NextParsedUrlQuery | null,
  depth: number,
  releaseSignal: AbortSignal,
  boundaryState: ValidationBoundaryTracking,
  clientReferenceManifest: ClientReferenceManifest,
  stageEndTimes: StageEndTimes,
  useRuntimeStageForPartialSegments: boolean
): Promise<ValidationPayloadResult | null> {
  let hasStaticSegments = false
  let hasRuntimeSegments = false

  function getSegment(loaderTree: LoaderTree): Segment {
    const dynamicParam = getDynamicParamFromSegment(loaderTree)
    if (dynamicParam) {
      return dynamicParam.treeSegment
    }
    const segment = loaderTree[0]
    return query ? addSearchParamsIfPageSegment(segment, query) : segment
  }

  async function buildSharedTreeSeedData(
    loaderTree: LoaderTree,
    parentPath: SegmentPath | null,
    key: string | null,
    urlDepthConsumed: number
  ): Promise<TreeResult> {
    const { parallelRoutes } = parseLoaderTree(loaderTree)

    const segment = getSegment(loaderTree)
    const path: SegmentPath =
      parentPath === null
        ? stringifySegment(segment)
        : createChildSegmentPath(parentPath, key!, segment)

    debug?.(`    ${path || '/'} - Dynamic`)
    const segmentCacheItem = cache.segments.get(path)
    if (!segmentCacheItem) {
      throw new InvariantError(`Missing segment data: ${path}`)
    }

    const segmentData = await deserializeFromChunks<SegmentData>(
      segmentCacheItem.chunks[RenderStage.Dynamic],
      segmentCacheItem.chunks[RenderStage.Dynamic],
      segmentCacheItem.debugChunks,
      releaseSignal,
      clientReferenceManifest,
      null
    )

    const consumesDepth = segmentConsumesURLDepth(segment)

    if (consumesDepth && urlDepthConsumed === depth) {
      debug?.(`    ['${path}' is the boundary]`)
      boundaryState.expectedIds.add(path)
      const wrappedSegmentData: SegmentData = {
        ...segmentData,
        node: (
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- bundled in the server layer
          <PlaceValidationBoundaryBelowThisLevel id={path} key="c">
            {segmentData.node}
          </PlaceValidationBoundaryBelowThisLevel>
        ),
      }
      const slots: CacheNodeSeedDataSlots = {}
      let requiresInstantUI = false
      let createInstantStack: (() => Error) | null = null
      for (const parallelRouteKey in parallelRoutes) {
        const result = await buildNewTreeSeedData(
          parallelRoutes[parallelRouteKey],
          path,
          parallelRouteKey,
          false /* isInsideRuntimePrefetch */
        )
        slots[parallelRouteKey] = result.seedData
        if (result.requiresInstantUI) {
          requiresInstantUI = true
          if (createInstantStack === null) {
            createInstantStack = result.createInstantStack
          }
        }
      }
      return {
        seedData: getCacheNodeSeedDataFromSegment(wrappedSegmentData, slots),
        requiresInstantUI,
        createInstantStack,
      }
    }

    // Not the boundary yet — keep walking the shared tree.
    const slots: CacheNodeSeedDataSlots = {}
    let requiresInstantUI = false
    let createInstantStack: (() => Error) | null = null
    for (const parallelRouteKey in parallelRoutes) {
      const result = await buildSharedTreeSeedData(
        parallelRoutes[parallelRouteKey],
        path,
        parallelRouteKey,
        consumesDepth ? urlDepthConsumed + 1 : urlDepthConsumed
      )
      slots[parallelRouteKey] = result.seedData
      if (result.requiresInstantUI) {
        requiresInstantUI = true
        if (createInstantStack === null) {
          createInstantStack = result.createInstantStack
        }
      }
    }
    return {
      seedData: getCacheNodeSeedDataFromSegment(segmentData, slots),
      requiresInstantUI,
      createInstantStack,
    }
  }

  async function buildNewTreeSeedData(
    lt: LoaderTree,
    parentPath: SegmentPath | null,
    key: string | null,
    isInsideRuntimePrefetch: boolean
  ): Promise<TreeResult> {
    const { parallelRoutes } = parseLoaderTree(lt)
    const { mod: layoutOrPageMod } = await getLayoutOrPageModule(lt)

    const segment = getSegment(lt)
    const path: SegmentPath =
      parentPath === null
        ? stringifySegment(segment)
        : createChildSegmentPath(parentPath, key!, segment)

    let instantConfig: Instant | null = null
    let localCreateInstantStack: (() => Error) | null = null
    if (layoutOrPageMod !== undefined) {
      instantConfig =
        (layoutOrPageMod as AppSegmentConfig).unstable_instant ?? null

      if (instantConfig && typeof instantConfig === 'object') {
        const rawFactory: unknown = (layoutOrPageMod as any)
          .__debugCreateInstantConfigStack
        localCreateInstantStack =
          typeof rawFactory === 'function' ? (rawFactory as () => Error) : null
      }
    }

    let childIsInsideRuntimePrefetch = isInsideRuntimePrefetch
    let stage: SegmentStage
    if (!isInsideRuntimePrefetch) {
      if (
        instantConfig &&
        typeof instantConfig === 'object' &&
        instantConfig.prefetch === 'runtime'
      ) {
        stage = RenderStage.Runtime
        childIsInsideRuntimePrefetch = true
        hasRuntimeSegments = true
      } else {
        if (useRuntimeStageForPartialSegments) {
          stage = RenderStage.Runtime
          hasRuntimeSegments = true
        } else {
          stage = RenderStage.Static
          hasStaticSegments = true
        }
      }
    } else {
      stage = RenderStage.Runtime
      hasRuntimeSegments = true
    }

    debug?.(`    ${path || '/'} - ${RenderStage[stage]}`)
    const segmentCacheItem = cache.segments.get(path)
    if (!segmentCacheItem) {
      throw new InvariantError(`Missing segment data: ${path}`)
    }

    const segmentData = await deserializeFromChunks<SegmentData>(
      segmentCacheItem.chunks[stage],
      segmentCacheItem.chunks[RenderStage.Dynamic],
      segmentCacheItem.debugChunks,
      releaseSignal,
      clientReferenceManifest,
      { startTime: undefined, endTime: stageEndTimes[stage] }
    )

    // Build children first, then determine requiresInstantUI.
    const slots: CacheNodeSeedDataSlots = {}
    let childrenRequireInstantUI = false
    let childCreateInstantStack: (() => Error) | null = null
    for (const parallelRouteKey in parallelRoutes) {
      const result = await buildNewTreeSeedData(
        parallelRoutes[parallelRouteKey],
        path,
        parallelRouteKey,
        childIsInsideRuntimePrefetch
      )
      slots[parallelRouteKey] = result.seedData
      if (result.requiresInstantUI) {
        childrenRequireInstantUI = true
        if (childCreateInstantStack === null) {
          childCreateInstantStack = result.createInstantStack
        }
      }
    }

    // Local config takes precedence over children.
    let requiresInstantUI: boolean
    let createInstantStack: (() => Error) | null
    if (instantConfig === false) {
      requiresInstantUI = false
      createInstantStack = null
    } else if (instantConfig && typeof instantConfig === 'object') {
      requiresInstantUI = true
      createInstantStack = localCreateInstantStack
    } else {
      requiresInstantUI = childrenRequireInstantUI
      createInstantStack = childCreateInstantStack
    }

    return {
      seedData: getCacheNodeSeedDataFromSegment(segmentData, slots),
      requiresInstantUI,
      createInstantStack,
    }
  }

  const { seedData, requiresInstantUI, createInstantStack } =
    await buildSharedTreeSeedData(
      initialLoaderTree,
      null /* parentPath */,
      null /* key */,
      0 /* urlDepthConsumed */
    )

  if (!requiresInstantUI) {
    return null
  }

  const { flightRouterState } = getRootDataFromPayload(initialRSCPayload)

  const headStage = hasRuntimeSegments
    ? RenderStage.Runtime
    : RenderStage.Static

  const head = await createValidationHead(
    cache,
    releaseSignal,
    clientReferenceManifest,
    stageEndTimes,
    headStage
  )

  const payload: InitialRSCPayload = {
    ...initialRSCPayload,
    f: [[flightRouterState, seedData, head]],
  }

  return {
    payload,
    hasAmbiguousErrors: hasStaticSegments,
    createInstantStack,
  }
}
