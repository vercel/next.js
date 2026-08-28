import type {
  HeadData,
  InitialRSCPayload,
  Segment,
} from '../../../shared/lib/app-router-types'
import type { VaryParamsIterable } from '../../../shared/lib/segment-cache/vary-params-decoding'
import { InvariantError } from '../../../shared/lib/invariant-error'
import {
  transportSegmentToSegment,
  type FullTransportNode,
  type TransportSegmentData,
} from '../../../shared/lib/rsc-transport'
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
  // NOTE: we're in the server layer, so these are client references
  PlaceValidationBoundaryBelowThisLevel,
  SlotMarker,
} from '../../../client/components/instant-validation/boundary'
import {
  INSTANT_SLOT_MARKER_PREFIX,
  INSTANT_SLOT_MARKER_SUFFIX,
} from './boundary-constants'
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
import type { DebugChannelPair } from '../debug-channel-server'
import type { FlightComponentMod } from '../stream-ops'

// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromNodeStream } from 'react-server-dom-webpack/client'
import {
  addSearchParamsIfPageSegment,
  isGroupSegment,
  PAGE_SEGMENT_KEY,
  DEFAULT_SEGMENT_KEY,
  NOT_FOUND_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import {
  isFrameworkErrorRoute,
  isImplicitValidationSegment,
} from './instant-config'
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
  processSegment: (segmentPath: SegmentPath, data: TransportSegmentData) => void
) {
  const rootNode = initialRSCPayload.t.t
  const rootPath = stringifySegment(transportSegmentToSegment(rootNode.s))
  return traverseTransportNodeSegments(rootPath, rootNode, processSegment)
}

