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
  InstantValidationBoundary,
} from './boundary'
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
import { addSearchParamsIfPageSegment } from '../../../shared/lib/segment'
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

/**
 * The entrypoint. Traverses the loader tree, finds `unstable_instant` configs,
 * and determines what navigations we should validate.
 * */
export async function findNavigationsToValidate(
  rootLoaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  query: NextParsedUrlQuery | null
) {
  type ValidationTask = { target: SegmentPath; parents: SegmentPath[] }

  const validationTasks: ValidationTask[] = []
  let navigationParents: SegmentPath[] = []

  const segmentsWithInstantConfigs: SegmentPath[] = []
  const treeNodes = new Map<SegmentPath, RouteTree>()

  function getSegmentFromLoaderTree(loaderTree: LoaderTree): Segment {
    const dynamicParam = getDynamicParamFromSegment(loaderTree)
    if (dynamicParam) {
      return dynamicParam.treeSegment
    }
    const segment = loaderTree[0]
    // In dev, the segment paths for all the page segments will include search params (`__PAGE__?{"q":"123"`}
    // because the payload we're reassembling had them encoded in the router state,
    // so we need to match that here.
    // TODO(instant-validation): this will likely need some restructuring for build
    return query ? addSearchParamsIfPageSegment(segment, query) : segment
  }

  async function visit(
    loaderTree: LoaderTree,
    parentPath: SegmentPath | null,
    key: string | null,
    parentLayoutPath: SegmentPath | null,
    isInsideParallelSlot: boolean
  ): Promise<RouteTree> {
    const { conventionPath, parallelRoutes } = parseLoaderTree(loaderTree)
    const { mod: layoutOrPageMod, modType } =
      await getLayoutOrPageModule(loaderTree)

    const segment = getSegmentFromLoaderTree(loaderTree)
    const segmentPath =
      parentPath === null
        ? stringifySegment(segment)
        : createChildSegmentPath(parentPath, key!, segment)

    let moduleInfo: RouteTree['module'] = null
    if (layoutOrPageMod !== undefined) {
      // TODO(restart-on-cache-miss): Does this work correctly for client page/layout modules?
      const instantConfig =
        (layoutOrPageMod as AppSegmentConfig).unstable_instant ?? null
      const rawFactory: unknown = (layoutOrPageMod as any)
        .__debugCreateInstantConfigStack
      const createInstantStack: (() => Error) | null =
        typeof rawFactory === 'function' ? (rawFactory as () => Error) : null
      moduleInfo = {
        type: modType!,
        instantConfig,
        conventionPath: conventionPath!,
        createInstantStack,
      }

      if (isInsideParallelSlot) {
        // For now, we ignore parallel routes for purposes of finding configs to validate
        // and finding shared layout parents.
        if (instantConfig !== null) {
          console.error(
            `${conventionPath}: \`unstable_instant\` validation is not fully implemented for parallel routes yet.`
          )
        }
      } else {
        if (modType === 'layout') {
          // All layouts will be checked as navigation parents, so
          // if a layout has a prefetch config, we'll check navigations into it
          // because we'll be navigating from its parents.

          if (instantConfig !== null) {
            if (instantConfig === false) {
              // we don't want to validate navigations into this segment,
              // but still want to validate inside it.
              navigationParents = []
            } else {
              const isRootLayout = parentLayoutPath === null
              if (isRootLayout && instantConfig.prefetch === 'runtime') {
                const message = `${conventionPath}: \`unstable_instant\` with mode 'runtime' is not supported in root layouts.`
                const error =
                  createInstantStack !== null
                    ? createInstantStack()
                    : new Error()
                error.message = message
                throw error
              }

              const task: ValidationTask = {
                target: segmentPath,
                parents: navigationParents,
              }
              validationTasks.push(task)
              navigationParents = []
            }
          }
          navigationParents.push(segmentPath)
        } else if (modType === 'page') {
          if (instantConfig !== null) {
            if (instantConfig === false) {
              navigationParents = []
            } else {
              // If the page itself has a prefetch config, then
              // make sure we always validate a navigation from its parent
              // to ensure `__PAGE__?p=foo -> __PAGE__?p=bar` works.
              //
              // This is relevant if the parent layout is implicit, as in
              //   my-segment/
              //     loading.tsx
              //     page.tsx
              // because the above code for layouts wouldn't add it.
              // TODO: what if this is runtime-prefetched? how does that affect a search-param navigation?
              // TODO: this can cause double validation if the parent segment is empty
              //       but we have a parent layout that'd be validated
              if (parentPath === null) {
                throw new InvariantError('A page must have a root layout')
              }
              if (!navigationParents.includes(parentPath)) {
                navigationParents.push(parentPath)
              }
              const task: ValidationTask = {
                target: segmentPath,
                parents: navigationParents,
              }
              validationTasks.push(task)
              navigationParents = []
            }
          }
        }

        if (instantConfig && typeof instantConfig === 'object') {
          segmentsWithInstantConfigs.push(segmentPath)
        }
      }
    }

    const parentLayoutPathForChildren =
      modType === 'layout' ? segmentPath : parentLayoutPath

    let slots: RouteTree['slots'] = null
    for (const parallelRouteKey in parallelRoutes) {
      const childLoaderTree = parallelRoutes[parallelRouteKey]
      const isChildInParallelSlot =
        isInsideParallelSlot || parallelRouteKey !== 'children'
      slots ??= {}
      slots[parallelRouteKey] = await visit(
        childLoaderTree,
        segmentPath,
        parallelRouteKey,
        parentLayoutPathForChildren,
        isChildInParallelSlot
      )
    }

    const treeNode: RouteTree = {
      path: segmentPath,
      segment,
      module: moduleInfo,
      slots,
    }
    treeNodes.set(segmentPath, treeNode)
    return treeNode
  }

  const routeTree = await visit(rootLoaderTree, null, null, null, false)
  return {
    tree: routeTree,
    treeNodes,
    validationTasks,
    segmentsWithInstantConfigs,
  }
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
  createPayload: (
    extraChunksReleaseSignal: AbortSignal
  ) => Promise<InitialRSCPayload>,
  renderSignal: AbortSignal,
  clientReferenceManifest: ClientReferenceManifest,
  startTime: number,
  isDebugChannelEnabled: boolean
) {
  const extraChunksAbortController = new AbortController()

  const payload = await createPayload(extraChunksAbortController.signal)

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

/**
 * Builds a combined RSC payload to represent what we'd render in the browser
 * when the specified navigation navigation is started, assuming that all the new segments
 * segments were prefetched.
 *
 * ### Background
 *
 * For a client navigation, we conceptually split the segments into two groups:
 *
 * #### Outer: the shared parent segments
 * These are common between the old view and the new one.
 * They're meant to be fully resolved, since the browser already loaded them before.
 *
 * #### Inner: the new subtree(s)
 * These segments are unique to the new view. For these segments, we first display
 * prefetched content (either static or runtime, depending on the configuration).
 *
 * When validating a navigation, we're validating that rendering the inner segments
 * (which are going to be partial) won't block, i.e. any holes are properly guarded with Suspense.
 * */
export async function createCombinedPayload(
  initialRSCPayload: InitialRSCPayload,
  cache: SegmentCache,
  validationRouteTree: RouteTree,
  /**
   * The innermost segment that is shared. Anything below will be in the new subtree.
   *
   * TODO(instant-validation):
   * this is too limited, and cannot support multiple parallel slots
   * being in the new subtree at once.
   * */
  navigationParent: SegmentPath,
  releaseSignal: AbortSignal,
  boundaryState: ValidationBoundaryTracking,
  clientReferenceManifest: ClientReferenceManifest,
  stageEndTimes: StageEndTimes,
  /** Only used when retrying a failed validation to see what caused a dynamic hole. */
  useRuntimeStageForPartialSegments: boolean,
  /** mutable out-param - Which stages are actually used in the resulting payload */
  usedSegmentKinds: Set<SegmentStage>
): Promise<InitialRSCPayload> {
  const { flightRouterState } = getRootDataFromPayload(initialRSCPayload)
  const combinedSeedData = await createValidationSeedData(
    cache,
    validationRouteTree,
    navigationParent,
    releaseSignal,
    boundaryState,
    clientReferenceManifest,
    stageEndTimes,
    useRuntimeStageForPartialSegments,
    usedSegmentKinds
  )

  // If we did a runtime prefetch for this navigation, then we'd get a runtime-stage head.
  // Otherwise, we'd only have the `/_head` segment prefetch which is static.
  // TODO(instant-validation): not sure about this as a way of detecting runtime prefetches
  // (in the presence of `useRuntimeStageForPartialSegments`), but maybe it's actually correct?
  const headStage = usedSegmentKinds.has(RenderStage.Runtime)
    ? RenderStage.Runtime
    : RenderStage.Static
  debug?.(`    <head> - ${RenderStage[headStage]}`)
  const head = await createValidationHead(
    cache,
    releaseSignal,
    clientReferenceManifest,
    stageEndTimes,
    headStage
  )

  const combinedRSCPayload: InitialRSCPayload = {
    ...initialRSCPayload,
    f: [
      // We expect the root path to only have three elements.
      [
        flightRouterState satisfies FlightRouterState,
        combinedSeedData satisfies CacheNodeSeedData,
        head satisfies HeadData,
      ],
    ],
  }
  return combinedRSCPayload
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

function createValidationSeedData(
  cache: SegmentCache,
  rootRouteTree: RouteTree,
  navigationParent: SegmentPath,
  releaseSignal: AbortSignal,
  boundaryState: ValidationBoundaryTracking,
  clientReferenceManifest: ClientReferenceManifest,
  stageEndTimes: StageEndTimes,
  useRuntimeStageForPartialSegments: boolean,
  usedSegmentKinds: Set<SegmentStage>
): Promise<CacheNodeSeedData> {
  type TraversalState =
    | { kind: 'shared-tree' }
    | { kind: 'new-tree'; isInsideRuntimePrefetch: boolean }

  async function createSeedDataFromValidationTreeImpl(
    routeTree: RouteTree,
    state: TraversalState,
    parentState: TraversalState | null
  ) {
    const { path, slots } = routeTree

    let stage: SegmentStage
    let nextState: TraversalState
    switch (state.kind) {
      case 'shared-tree': {
        stage = RenderStage.Dynamic
        if (path === navigationParent) {
          // We reached the last shared segment. Everything below is a new subtree.
          nextState = { kind: 'new-tree', isInsideRuntimePrefetch: false }
        } else {
          nextState = state
        }
        break
      }
      case 'new-tree': {
        if (!state.isInsideRuntimePrefetch) {
          // We're not already inside a runtime prefetch, so by default we prefetch statically.
          // Check if we need to switch to runtime prefetching instead.
          const prefetchConfig = routeTree.module?.instantConfig
          if (
            prefetchConfig &&
            typeof prefetchConfig === 'object' &&
            prefetchConfig.prefetch === 'runtime'
          ) {
            // We have a runtime prefetch config. The client router will
            // prefetch this segment and all segments below using a runtime prefetch.
            stage = RenderStage.Runtime
            nextState = { kind: 'new-tree', isInsideRuntimePrefetch: true }
          } else {
            // No runtime prefetch config. Continue using static prefetching.
            //
            // Note that we can also get here for `unstable_instant = false` with a `prefetch: 'static'` parent.
            // `false` doesn't currently affect router behavior, so we act like it's not there.
            //
            // If the initial validation failed, we retry the render and use the runtime stage
            // for static segments. This lets us discriminate runtime and dynamic holes.
            stage = useRuntimeStageForPartialSegments
              ? RenderStage.Runtime
              : RenderStage.Static
            nextState = state
          }
        } else {
          // We're already inside a runtime prefetch, so we stay this way.
          // Note that we can also get here for `unstable_instant = false` with a `prefetch: 'runtime'` parent.
          // `false` doesn't currently affect router behavior, so we act like it's not there.
          stage = RenderStage.Runtime
          nextState = state
        }

        break
      }
      default: {
        state satisfies never
        throw new InvariantError(
          `Unexpected state while traversing route tree: ${(state as any).kind}`
        )
      }
    }

    debug?.(`    ${path || '/'} - ${RenderStage[stage]}`)
    const segmentCacheItem = cache.segments.get(path)
    if (!segmentCacheItem) {
      throw new InvariantError(`Missing segment data: ${path}`)
    }

    // TODO: for runtime-only validations, empty segments can throw this off
    // and make us retry even though there's no *real* static segments in the tree
    usedSegmentKinds.add(stage)

    let segmentData = await deserializeFromChunks<SegmentData>(
      segmentCacheItem.chunks[stage],
      segmentCacheItem.chunks[RenderStage.Dynamic],
      segmentCacheItem.debugChunks,
      releaseSignal,
      clientReferenceManifest,
      stage === RenderStage.Dynamic
        ? null
        : { startTime: undefined, endTime: stageEndTimes[stage] }
    )

    // We place the validation boundary right below the shared parent segment
    // This means that a dynamic hole is accepted as long as it has a Suspense boundary
    // in the new subtree (i.e. it wouldn't block the navigation).
    const isValidationBoundary =
      state.kind === 'new-tree' &&
      parentState &&
      parentState.kind === 'shared-tree'

    if (isValidationBoundary) {
      debug?.(
        `    ['${path}' is in the new subtree, adding validation boundary around it]`
      )
      const boundaryId = path
      boundaryState.expectedIds.add(boundaryId)
      segmentData = {
        ...segmentData,
        node: (
          // bundled in the server layer
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx
          <InstantValidationBoundary
            id={boundaryId}
            key="c" /* matching `cacheNodeKey` */
          >
            {segmentData.node}
          </InstantValidationBoundary>
        ),
      }
    }

    const slotsSeedData: CacheNodeSeedDataSlots = {}
    if (slots) {
      for (const parallelRouteKey in slots) {
        slotsSeedData[parallelRouteKey] =
          await createSeedDataFromValidationTreeImpl(
            slots[parallelRouteKey],
            nextState,
            state
          )
      }
    }
    return getCacheNodeSeedDataFromSegment(segmentData, slotsSeedData)
  }

  return createSeedDataFromValidationTreeImpl(
    rootRouteTree,
    // Root layouts are always shared. Navigating to a new root layout is an MPA navigation.
    { kind: 'shared-tree' },
    null
  )
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