function traverseTransportNodeSegments(
  path: SegmentPath,
  node: FullTransportNode,
  processSegment: (segmentPath: SegmentPath, data: TransportSegmentData) => void
): void {
  processSegment(path, node.d)

  const children = node.c
  if (children === undefined) {
    return
  }
  for (const [parallelRouteKey, childNode] of children) {
    // NOTE: if this is a __PAGE__ segment, it might have search params appended.
    // Whoever reads from the cache needs to append them as well.
    const childPath = createChildSegmentPath(
      path,
      parallelRouteKey,
      transportSegmentToSegment(childNode.s)
    )

    traverseTransportNodeSegments(childPath, childNode, processSegment)
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
  | RenderStage.ShellRuntime
  | RenderStage.Runtime
  | RenderStage.NavigationRuntime
  | RenderStage.Dynamic

/** The stages that a prefetched segment can be in. */
export type PrefetchedSegmentStage = Exclude<SegmentStage, RenderStage.Dynamic>

export type StageChunks = Record<SegmentStage, Uint8Array[]>

export type StageEndTimes = Record<PrefetchedSegmentStage, number>

type RenderToFlightStream = (
  ComponentMod: FlightComponentMod,
  payload: any,
  clientModules: any,
  opts: any
) => AsyncIterable<Uint8Array>

/**
 * Splits an existing staged stream (represented as arrays of chunks)
 * into separate staged streams (also in arrays-of-chunks form), one for each segment.
 * */
export async function collectStagedSegmentData(
  prefetchKind: ValidationPrefetchKind,
  ComponentMod: FlightComponentMod,
  renderFlightStream: RenderToFlightStream,
  fullPageChunks: StageChunks,
  fullPageDebugChunks: Uint8Array[] | null,
  startTime: number,
  stageEndTimes: StageEndTimes,
  clientReferenceManifest: ClientReferenceManifest,
  createDebugChannel: () => DebugChannelPair | undefined
): Promise<{ cache: SegmentCache; payload: InitialRSCPayload }> {
  const cache = createSegmentCache()

  let partialStages: SegmentStage[]
  switch (prefetchKind) {
    case ValidationPrefetchKind.Shell: {
      partialStages = [
        RenderStage.ShellRuntime,
        RenderStage.Runtime,
        RenderStage.NavigationRuntime, // TODO(cache-stages): only if needed
      ]
      break
    }
    case ValidationPrefetchKind.LegacySpeculative: {
      partialStages = [RenderStage.Static, RenderStage.Runtime]
      break
    }
  }

  const doStage = async (targetStage: SegmentStage) => {
    const endTime =
      targetStage !== RenderStage.Dynamic
        ? stageEndTimes[targetStage]
        : undefined
    const firstStage = partialStages[0]
    return await collectSegmentDataForStage(
      ComponentMod,
      renderFlightStream,
      fullPageChunks,
      fullPageDebugChunks,
      clientReferenceManifest,
      createDebugChannel,
      cache,
      firstStage,
      targetStage,
      startTime,
      endTime
    )
  }

  for (const targetStage of partialStages) {
    await doStage(targetStage)
  }
  const payload = await doStage(RenderStage.Dynamic)

  return { cache, payload }
}

async function collectSegmentDataForStage(
  ComponentMod: FlightComponentMod,
  renderFlightStream: RenderToFlightStream,
  fullPageChunks: StageChunks,
  fullPageDebugChunks: Uint8Array[] | null,
  clientReferenceManifest: ClientReferenceManifest,
  createDebugChannel: () => DebugChannelPair | undefined,
  cache: SegmentCache,
  firstStage: SegmentStage,
  targetStage: SegmentStage,
  startTime: number,
  endTime: number | undefined
): Promise<InitialRSCPayload> {
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
      case RenderStage.Before:
      case RenderStage.Static:
        return 'Prerender'
      case RenderStage.ShellRuntime: // TODO(app-shells) - proper environmentName
      case RenderStage.Runtime:
      case RenderStage.NavigationRuntime:
        return 'Prefetch'
      case RenderStage.Dynamic:
        return 'Server'
      default:
        currentStage satisfies never
        throw new InvariantError(`Invalid render stage: ${currentStage}`)
    }
  }

  // Deserialize the payload partially so that we can traverse the structure.

  const serverConsumerManifest = {
    moduleLoading: null,
    moduleMap: clientReferenceManifest.rscModuleMapping,
    serverModuleMap: getServerModuleMap(),
  }

  const payloadPromise = createFromNodeStream<InitialRSCPayload>(
    stream,
    serverConsumerManifest,
    {
      findSourceMapURL,
      debugChannel: debugStream ?? undefined,
      startTime,
      // Each stage is decoded with an `endTime` corresponding to
      // when it finished rendering, so that we can avoid pointing to
      // IO that finished after the stage is done.
      // This needs to happen during the first deserialization, because
      // when we serialize the segments afterwards, React will clamp the
      // timestamps of IO to the current time, and we will lose the ability
      // to omit info about IO that hasn't resolved in this stage.
      endTime,
    }
  )

  // We expect the outer structure of the payload to be readable in any stage,
  // even if the segments are incomplete.
  // NOTE: This must be done after the `createFromNodeStream` call but *before*
  // the result is awaited, otherwise we'll deadlock.
  controller.advanceStage(firstStage)

  const payload = await payloadPromise

  // Deconstruct the payload into separate streams per segment.
  // We have to preserve the stage information for each of them,
  // so that we can later render each segment in any stage we need.

  const head = payload.t.h.r

  const segments = new Map<SegmentPath, SegmentData>()
  traverseRootSeedDataSegments(payload, (segmentPath, seedData) => {
    segments.set(segmentPath, createSegmentData(seedData))
  })

  const pendingTasks: Promise<void>[] = []

  const renderIntoStageEntry = async (
    data: HeadData | SegmentData,
    stageEntry: SegmentCacheItemStageEntry
  ): Promise<void> => {
    const segmentDebugChannel = stageEntry.debugChunks
      ? createDebugChannel()
      : undefined

    const itemStream = renderFlightStream(
      ComponentMod,
      data,
      clientReferenceManifest.clientModules,
      {
        filterStackFrame,
        debugChannel: segmentDebugChannel?.serverSide,
        environmentName,
        startTime,
        onError: onFlightRenderError,
      }
    )

    await Promise.all([
      // accumulate Flight chunks
      (async () => {
        for await (const chunk of itemStream) {
          if (controller.currentStage === RenderStage.Before) {
            throw new InvariantError('Unexpected chunk emitted in Before stage')
          }
          writeChunk(stageEntry, controller.currentStage, targetStage, chunk)
        }
      })(),
      // accumulate Debug chunks
      segmentDebugChannel &&
        (async () => {
          for await (const chunk of segmentDebugChannel.clientSide.readable) {
            stageEntry.debugChunks!.push(chunk)
          }
        })(),
    ])
  }

  // Each stage is rendered in a separate pass (passed in as targetStage),
  // so we only need two stages:
  // 1. the target stage
  // 2. the dynamic stage (for late-release debug info)
  await runInSequentialTasks(
    () => {
      if (targetStage !== RenderStage.Dynamic) {
        controller.advanceStage(targetStage)
      }

      const withDebugChunks = !!fullPageDebugChunks

      {
        let headCacheItem = cache.head
        if (!headCacheItem) {
          headCacheItem = createSegmentCacheItem()
          cache.head = headCacheItem
        }
        const stageEntry = getOrCreateStageEntry(
          headCacheItem,
          targetStage,
          withDebugChunks
        )
        pendingTasks.push(renderIntoStageEntry(head, stageEntry))
      }

      for (const [segmentPath, segmentData] of segments) {
        let segmentCacheItem = cache.segments.get(segmentPath)
        if (!segmentCacheItem) {
          segmentCacheItem = createSegmentCacheItem()
          cache.segments.set(segmentPath, segmentCacheItem)
        }
        const stageEntry = getOrCreateStageEntry(
          segmentCacheItem,
          targetStage,
          withDebugChunks
        )
        pendingTasks.push(renderIntoStageEntry(segmentData, stageEntry))
      }
    },
    () => {
      controller.advanceStage(RenderStage.Dynamic)
    }
  )
  await Promise.all(pendingTasks)

  return payload
}

function onFlightRenderError(error: unknown): string | undefined {
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
  if (process.env.NEXT_DEBUG_BUILD || process.env.__NEXT_VERBOSE_LOGGING) {
    const workStore = workAsyncStorage.getStore()
    printDebugThrownValueForProspectiveRender(
      error,
      workStore?.route ?? 'unknown route',
      Phase.InstantValidation
    )
  }
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

  let chunkIx = 0
  let currentStage: SegmentStage | RenderStage.Before = RenderStage.Before
  let closed = false

  function emitNewChunks(chunks: Uint8Array[]) {
    for (; chunkIx < chunks.length; chunkIx++) {
      stream.push(allChunks[chunkIx])
    }
  }

  function close() {
    closed = true
    stream.push(null)
  }

  const stream = new Readable({ read() {} })

  function advanceStage(stage: SegmentStage): boolean {
    if (closed) return true

    // NOTE: we don't special handling for skipping stages,
    // emitNewChunks will emit anything that hasn't been emitted before.
    currentStage = stage
    emitNewChunks(stageChunks[stage])

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
  stageData: SegmentCacheItemStageEntry,
  currentStage: SegmentStage,
  targetStage: SegmentStage,
  chunk: Uint8Array
) {
  if (currentStage <= targetStage) {
    stageData.chunks.push(chunk)
  }
  stageData.allChunks.push(chunk)
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
  ComponentMod: FlightComponentMod,
  renderFlightStream: RenderToFlightStream,
  payload: InitialRSCPayload,
  extraChunksAbortController: AbortController,
  renderSignal: AbortSignal,
  clientReferenceManifest: ClientReferenceManifest,
  startTime: number,
  isDebugChannelEnabled: boolean,
  createDebugChannel: () => DebugChannelPair | undefined
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
      const stream = renderFlightStream(
        ComponentMod,
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
          for await (const chunk of stream) {
            allChunks.push(chunk)
            if (isRenderable) {
              renderableChunks.push(chunk)
            }
          }
        })(),
        // Accumulate debug chunks
        debugChannel &&
          (async () => {
            for await (const chunk of debugChannel.clientSide.readable) {
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

async function createValidationHead(
  cache: SegmentCache,
  releaseSignal: AbortSignal,
  clientReferenceManifest: ClientReferenceManifest,
  stage: PrefetchedSegmentStage
): Promise<HeadData> {
  const segmentCacheItem = cache.head
  if (!segmentCacheItem) {
    throw new InvariantError(`Missing segment data: <head>`)
  }
  const stageEntry = getStageEntry(segmentCacheItem, stage)
  return await deserializeFromChunks<HeadData>(
    stageEntry.chunks,
    stageEntry.allChunks,
    stageEntry.debugChunks,
    releaseSignal,
    clientReferenceManifest,
    // NOTE: We're not passing an endTime, because the debug info has already been
    // truncated to the appropriate `endTime` when the segment cache was filled.
    { startTime: undefined, endTime: undefined }
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

/** An object version of `TransportSegmentData`, deserialized from the cache. */
type SegmentData = {
  node: React.ReactNode | null
  isPartial: boolean
  varyParams: VaryParamsIterable | null
}

function createSegmentData(data: TransportSegmentData): SegmentData {
  return {
    node: data.r,
    // Page payloads always carry the boolean form of `p`; the promise
    // encoding only appears in per-segment prefetch responses. Treat it
    // conservatively as partial if it ever shows up here.
    isPartial: typeof data.p === 'boolean' ? data.p : true,
    varyParams: data.v,
  }
}
/**
 * Builds a node of the rebuilt transport tree: structure (identity and
 * hints) comes from the original payload's node, render output from the
 * validation segment cache.
 */
function createTransportNodeFromSegment(
  original: FullTransportNode,
  data: SegmentData,
  children: Map<string, FullTransportNode> | null
): FullTransportNode {
  const node: FullTransportNode = {
    s: original.s,
    d: {
      r: data.node,
      p: data.isPartial,
      v: data.varyParams,
    },
  }
  if (original.h !== undefined) {
    node.h = original.h
  }
  if (children !== null) {
    node.c = children
  }
  return node
}

/**
 * The rebuild walks the loader tree and the original payload's transport
 * tree in parallel; the two mirror each other because the payload was
 * rendered from the same loader tree.
 */
function getOriginalChildNode(
  original: FullTransportNode,
  parallelRouteKey: string
): FullTransportNode {
  const childNode = original.c?.get(parallelRouteKey)
  if (childNode === undefined) {
    throw new InvariantError(
      `The payload's transport tree is missing a slot that exists in the ` +
        `loader tree: ${parallelRouteKey}`
    )
  }
  return childNode
}

function createSegmentCache(): SegmentCache {
  return { head: null, segments: new Map() }
}

function createSegmentCacheItem(): SegmentCacheItem {
  return {
    [RenderStage.Static]: null,
    [RenderStage.ShellRuntime]: null,
    [RenderStage.Runtime]: null,
    [RenderStage.NavigationRuntime]: null,
    [RenderStage.Dynamic]: null,
  }
}

function createSegmentCacheItemStageEntry(
  withDebugChunks: boolean
): SegmentCacheItemStageEntry {
  return {
    allChunks: [],
    chunks: [],
    debugChunks: withDebugChunks ? [] : null,
  }
}

function getOrCreateStageEntry(
  segmentCacheItem: SegmentCacheItem,
  stage: SegmentStage,
  withDebugChunks: boolean
): SegmentCacheItemStageEntry {
  let data = segmentCacheItem[stage]
  if (!data) {
    data = createSegmentCacheItemStageEntry(withDebugChunks)
    segmentCacheItem[stage] = data
  }
  return data
}

function getStageEntry(
  segmentCacheItem: SegmentCacheItem,
  stage: SegmentStage
): SegmentCacheItemStageEntry {
  const data = segmentCacheItem[stage]
  if (!data) {
    // Indicates that we didn't fill the cache at this stage.
    throw new InvariantError(
      `Expected segment cache to have data for stage '${RenderStage[stage]}'`
    )
  }
  return data
}

export type SegmentCache = {
  head: SegmentCacheItem | null
  segments: Map<SegmentPath, SegmentCacheItem>
}

type SegmentCacheItem = Record<SegmentStage, SegmentCacheItemStageEntry | null>

type SegmentCacheItemStageEntry = {
  chunks: Uint8Array[]
  allChunks: Uint8Array[]
  debugChunks: Uint8Array[] | null
}

type TreeResult = {
  node: FullTransportNode
  requiresInstantUI: boolean
  createInstantStack: (() => Error) | null
  /** First module file path encountered (DFS) inside this subtree,
   * or null if unavailable. The boundary's own segment may not own a
   * layout/page module (e.g. a directory whose page lives in a
   * __PAGE__ child), so we propagate the first one we find upward.
   * Surfaced in the missing-boundary fallback message as a pointer
   * to "something inside the subtree that didn't render". */
  firstModFilePath: string | null
  /** How deep in the tree the config was found. Higher = more specific.
   * Used to prefer deeper configs over shallower ones when multiple
   * slots have configs. */
  configDepth: number
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
 * Walks the LoaderTree to discover validation depth bounds.
 *
 * Each route group between URL segments represents a potential
 * shared/new boundary in a client navigation. When a user navigates
 * between sibling routes that share a route group layout, that
 * layout is already mounted — its Suspense boundaries are revealed
 * and don't cover new content below. By tracking the max group
 * depth at each URL depth, we can iterate all possible group
 * boundaries and validate that blocking code is always covered by
 * Suspense in the new tree. This is conservative: some boundaries
 * may not correspond to real navigations (e.g. a route group with
 * no siblings), but it ensures we don't miss real violations.
 *
 * The max is taken across all parallel slots. When slots have
 * different numbers of groups, the deepest slot determines the
 * iteration range. Shallower slots simply stay entirely shared
 * at group depths beyond their own group count — they run out
 * of groups before reaching the boundary, so their content
 * remains in the Dynamic stage.
 *
 * Returns an array where:
 * - length = max URL depth (number of URL-consuming segments)
 * - array[i] = max group depth at URL depth i (number of route group
 *   segments between this URL depth and the next)
 *
 * For example, a tree like:
 *   '' / (outer) / (inner) / dashboard / page
 * returns [2, 0] — URL depth 0 (root) has 2 group layers before
 * the next URL segment (dashboard), and URL depth 1 (dashboard) has
 * 0 group layers before the leaf.
 */
export function discoverValidationDepths(loaderTree: LoaderTree): number[] {
  const groupDepthsByUrlDepth: number[] = []

  function recordGroupDepth(urlDepth: number, groupDepth: number): void {
    while (groupDepthsByUrlDepth.length <= urlDepth) {
      groupDepthsByUrlDepth.push(0)
    }
    if (groupDepth > groupDepthsByUrlDepth[urlDepth]) {
      groupDepthsByUrlDepth[urlDepth] = groupDepth
    }
  }

  // urlDepth tracks the index of the current URL-consuming segment.
  // Groups accumulate at the same index. When the next URL segment
  // is reached, it increments the index and resets the group counter.
  // We start at -1 so the root segment '' increments to 0.
  function walk(tree: LoaderTree, urlDepth: number, groupDepth: number): void {
    const segment = tree[0]
    const { parallelRoutes } = parseLoaderTree(tree)
    const consumesDepth = segmentConsumesURLDepth(segment)

    let nextUrlDepth = urlDepth
    let nextGroupDepth = groupDepth
    if (consumesDepth) {
      nextUrlDepth = urlDepth + 1
      nextGroupDepth = 0
      recordGroupDepth(nextUrlDepth, 0)
    } else if (
      typeof segment === 'string' &&
      isGroupSegment(segment) &&
      segment !== '(__SLOT__)'
    ) {
      // Count real route groups but not the synthetic '(__SLOT__)' segment
      // that Next.js inserts for parallel slots. The synthetic group
      // can't be a real navigation boundary.
      nextGroupDepth++
      recordGroupDepth(urlDepth, nextGroupDepth)
    }

    for (const key in parallelRoutes) {
      walk(parallelRoutes[key], nextUrlDepth, nextGroupDepth)
    }
  }

  walk(loaderTree, -1, 0)
  return groupDepthsByUrlDepth
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
  /** Per-slot config factories indexed by slot marker index. When a
   * boundary spans multiple parallel slots, each slot gets a marker
   * component in the tree. The marker's index maps to this array to
   * find the right config for error attribution. */
  slotStacks: Array<(() => Error) | null>
}

export enum ValidationPrefetchKind {
  /** App Shells, for `<Link>` without `prefetch={true}` */
  Shell = 1,
  // TODO(app-shells): validate speculative prefetches
  // Speculative = 2,
  /** Behavior when Partial Prefetching is not enabled. */
  LegacySpeculative = 3,
}

export async function createCombinedPayloadAtDepth(
  prefetchKind: ValidationPrefetchKind,
  initialRSCPayload: InitialRSCPayload,
  cache: SegmentCache,
  initialLoaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  query: NextParsedUrlQuery | null,
  depth: number,
  groupDepth: number,
  releaseSignal: AbortSignal,
  boundaryState: ValidationBoundaryTracking,
  clientReferenceManifest: ClientReferenceManifest,
  overrideStageForPartialSegments:
    | null
    | RenderStage.Runtime
    | RenderStage.NavigationRuntime
): Promise<ValidationPayloadResult | null> {
  const workStore = workAsyncStorage.getStore()
  if (!workStore) {
    throw new InvariantError(
      'createCombinedPayloadAtDepth must run inside a WorkStore'
    )
  }
  const { validationLevel, route } = workStore

  // Index 0 is reserved for the root config. Slot markers start at 1.
  const slotStacks: Array<(() => Error) | null> = [null]

  /**
   * When a segment has multiple parallel routes (a fork), wrap each
   * slot's render output with a slot marker component. The marker's index
   * in the component stack maps to `slotStacks` for per-slot error
   * attribution. Slot markers start at index 1 (index 0 is root).
   */
  function wrapSlotsWithMarkers(
    slots: Map<string, FullTransportNode> | null,
    results: Map<string, TreeResult>
  ): void {
    if (slots === null || slots.size <= 1) return

    for (const [key, slotNode] of slots) {
      const result = results.get(key)
      const markerIndex = slotStacks.length
      slotStacks.push(result?.createInstantStack ?? null)
      const markerName = `${INSTANT_SLOT_MARKER_PREFIX}${markerIndex - 1}${INSTANT_SLOT_MARKER_SUFFIX}`
      slotNode.d.r = (
        // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- bundled in the server layer
        <SlotMarker name={markerName} key="sm">
          {slotNode.d.r}
        </SlotMarker>
      )
    }
  }

  function getSegment(loaderTree: LoaderTree): Segment {
    const dynamicParam = getDynamicParamFromSegment(loaderTree)
    if (dynamicParam) {
      return dynamicParam.treeSegment
    }
    const segment = loaderTree[0]
    return query ? addSearchParamsIfPageSegment(segment, query) : segment
  }

  async function buildSharedTransportTree(
    loaderTree: LoaderTree,
    originalNode: FullTransportNode,
    parentPath: SegmentPath | null,
    key: string | null,
    urlDepthConsumed: number,
    groupDepthConsumed: number
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

    const stageEntry = getStageEntry(segmentCacheItem, RenderStage.Dynamic)
    const dynamicChunks = stageEntry.chunks
    const segmentData = await deserializeFromChunks<SegmentData>(
      dynamicChunks,
      dynamicChunks,
      stageEntry.debugChunks,
      releaseSignal,
      clientReferenceManifest,
      null
    )

    const consumesUrlDepth = segmentConsumesURLDepth(segment)
    const isGroup =
      typeof segment === 'string' &&
      isGroupSegment(segment) &&
      segment !== '(__SLOT__)'

    // Advance counters for this segment before the boundary check,
    // mirroring how discoverValidationDepths counts. URL segments
    // increment urlDepthConsumed, groups increment groupDepthConsumed.
    // The synthetic '(__SLOT__)' segment is excluded — it can't be a
    // real navigation boundary.
    let nextUrlDepth = urlDepthConsumed
    let currentGroupDepth = groupDepthConsumed
    if (consumesUrlDepth) {
      nextUrlDepth++
      currentGroupDepth = 0
    } else if (isGroup) {
      currentGroupDepth++
    }

    const pastUrlBoundary = nextUrlDepth > depth
    const isBoundary = pastUrlBoundary && currentGroupDepth >= groupDepth

    if (isBoundary) {
      debug?.(
        `    ['${path}' is the boundary (url=${nextUrlDepth}, group=${currentGroupDepth})]`
      )
      const finalSegmentData: SegmentData = {
        ...segmentData,
        node: (
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- bundled in the server layer
          <PlaceValidationBoundaryBelowThisLevel id={path} key="c">
            {segmentData.node}
          </PlaceValidationBoundaryBelowThisLevel>
        ),
      }

      let slots: Map<string, FullTransportNode> | null = null
      const slotResults = new Map<string, TreeResult>()
      let requiresInstantUI = false
      let createInstantStack: (() => Error) | null = null
      let bestConfigDepth = -1
      // Collect the first mod file path from each slot's subtree.
      // Don't include the boundary segment's own layout/page — that
      // file DID render (it wraps the boundary). What didn't render
      // is the content inside the children slots.
      const slotModFilePaths: string[] = []
      let firstModFilePath: string | null = null

      for (const parallelRouteKey in parallelRoutes) {
        const result = await buildNewTransportTree(
          parallelRoutes[parallelRouteKey],
          getOriginalChildNode(originalNode, parallelRouteKey),
          path,
          parallelRouteKey,
          0 /* segmentDepth */
        )
        slotResults.set(parallelRouteKey, result)
        if (slots === null) {
          slots = new Map()
        }
        slots.set(parallelRouteKey, result.node)
        if (result.firstModFilePath !== null) {
          slotModFilePaths.push(result.firstModFilePath)
          if (firstModFilePath === null) {
            firstModFilePath = result.firstModFilePath
          }
        }
        if (result.requiresInstantUI) {
          requiresInstantUI = true
          if (
            result.configDepth > bestConfigDepth ||
            (result.configDepth === bestConfigDepth &&
              parallelRouteKey === 'children')
          ) {
            bestConfigDepth = result.configDepth
            createInstantStack = result.createInstantStack
          }
        }
      }

      // Only require this boundary to render if the subtree has an
      // instant config. Unconfigured slot subtrees are allowed to not
      // render (e.g. conditionally excluded by a layout).
      if (requiresInstantUI) {
        boundaryState.requiredIds.set(path, slotModFilePaths)
      }

      wrapSlotsWithMarkers(slots, slotResults)

      return {
        node: createTransportNodeFromSegment(
          originalNode,
          finalSegmentData,
          slots
        ),
        requiresInstantUI,
        createInstantStack,
        firstModFilePath,
        configDepth: bestConfigDepth,
      }
    }

    // Not at the boundary yet — keep walking as shared.
    let slots: Map<string, FullTransportNode> | null = null
    const slotResults = new Map<string, TreeResult>()
    let requiresInstantUI = false
    let createInstantStack: (() => Error) | null = null
    let bestConfigDepth = -1
    let firstModFilePath: string | null = null
    for (const parallelRouteKey in parallelRoutes) {
      const result = await buildSharedTransportTree(
        parallelRoutes[parallelRouteKey],
        getOriginalChildNode(originalNode, parallelRouteKey),
        path,
        parallelRouteKey,
        nextUrlDepth,
        currentGroupDepth
      )
      slotResults.set(parallelRouteKey, result)
      if (slots === null) {
        slots = new Map()
      }
      slots.set(parallelRouteKey, result.node)
      if (firstModFilePath === null) {
        firstModFilePath = result.firstModFilePath
      }
      if (result.requiresInstantUI) {
        requiresInstantUI = true
        if (
          result.configDepth > bestConfigDepth ||
          (result.configDepth === bestConfigDepth &&
            parallelRouteKey === 'children')
        ) {
          bestConfigDepth = result.configDepth
          createInstantStack = result.createInstantStack
        }
      }
    }

    wrapSlotsWithMarkers(slots, slotResults)

    return {
      node: createTransportNodeFromSegment(originalNode, segmentData, slots),
      requiresInstantUI,
      createInstantStack,
      firstModFilePath,
      configDepth: bestConfigDepth,
    }
  }

  async function buildNewTransportTree(
    lt: LoaderTree,
    originalNode: FullTransportNode,
    parentPath: SegmentPath | null,
    key: string | null,
    segmentDepth: number
  ): Promise<TreeResult> {
    const { parallelRoutes } = parseLoaderTree(lt)
    const { mod: layoutOrPageMod, filePath: layoutOrPageFilePath } =
      await getLayoutOrPageModule(lt)
    const localModFilePath: string | null = layoutOrPageFilePath ?? null

    const segment = getSegment(lt)
    const path: SegmentPath =
      parentPath === null
        ? stringifySegment(segment)
        : createChildSegmentPath(parentPath, key!, segment)

    let instantConfig: Instant | null = null
    let localCreateInstantStack: (() => Error) | null = null
    if (layoutOrPageMod !== undefined) {
      instantConfig = (layoutOrPageMod as AppSegmentConfig).instant ?? null

      // When the default validation level is active and this is a page or
      // default segment without an explicit config, treat it as if
      // instant = true was exported. Framework-synthesized error
      // routes are excluded — see isFrameworkErrorRoute.
      if (
        instantConfig === null &&
        validationLevel !== 'manual-warning' &&
        validationLevel !== 'experimental-manual-error' &&
        isImplicitValidationSegment(segment) &&
        !isFrameworkErrorRoute(route)
      ) {
        instantConfig = true
      }

      if (
        instantConfig === true ||
        (typeof instantConfig === 'object' && instantConfig !== null)
      ) {
        const rawFactory: unknown = (layoutOrPageMod as any)
          .__debugCreateInstantConfigStack
        localCreateInstantStack =
          typeof rawFactory === 'function' ? (rawFactory as () => Error) : null
      }
    }

    const segmentCacheItem = cache.segments.get(path)
    if (!segmentCacheItem) {
      throw new InvariantError(`Missing segment data: ${path}`)
    }

    let stage: PrefetchedSegmentStage
    switch (prefetchKind) {
      case ValidationPrefetchKind.Shell: {
        stage = overrideStageForPartialSegments ?? RenderStage.ShellRuntime
        break
      }
      case ValidationPrefetchKind.LegacySpeculative: {
        // In legacy speculative prefetches, we always use static.
        stage = overrideStageForPartialSegments ?? RenderStage.Static
        break
      }
    }

    debug?.(`    ${path || '/'} - ${RenderStage[stage]}`)

    const stageEntry = getStageEntry(segmentCacheItem, stage)
    const segmentData = await deserializeFromChunks<SegmentData>(
      stageEntry.chunks,
      stageEntry.allChunks,
      stageEntry.debugChunks,
      releaseSignal,
      clientReferenceManifest,
      // NOTE: We're not passing an endTime, because the debug info has already been
      // truncated to the appropriate `endTime` when the segment cache was filled.
      { startTime: undefined, endTime: undefined }
    )

    // Build children first, then determine requiresInstantUI.
    let slots: Map<string, FullTransportNode> | null = null
    const slotResults = new Map<string, TreeResult>()
    let childrenRequireInstantUI = false
    let childCreateInstantStack: (() => Error) | null = null
    let bestChildConfigDepth = -1
    let childFirstModFilePath: string | null = null
    for (const parallelRouteKey in parallelRoutes) {
      const childSegmentDepth = segmentConsumesURLDepth(segment)
        ? segmentDepth + 1
        : segmentDepth
      const result = await buildNewTransportTree(
        parallelRoutes[parallelRouteKey],
        getOriginalChildNode(originalNode, parallelRouteKey),
        path,
        parallelRouteKey,
        childSegmentDepth
      )
      slotResults.set(parallelRouteKey, result)
      if (slots === null) {
        slots = new Map()
      }
      slots.set(parallelRouteKey, result.node)
      if (childFirstModFilePath === null) {
        childFirstModFilePath = result.firstModFilePath
      }
      if (result.requiresInstantUI) {
        childrenRequireInstantUI = true
        if (
          result.configDepth > bestChildConfigDepth ||
          (result.configDepth === bestChildConfigDepth &&
            parallelRouteKey === 'children')
        ) {
          bestChildConfigDepth = result.configDepth
          childCreateInstantStack = result.createInstantStack
        }
      }
    }

    wrapSlotsWithMarkers(slots, slotResults)

    // Local config takes precedence over children.
    let requiresInstantUI: boolean
    let createInstantStack: (() => Error) | null
    let configDepth: number
    if (instantConfig === false) {
      requiresInstantUI = false
      createInstantStack = null
      configDepth = -1
    } else if (
      instantConfig === true ||
      (typeof instantConfig === 'object' && instantConfig !== null)
    ) {
      requiresInstantUI = true
      createInstantStack = localCreateInstantStack
      configDepth = segmentDepth
    } else {
      requiresInstantUI = childrenRequireInstantUI
      createInstantStack = childCreateInstantStack
      configDepth = bestChildConfigDepth
    }

    // First mod we find in DFS order: this segment's own layout/page if
    // any, otherwise the first non-null we got from a child.
    const firstModFilePath = localModFilePath ?? childFirstModFilePath

    return {
      node: createTransportNodeFromSegment(originalNode, segmentData, slots),
      requiresInstantUI,
      createInstantStack,
      firstModFilePath,
      configDepth,
    }
  }

  const {
    node: rebuiltTree,
    requiresInstantUI,
    createInstantStack,
  } = await buildSharedTransportTree(
    initialLoaderTree,
    initialRSCPayload.t.t,
    null /* parentPath */,
    null /* key */,
    0 /* urlDepthConsumed */,
    0 /* groupDepthConsumed */
  )

  if (!requiresInstantUI) {
    return null
  }

  // Set the root config at index 0. This is the fallback for errors
  // that occur above any fork (no slot marker in the component stack).
  slotStacks[0] = createInstantStack

  let headStage: PrefetchedSegmentStage
  switch (prefetchKind) {
    case ValidationPrefetchKind.Shell: {
      headStage = overrideStageForPartialSegments ?? RenderStage.ShellRuntime
      break
    }
    case ValidationPrefetchKind.LegacySpeculative: {
      headStage = overrideStageForPartialSegments ?? RenderStage.Static
      break
    }
  }
  debug?.(`    /_head - ${RenderStage[headStage]}`)

  const head = await createValidationHead(
    cache,
    releaseSignal,
    clientReferenceManifest,
    headStage
  )

  const payload: InitialRSCPayload = {
    ...initialRSCPayload,
    t: {
      t: rebuiltTree,
      h: {
        r: head,
        p: initialRSCPayload.t.h.p,
        v: initialRSCPayload.t.h.v,
      },
    },
  }

  return {
    payload,
    slotStacks,
  }
}
