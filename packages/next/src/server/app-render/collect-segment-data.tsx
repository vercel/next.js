/* eslint-disable @next/internal/no-ambiguous-jsx -- Bundled in entry-base so it gets the right JSX runtime. */
import type {
  InitialRSCPayload,
  PrefetchFlightResponse,
  PrefetchHints,
} from '../../shared/lib/app-router-types'
import {
  PrefetchHint,
  StaticPrefetchDisabled,
} from '../../shared/lib/app-router-types'
import type { VaryParamsIterable } from '../../shared/lib/segment-cache/vary-params-decoding'
import type { ManifestNode } from '../../build/webpack/plugins/flight-manifest-plugin'

// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'
// eslint-disable-next-line import/no-extraneous-dependencies
import { prerender } from 'react-server-dom-webpack/static'
// eslint-disable-next-line import/no-extraneous-dependencies
import { renderToReadableStream } from 'react-server-dom-webpack/server'

import {
  streamFromBuffer,
  streamToBuffer,
} from '../stream-utils/node-web-streams-helper'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
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
import {
  type FullTransportNode,
  type PartialTransportData,
  type PartialTransportNode,
  type TransportSegment,
  type TransportSegmentData,
  readFulfilledValue,
  transportSegmentToSegment,
} from '../../shared/lib/rsc-transport'

/**
 * The RSC data and vary params for a single segment of the page: the
 * requested segment of a response, an ancestor whose data is bundled into a
 * descendant's response, or the head.
 */
type SegmentSource = {
  rsc: React.ReactNode
  varyParams: VaryParamsIterable | null
}

/**
 * Server-side equivalent of the client's SegmentBundle linked list: the data
 * of ancestors bundled into a descendant's response, nearest ancestor first.
 * The chain is contiguous — it grows only through consecutive
 * InlinedIntoChild ancestors — so its elements align with the innermost
 * ancestors of the response's identity spine when the response tree is
 * assembled (see renderSegmentPrefetch). A null `data` marks a segment with
 * static prefetching disabled (prefetch: 'force-disabled') that passes
 * parent data through without contributing any of its own; its response node
 * carries identity only.
 */
type SegmentBundleNode = {
  data: SegmentSource | null
  next: SegmentBundleNode | null
}

/**
 * The identity path from the root down to a segment, innermost segment
 * first. Threaded through the route tree traversal so each spawned segment
 * response can emit a root-anchored tree.
 */
type SegmentSpine = {
  /**
   * The segment's wire identity, with the param value omitted when the
   * client parses it from the URL (see createPrefetchTransportSegment).
   */
  segment: TransportSegment
  /**
   * The segment's prefetch hints, the same merged value the /_tree response
   * emits for this node. Carrying them on every node of a segment response's
   * tree keeps the response decodable like any other transport tree — in
   * particular, the client derives each param's root-param-ness (which feeds
   * shell vary path construction) from the IsRootLayoutOrAbove bit.
   *
   * Initialized to 0 when the spine node is created (in the parent's child
   * loop) and filled in by the segment's own walk step, which is where the
   * merged hints are computed — before any spawned response render reads it.
   */
  prefetchHints: number
  /**
   * The parallel route key connecting this segment to its parent; null at
   * the root.
   */
  parallelRouteKey: string | null
  parent: SegmentSpine | null
}

/**
 * Returns the wire identity for a segment in a per-segment prefetch
 * response. When client param parsing is enabled (cacheComponents), the
 * param value is omitted (`k: null`) so the response stays byte-identical —
 * and therefore cacheable — across param values; the client parses the value
 * from the rendered pathname instead.
 */
function createPrefetchTransportSegment(
  segment: TransportSegment,
  isClientParamParsingEnabled: boolean
): TransportSegment {
  if (
    typeof segment === 'string' ||
    !isClientParamParsingEnabled ||
    segment.k === null
  ) {
    return segment
  }
  return { n: segment.n, t: segment.t, k: null, s: segment.s }
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
  // The warm-up decode also tells us the page's own shell byte boundary (its
  // `a` field): a byte offset into fullPageDataBuffer marking the end of the
  // page's shell stage, null if the shell is identical to the full static
  // response, or undefined if the render wasn't staged (no shell exists).
  //
  // And it tells us whether the render accessed runtime data (cookies,
  // headers, fallback params, searchParams, ...): the settled value of the
  // page's embedded access flag (its `u` field). Conservatively true when
  // the page carries no flag (legacy render paths) or the decode fails.
  let pageShellByteLength: number | null | undefined = undefined
  let runtimeDataAccessed = true
  try {
    const pagePayload: InitialRSCPayload = await createFromReadableStream(
      // Use a stream that never closes so pending references (dynamic
      // holes) can't error the decode.
      createUnclosingPrefetchStream(streamFromBuffer(fullPageDataBuffer)),
      {
        findSourceMapURL,
        serverConsumerManifest,
      }
    )
    await waitAtLeastOneReactRenderTask()
    // `a` is a promise resolved mid-stream; the whole buffer is present, so
    // it resolves. undefined means the render wasn't staged (no shell).
    if (pagePayload.a !== undefined) {
      pageShellByteLength = await pagePayload.a
    }
    if (pagePayload.u !== undefined) {
      // Every byte of the page buffer is present, so the flag's row (if the
      // render emitted one) is readable off its thenable status. A pending
      // row reads as `false`: a successful render always settles the flag
      // (prerender completion resolves `false`), so a pending row can only
      // appear in an aborted render's buffer, where it means no access was
      // recorded before the abort. A rejected row reads as `true`,
      // conservatively — an abort errors rows that were still pending when
      // it happened.
      runtimeDataAccessed = readFulfilledValue(pagePayload.u, false, true)
    }
  } catch {}

  // All segment responses of a page share one decode of the page buffer, and
  // one `release` promise that coordinates the two serialization stages: it
  // resolves when the coordinator lets the shell-stage bytes settle into the
  // rest of the page data (see renderSegmentPrefetch, which measures each
  // response's shell boundary at that moment). Its resolved value is true
  // when the page's shell is identical to its full static response — then so
  // is every segment's, so each resolves `a` to null instead of a boundary.
  //
  // When the page has a real shell boundary the decode is staged: only the
  // shell byte prefix is enqueued now, the rest held until the release. With
  // no boundary there's nothing to stage on, so the whole buffer is decoded
  // at once and the release is resolved eagerly (segment boundaries then fall
  // out as 0 or null without any measurement).
  const release = createPromiseWithResolvers<boolean>()
  let pageDataStream: ReadableStream<Uint8Array>
  if (typeof pageShellByteLength === 'number') {
    const prefixLength = pageShellByteLength
    pageDataStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // The shell byte prefix decodes to the page's shell variant:
        // everything the staged page render serialized after its shell stage
        // stays a pending reference until the release enqueues the rest.
        controller.enqueue(fullPageDataBuffer.subarray(0, prefixLength))
        await release.promise
        controller.enqueue(fullPageDataBuffer.subarray(prefixLength))
        // Intentionally never closed, like createUnclosingPrefetchStream:
        // the page stream may hold references that never resolve (dynamic
        // holes), and Flight errors if the stream closes while any are pending.
      },
    })
  } else {
    pageDataStream = createUnclosingPrefetchStream(
      streamFromBuffer(fullPageDataBuffer)
    )
    release.resolve(pageShellByteLength === null)
  }

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
  let treeStream: ReadableStream<Uint8Array>
  try {
    const prerenderResult = await prerender(
      // PrefetchFlightResponse is not a valid return type for a React
      // component, but we need to use a component so that when we decode the
      // original stream inside of it, the side effects are transferred to the
      // new stream.
      // @ts-expect-error
      <PrefetchTreeData
        isClientParamParsingEnabled={isCacheComponentsEnabled}
        pageDataStream={pageDataStream}
        serverConsumerManifest={serverConsumerManifest}
        clientModules={clientModules}
        staleTime={staleTime}
        segmentTasks={segmentTasks}
        onCompletedProcessingRouteTree={onCompletedProcessingRouteTree}
        prefetchInlining={prefetchInlining}
        hints={hints}
        isUpgradeableISRFallback={isUpgradeableISRFallback}
        runtimeDataAccessed={runtimeDataAccessed}
        shellStageRelease={release.promise}
      />,
      clientModules,
      {
        filterStackFrame,
        signal: abortController.signal,
        onError: onSegmentPrerenderError,
      }
    )
    treeStream = prerenderResult.prelude

    // The tree walk has spawned every segment render, each against the fully
    // available shell prefix; one task later they've flushed their shells and
    // are blocked on the release for the rest.
    await waitAtLeastOneReactRenderTask()
  } catch (error) {
    // The release still fires (finally below), so the spawned tasks run to
    // completion — but the throw skips the Promise.all that observes them.
    // Absorb their rejections so a failing task can't crash as an unhandled
    // rejection and mask this error.
    void Promise.allSettled(segmentTasks)
    throw error
  } finally {
    // Start the second stage: settle the rest of the page data into the
    // decode so each render can measure its boundary and finish. Runs on
    // failure too, so a tree-render error can't strand the spawned tasks on
    // a release that never comes. (false is inert here: a staged page's shell
    // is always a strict prefix, and an unstaged release already resolved.)
    // TODO: I don't think it's really necessary to unblock the spawned tasks.
    // It's fine if they hang indefinitely; the tasks will be garbage collected.
    release.resolve(false)
  }

  // Write the route tree to a special `/_tree` segment.
  const treeBuffer = await streamToBuffer(treeStream)
  resultMap.set('/_tree' as SegmentRequestKey, treeBuffer)

  // Also output the entire full page data response
  resultMap.set('/_full' as SegmentRequestKey, fullPageDataBuffer)

  // Await the segment tasks in parallel and write the segment prefetches to
  // the result map.
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
 *
 * `shouldAttemptStaticPrefetch` (computed by the caller from the prerender's
 * runtime-data tracking) is folded onto every node of the result, so the
 * manifest delivers it to every response like the other hint bits. It's
 * independent of the inlining feature: when `inlining` is false the sizing
 * pass is skipped entirely — no inlining bits are emitted — and only the
 * tree shape carrying the static-prefetch hint is built.
 *
 * Both kinds of hint have the same structure and the same lifetime — one
 * bitmask per node of the route tree, measured once per build and constant
 * for the deployment. They differ only in what they're derived from: the
 * inlining bits from the size of each segment's encoded response, the
 * static-prefetch bit from what the decoded body turned out to access.
 */
export async function collectPrefetchHints(
  isCacheComponentsEnabled: boolean,
  fullPageDataBuffer: Buffer,
  staleTime: number,
  clientModules: ManifestNode,
  serverConsumerManifest: any,
  inlining: { maxSize: number; maxBundleSize: number } | false,
  shouldAttemptStaticPrefetch: boolean
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

  const transportData = initialRSCPayload.t
  const rootNode = transportData.t
  const buildId = initialRSCPayload.b
  const head = transportData.h.r

  // The hints every node starts from. The static-prefetch-attempt hint is
  // page-global (the tracking that feeds it is), so it goes on every node,
  // non-propagating — the client reads it per segment, and the runtime
  // hint merging walks the manifest tree node-by-node.
  const baseHints = shouldAttemptStaticPrefetch
    ? PrefetchHint.ShouldAttemptStaticPrefetch
    : 0

  if (inlining === false) {
    // Prefetch inlining is disabled: nothing to measure, and no inlining
    // bits may be emitted (the client would act on them even though the
    // responses aren't bundled). Just mirror the route tree's shape with
    // the base hints on every node.
    return createUniformHintTree(rootNode, baseHints)
  }
  const { maxSize, maxBundleSize } = inlining

  // Root params are forwarded once at the top level of each segment
  // response, same as the page response's own root vary params; the client
  // unions them into each segment's set at read time.
  const rootVaryParamsIterable = initialRSCPayload.r ?? null

  // The page's staleTime iterable, forwarded into each segment response. When
  // Cache Components is off the page carries no `s`, so wrap the eager value.
  const staleTimeIterable =
    initialRSCPayload.s ?? createStaleTimeIterable(staleTime)

  // The page's runtime-data-access flag, forwarded into each segment
  // response's `needsRuntimeRequest`. This pass only measures sizes, so a
  // conservative already-resolved `true` stands in when the page carries
  // no `u`.
  const needsRuntimeRequest = initialRSCPayload.u ?? Promise.resolve(true)

  // This pass only measures gzip sizes for inlining hints, so nothing is
  // staged (each response's `a` falls out as the no-shell sentinel, 0), but
  // the responses are byte-identical in shape to the real ones — the point
  // of measuring. Pre-resolving false is the "nothing staged" release.
  const shellStageRelease = Promise.resolve(false)

  // This is the pass that COMPUTES the hints, so the spine hints here can't
  // be the final merged values the real pass emits — use the best available
  // approximation (the payload's own hints plus the base hints) so the
  // measured responses stay representative in size. The difference is at
  // most a few bytes per spine node (the inlining bits, on the first build).
  const rootSpine: SegmentSpine = {
    segment: createPrefetchTransportSegment(
      rootNode.s,
      isCacheComponentsEnabled
    ),
    prefetchHints:
      ((rootNode.h ?? 0) | baseHints) & ~PrefetchHint.InliningHintsStale,
    parallelRouteKey: null,
    parent: null,
  }

  // Measure the head (metadata/viewport) gzip size so the main traversal
  // can decide whether to inline it into a page's bundle.
  const [, headBuffer] = await renderSegmentPrefetch(
    buildId,
    staleTimeIterable,
    null, // no terminal segment — this is the standalone head response
    HEAD_REQUEST_KEY,
    rootSpine,
    null, // no bundled ancestors
    { rsc: head, varyParams: initialRSCPayload.t.h.v },
    rootVaryParamsIterable,
    clientModules,
    // Fallback-ness doesn't affect size, so pass false.
    false,
    needsRuntimeRequest,
    shellStageRelease
  )
  const headGzipSize = await getGzipSize(headBuffer)

  // Mutable accumulator: the first segment that accepts the head sets this
  // to true. Once set, subsequent segments skip the check.
  const headInlineState = { inlined: false }

  // Walk the tree with the parent-first, child-decides algorithm.
  const { node } = await collectPrefetchHintsImpl(
    isCacheComponentsEnabled,
    rootNode,
    buildId,
    staleTimeIterable,
    clientModules,
    ROOT_SEGMENT_REQUEST_KEY,
    rootSpine,
    null, // root has no parent to inline
    baseHints,
    maxSize,
    maxBundleSize,
    headGzipSize,
    headInlineState,
    rootVaryParamsIterable,
    needsRuntimeRequest,
    shellStageRelease
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
  isClientParamParsingEnabled: boolean,
  node: FullTransportNode,
  buildId: string | undefined,
  staleTimeIterable: AsyncIterable<number>,
  clientModules: ManifestNode,
  // TODO: Consider persisting the computed requestKey into the hints output
  // so it doesn't need to be recomputed during the build. This might also
  // suggest renaming prefetch-hints.json to something like
  // segment-manifest.json, since it would contain more than just hints.
  requestKey: SegmentRequestKey,
  spine: SegmentSpine,
  parentGzipSize: number | null,
  // Hints every node starts from (the page-global static-prefetch-attempt
  // hint); the inlining bits computed here are OR'd on top.
  baseHints: number,
  maxSize: number,
  maxBundleSize: number,
  headGzipSize: number,
  headInlineState: { inlined: boolean },
  rootVaryParamsIterable: VaryParamsIterable | null,
  needsRuntimeRequest: Promise<boolean>,
  shellStageRelease: Promise<boolean>
): Promise<{
  node: PrefetchHints
  // Total inlined bytes accumulated along the deepest accepting path in this
  // subtree. Used by ancestors for budget checks.
  inlinedBytes: number
}> {
  // Check if static prefetching is disabled for this segment
  // (prefetch: 'force-disabled' / instant = false). Such segments act as
  // transparent pass-throughs in the bundle chain: they contribute zero
  // bytes of their own and pass parent data through to children. However,
  // they cannot be the terminal of a chain — if no child accepts the parent
  // data, the parent cannot be inlined into this segment because there's no
  // static response to carry it. See the ParentInlinedIntoSelf check below.
  //
  // Partial Prefetching segments are NOT disabled even though they may need
  // a runtime prefetch: they have static data — emitted unconditionally, so
  // the client can attempt a static prefetch before deciding whether the
  // runtime request is needed — and are measured and inlined like any other
  // segment.
  const isStaticPrefetchDisabled =
    ((node.h ?? 0) & StaticPrefetchDisabled) !== 0

  // Render current segment and measure its gzip size. Skip measurement for
  // segments with static prefetching disabled since they contribute nothing.
  const nodeRsc = node.d.r
  let currentGzipSize: number | null = null
  if (!isStaticPrefetchDisabled && nodeRsc !== null) {
    const [, buffer] = await renderSegmentPrefetch(
      buildId,
      staleTimeIterable,
      { rsc: nodeRsc, varyParams: node.d.v },
      requestKey,
      spine,
      null,
      null,
      rootVaryParamsIterable,
      clientModules,
      // Size-measurement pass only; fallback-ness is irrelevant here.
      false,
      needsRuntimeRequest,
      shellStageRelease
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
  const children = node.c

  let slots: Record<string, PrefetchHints> | null = null
  let didInlineIntoChild = false
  let acceptingChildInlinedBytes = 0
  // Track the smallest inlinedBytes across all children so we know how much
  // budget remains along the best path. When our own parent asks whether we
  // can accept its data, the parent's bytes would flow through to the child
  // with the most remaining headroom.
  let smallestChildInlinedBytes = Infinity

  if (children === undefined) {
    // Leaf segment: no children have consumed any budget yet.
    smallestChildInlinedBytes = 0
  } else {
    for (const [parallelRouteKey, childNode] of children) {
      const childRequestKey = appendSegmentRequestKeyPart(
        requestKey,
        parallelRouteKey,
        createSegmentRequestKeyPart(transportSegmentToSegment(childNode.s))
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
        isClientParamParsingEnabled,
        childNode,
        buildId,
        staleTimeIterable,
        clientModules,
        childRequestKey,
        {
          segment: createPrefetchTransportSegment(
            childNode.s,
            isClientParamParsingEnabled
          ),
          // Best-available approximation of the merged hints, for
          // representative sizes — see the root spine in
          // collectPrefetchHints.
          prefetchHints:
            ((childNode.h ?? 0) | baseHints) & ~PrefetchHint.InliningHintsStale,
          parallelRouteKey,
          parent: spine,
        },
        // Once a child has accepted us, stop offering to remaining siblings.
        didInlineIntoChild ? null : sizeToOfferChild,
        baseHints,
        maxSize,
        maxBundleSize,
        headGzipSize,
        headInlineState,
        rootVaryParamsIterable,
        needsRuntimeRequest,
        shellStageRelease
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
  }

  // Mark this segment as InlinedIntoChild if one of its children accepted.
  // This means this segment doesn't need its own prefetch response — its
  // data is included in the accepting child's response instead.
  let hints = baseHints
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
  // The head is assigned to the first page bundle terminal that has budget
  // room; otherwise it's outlined as a standalone response (HeadOutlined,
  // set by the caller). Head can only be inlined into a page, not a layout,
  // because pages may access additional params (e.g. searchParams) that
  // layouts cannot. It must be a bundle terminal because only bundle
  // terminals emit a static response of their own (the head bundle is
  // appended in collectSegmentDataImpl's standalone-task branch) —
  // assigning the head to an inlined segment would leave it out of every
  // static response.
  //
  // A disabled segment (prefetch: 'force-disabled' / instant = false) is
  // never a valid target — it has no response at all. A Partial Prefetching
  // segment, by contrast, DOES have a static response (see
  // isStaticPrefetchDisabled above) and is an ordinary candidate. Runtime
  // prefetching gets no special treatment here: whether the client will
  // actually issue a runtime request can't be known at build time (a static
  // prefetch attempt may prove sufficient and skip it), so the head must
  // always be reachable through the static responses — inlined into one of
  // them, or outlined.
  const isBundleTerminal = !didInlineIntoChild && !isStaticPrefetchDisabled
  const segment = node.s
  const isPageSegment =
    typeof segment === 'string'
      ? segment === PAGE_SEGMENT_KEY
      : segment.n === PAGE_SEGMENT_KEY
  if (!headInlineState.inlined && isBundleTerminal && isPageSegment) {
    // The head counts against the bundle budget.
    if (inlinedBytes + headGzipSize < maxBundleSize) {
      hints |= PrefetchHint.HeadInlinedIntoSelf
      inlinedBytes += headGzipSize
      headInlineState.inlined = true
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

// Mirrors the route tree's shape with the same hints on every node. Used by
// collectPrefetchHints when prefetch inlining is disabled: there are no sizes
// to measure, but the static-prefetch-attempt hint still needs a manifest
// tree — the client reads the bit per node, and the runtime hint merging
// (createTransportTreeFromLoaderTree) walks the manifest tree in parallel
// with the loader tree, so a bit that's missing from a node never reaches the
// corresponding segment.
function createUniformHintTree(
  node: FullTransportNode,
  hints: number
): PrefetchHints {
  let slots: Record<string, PrefetchHints> | null = null
  const children = node.c
  if (children !== undefined) {
    for (const [parallelRouteKey, childNode] of children) {
      if (slots === null) {
        slots = {}
      }
      slots[parallelRouteKey] = createUniformHintTree(childNode, hints)
    }
  }
  return { hints, slots }
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
  pageDataStream,
  serverConsumerManifest,
  clientModules,
  staleTime,
  segmentTasks,
  onCompletedProcessingRouteTree,
  prefetchInlining,
  hints,
  isUpgradeableISRFallback,
  runtimeDataAccessed,
  shellStageRelease,
}: {
  isClientParamParsingEnabled: boolean
  pageDataStream: ReadableStream<Uint8Array>
  serverConsumerManifest: any
  clientModules: ManifestNode
  staleTime: number
  segmentTasks: Array<Promise<[SegmentRequestKey, Buffer]>>
  onCompletedProcessingRouteTree: () => void
  prefetchInlining: boolean
  hints: PrefetchHints | null
  isUpgradeableISRFallback: boolean
  runtimeDataAccessed: boolean
  shellStageRelease: Promise<boolean>
}): Promise<PrefetchFlightResponse | null> {
  // We're currently rendering a Flight response for the route tree prefetch.
  // Inside this component, decode the Flight stream for the whole page. This is
  // a hack to transfer the side effects from the original Flight stream (e.g.
  // Float preloads) onto the Flight stream for the tree prefetch.
  // TODO: React needs a better way to do this. Needed for Server Actions, too.
  //
  // This is the decode that everything downstream reads from: the route tree
  // walk below and, through it, every segment task. When staged, the values
  // extracted here hold pending references at the param-dependent holes; the
  // shell byte prefix carries the full router tree and the skeleton of every
  // segment's data, so the root resolves from the prefix alone (the rest
  // arrives at the release).
  const initialRSCPayload: InitialRSCPayload = await createFromReadableStream(
    pageDataStream,
    {
      findSourceMapURL,
      serverConsumerManifest,
    }
  )

  const transportData = initialRSCPayload.t
  const rootNode = transportData.t
  const buildId = initialRSCPayload.b
  const head = transportData.h.r

  // Root params are forwarded once at the top level of each segment
  // response, same as the page response's own root vary params; the client
  // unions them into each segment's set at read time.
  const rootVaryParamsIterable = initialRSCPayload.r ?? null

  // The page's staleTime iterable, forwarded into each segment response. When
  // Cache Components is off the page carries no `s`, so wrap the eager value.
  const staleTimeIterable =
    initialRSCPayload.s ?? createStaleTimeIterable(staleTime)

  // The page's runtime-data-access flag, forwarded into each segment
  // response's `needsRuntimeRequest`. When the page carries no `u` (e.g.
  // legacy render paths), wrap the flag the caller read from the warm-up
  // decode in an already-resolved promise.
  const needsRuntimeRequest =
    initialRSCPayload.u ?? Promise.resolve(runtimeDataAccessed)

  // Only applies when prefetch inlining is enabled — the client doesn't
  // know to look for the head inside a page's response otherwise.
  const headIsInlined =
    prefetchInlining &&
    hints !== null &&
    !(hints.hints & PrefetchHint.HeadOutlined)

  // Compute the route metadata tree by traversing the page payload's
  // transport tree. As we walk the tree, we will also spawn a task to produce
  // a prefetch response for each segment. When prefetch inlining is enabled,
  // small segments are bundled into their children's responses based on the
  // hint bits.
  const headData: SegmentSource = {
    rsc: head,
    varyParams: initialRSCPayload.t.h.v,
  }
  const rootSpine: SegmentSpine = {
    segment: createPrefetchTransportSegment(
      rootNode.s,
      isClientParamParsingEnabled
    ),
    prefetchHints: 0, // filled in by collectSegmentDataImpl
    parallelRouteKey: null,
    parent: null,
  }
  const tree = collectSegmentDataImpl(
    isClientParamParsingEnabled,
    rootNode,
    buildId,
    staleTimeIterable,
    clientModules,
    ROOT_SEGMENT_REQUEST_KEY,
    rootSpine,
    segmentTasks,
    prefetchInlining,
    hints,
    null,
    headIsInlined ? headData : null,
    rootVaryParamsIterable,
    isUpgradeableISRFallback,
    needsRuntimeRequest,
    shellStageRelease
  )

  // Spawn a task to produce a prefetch response for the "head" segment,
  // unless it was inlined into a page's bundle.
  if (!headIsInlined) {
    segmentTasks.push(
      waitAtLeastOneReactRenderTask().then(() =>
        renderSegmentPrefetch(
          buildId,
          staleTimeIterable,
          null, // no terminal segment — this is the standalone head response
          HEAD_REQUEST_KEY,
          rootSpine,
          null, // no bundled ancestors
          headData,
          rootVaryParamsIterable,
          clientModules,
          isUpgradeableISRFallback,
          needsRuntimeRequest,
          shellStageRelease
        )
      )
    )
  }

  // Notify the abort controller that we're done processing the route tree.
  // Anything async that happens after this point must be due to hanging
  // promises in the original stream.
  onCompletedProcessingRouteTree()

  // Render the route tree to a special `/_tree` segment. The response is an
  // ordinary PrefetchFlightResponse carrying only a buildId and a
  // structure-only tree.
  return buildId ? { b: buildId, t: { t: tree } } : { t: { t: tree } }
}

function collectSegmentDataImpl(
  isClientParamParsingEnabled: boolean,
  node: FullTransportNode,
  buildId: string | undefined,
  staleTimeIterable: AsyncIterable<number>,
  clientModules: ManifestNode,
  requestKey: SegmentRequestKey,
  // The identity path from the root down to this segment, used by each
  // spawned segment response to emit a root-anchored tree.
  spine: SegmentSpine,
  segmentTasks: Array<Promise<[string, Buffer]>>,
  prefetchInlining: boolean,
  hintTree: PrefetchHints | null,
  parentBundle: SegmentBundleNode | null,
  headData: SegmentSource | null,
  rootVaryParamsIterable: VaryParamsIterable | null,
  isUpgradeableISRFallback: boolean,
  needsRuntimeRequest: Promise<boolean>,
  shellStageRelease: Promise<boolean>
): PartialTransportNode {
  // Union the hints already embedded in the page payload's tree with the
  // separately-computed build-time hints. During the initial build, the
  // payload was produced before collectPrefetchHints ran, so inlining hints
  // (ParentInlinedIntoSelf, InlinedIntoChild) won't be in the node's hints
  // yet. On subsequent renders the hints are already there, so the union is
  // idempotent.
  //
  // Always strip InliningHintsStale from the result. That bit is only
  // relevant for the initial RSC payload baked into HTML — the /_tree
  // response produced here always has correct hints, so the client should
  // never see InliningHintsStale in a /_tree response.
  const prefetchHints =
    ((node.h ?? 0) | (hintTree !== null ? hintTree.hints : 0)) &
    ~PrefetchHint.InliningHintsStale

  // Record the merged hints on this segment's spine node, so every segment
  // response whose tree passes through this position emits them (see
  // SegmentSpine). Spawned response renders run after the walk, so the
  // mutation is always visible to them.
  spine.prefetchHints = prefetchHints

  // The params this segment's own output varies on, forwarded into its
  // response as-is. Root params are forwarded separately, once per response.
  const varyParams = node.d.v

  // If static prefetching is disabled for this segment
  // (prefetch: 'force-disabled' / instant = false), it still participates in
  // the bundle chain but with null data. Its node in the response tree
  // carries identity only, so the client skips creating a cache entry
  // for it.
  //
  // Partial Prefetching segments are NOT disabled even though they may need
  // a runtime prefetch: their static data is emitted UNCONDITIONALLY, so the
  // client can use it to attempt a static prefetch before deciding whether
  // the segment's runtime request is actually needed.
  const staticPrefetchDisabled = (prefetchHints & StaticPrefetchDisabled) !== 0
  const nodeRsc = node.d.r
  const rsc = !staticPrefetchDisabled ? nodeRsc : null

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
    if (nodeRsc !== null) {
      childBundle = {
        data: rsc !== null ? { rsc, varyParams } : null,
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
    if (rsc !== null) {
      const bundle =
        prefetchHints & PrefetchHint.ParentInlinedIntoSelf ? parentBundle : null
      // If this page accepts the head, include it in the response, where it
      // rides on the envelope (a response's tree only carries route
      // segments; the head has no tree position).
      const headForResponse =
        headData !== null && prefetchHints & PrefetchHint.HeadInlinedIntoSelf
          ? headData
          : null
      segmentTasks.push(
        waitAtLeastOneReactRenderTask().then(() =>
          renderSegmentPrefetch(
            buildId,
            staleTimeIterable,
            { rsc, varyParams },
            requestKey,
            spine,
            bundle,
            headForResponse,
            rootVaryParamsIterable,
            clientModules,
            isUpgradeableISRFallback,
            needsRuntimeRequest,
            shellStageRelease
          )
        )
      )
    }
    // childBundle stays null — reset the accumulator for children.
  }

  // The child nodes of the tree prefetch. Sent to the client as part of the
  // /_tree response.
  let slots: Map<string, PartialTransportNode> | undefined

  const children = node.c
  if (children !== undefined) {
    for (const [parallelRouteKey, childNode] of children) {
      const childRequestKey = appendSegmentRequestKeyPart(
        requestKey,
        parallelRouteKey,
        createSegmentRequestKeyPart(transportSegmentToSegment(childNode.s))
      )
      const childHintTree =
        hintTree !== null && hintTree.slots !== null
          ? (hintTree.slots[parallelRouteKey] ?? null)
          : null
      const childTree = collectSegmentDataImpl(
        isClientParamParsingEnabled,
        childNode,
        buildId,
        staleTimeIterable,
        clientModules,
        childRequestKey,
        {
          segment: createPrefetchTransportSegment(
            childNode.s,
            isClientParamParsingEnabled
          ),
          prefetchHints: 0, // filled in by the child's own walk step
          parallelRouteKey,
          parent: spine,
        },
        segmentTasks,
        prefetchInlining,
        childHintTree,
        childBundle,
        headData,
        rootVaryParamsIterable,
        isUpgradeableISRFallback,
        needsRuntimeRequest,
        shellStageRelease
      )
      if (slots === undefined) {
        slots = new Map()
      }
      slots.set(parallelRouteKey, childTree)
    }
  }

  // Structure of the segment — identity and hints, no render output. Sent to
  // the client as part of the /_tree response. The identity is shared with
  // this segment's own spine node (same object), where it serves the same
  // purpose for the per-segment responses.
  const treeNode: PartialTransportNode = {
    s: spine.segment,
  }
  if (prefetchHints !== 0) {
    treeNode.h = prefetchHints
  }
  if (slots !== undefined) {
    treeNode.c = slots
  }
  return treeNode
}

/**
 * Renders one segment prefetch response, and with it a shell byte boundary
 * (`a`) — the per-segment analogue of the route-level `a`. The boundary lets a
 * client later truncate the buffered response and re-decode the prefix into
 * the segment's shell variant (param-dependent content reduced to pending
 * references) without a second request.
 *
 * That boundary is the whole reason this isn't a plain re-serialize. A shell
 * is a temporal property of the staged page render, already collapsed by the
 * time the page stream is decoded, so it can't be recovered from the settled
 * values. Instead the response is serialized against a staged decode of the
 * page (the caller drip-feeds it in two stages): the shell rows flush first,
 * and the byte count when the rest is released is the boundary.
 *
 * Uses the streaming renderer, not `prerender`, because the boundary must be
 * observed mid-stream — `prerender` only exposes its prelude once finished.
 */
async function renderSegmentPrefetch(
  buildId: string | undefined,
  staleTime: AsyncIterable<number>,
  // Data for the requested (terminal) segment. Null for the standalone head
  // response, which has no tree position (its tree is the bare root
  // identity). Disabled segments are skipped by the caller.
  terminal: SegmentSource | null,
  requestKey: SegmentRequestKey,
  // The identity path from the root to the terminal segment (the root
  // itself for the standalone head response).
  spine: SegmentSpine,
  // The data of the ancestors bundled into this response, nearest ancestor
  // first, aligned with the spine's innermost ancestors.
  bundle: SegmentBundleNode | null,
  // The head's data, when it's bundled into this response (or when this IS
  // the standalone head response).
  head: SegmentSource | null,
  rootVaryParams: VaryParamsIterable | null,
  clientModules: ManifestNode,
  isUpgradeableISRFallback: boolean,
  needsRuntimeRequest: Promise<boolean>,
  shellStageRelease: Promise<boolean>
): Promise<[SegmentRequestKey, Buffer]> {
  const streamInfoStage = createPromiseWithResolvers<void>()

  // Build the response's root-anchored tree: start at the terminal segment,
  // which carries data (identity only for the standalone head response),
  // then wrap upward along the identity spine. Ancestors carry data while
  // the bundle chain lasts (it's contiguous and aligned with the innermost
  // ancestors); a chain node with null data is a segment with static
  // prefetching disabled, and it — like every ancestor above the chain —
  // carries identity only, which the client treats as "no claim" (no cache
  // entry is created). Every node carries the same prefetch hints the /_tree
  // response emits for it, so the tree is decodable like any other transport
  // tree (see SegmentSpine).
  let node: PartialTransportNode = { s: spine.segment }
  if (spine.prefetchHints !== 0) {
    node.h = spine.prefetchHints
  }
  if (terminal !== null) {
    node.d = createStagedSegmentData(
      terminal,
      staleTime,
      clientModules,
      streamInfoStage.promise
    )
  }
  let edgeParallelRouteKey = spine.parallelRouteKey
  let ancestor = spine.parent
  let bundleNode = bundle
  while (ancestor !== null && edgeParallelRouteKey !== null) {
    const parentNode: PartialTransportNode = {
      s: ancestor.segment,
    }
    if (ancestor.prefetchHints !== 0) {
      parentNode.h = ancestor.prefetchHints
    }
    if (bundleNode !== null) {
      if (bundleNode.data !== null) {
        parentNode.d = createStagedSegmentData(
          bundleNode.data,
          staleTime,
          clientModules,
          streamInfoStage.promise
        )
      }
      bundleNode = bundleNode.next
    }
    parentNode.c = new Map([[edgeParallelRouteKey, node]])
    node = parentNode
    edgeParallelRouteKey = ancestor.parallelRouteKey
    ancestor = ancestor.parent
  }
  const transportData: PartialTransportData = { t: node }
  if (head !== null) {
    transportData.h = createStagedSegmentData(
      head,
      staleTime,
      clientModules,
      streamInfoStage.promise
    )
  }

  const responseKey =
    requestKey === ROOT_SEGMENT_REQUEST_KEY
      ? ('/_index' as SegmentRequestKey)
      : requestKey

  // `a` (see PrefetchFlightResponse['a']) is resolved below, once the
  // shell stage's bytes have been counted.
  let totalByteLength = 0
  const shellByteOffset: PromiseWithResolvers<number | null> =
    createPromiseWithResolvers<number | null>()

  // Wrap in the response envelope — an ordinary PrefetchFlightResponse.
  const payload: PrefetchFlightResponse = {
    t: transportData,
    a: shellByteOffset.promise,
    u: needsRuntimeRequest,
  }
  if (buildId) {
    payload.b = buildId
  }
  if (rootVaryParams !== null) {
    payload.r = rootVaryParams
  }
  if (isUpgradeableISRFallback) {
    payload.f = true
  }

  const abortController = new AbortController()
  const segmentStream: ReadableStream<Uint8Array> = renderToReadableStream(
    payload,
    clientModules,
    {
      filterStackFrame,
      signal: abortController.signal,
      onError(error: unknown) {
        if (abortController.signal.aborted) {
          // Expected: aborting the render "errors" every reference that is
          // still pending, i.e. the dynamic holes. The corresponding error
          // rows are discarded below.
          return undefined
        }
        return onSegmentPrerenderError(error)
      },
    }
  )

  // Consume the stream as it's emitted, counting bytes so the shell boundary
  // can be measured. Reads settle within a microtask of each enqueue, so by
  // the time the release resolves (in a task after the renderer's last
  // flush), every byte the renderer has emitted has been counted.
  const reader = segmentStream.getReader()
  const chunksPromise = new Promise<Uint8Array[]>(async (resolve) => {
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (abortController.signal.aborted) {
        // Discard the error rows emitted by the abort. This matches the
        // halting behavior of `prerender`, which emits nothing for tasks
        // that are still pending when it's aborted.
        continue
      }
      chunks.push(value)
      totalByteLength += value.byteLength
    }
    resolve(chunks)
  })

  // The release's value is true when the page's shell is its entire static
  // response — then so is every segment's, so `a` is null (no separate shell
  // to extract). Otherwise we measure.
  const shellIsFullResponse = await shellStageRelease

  // The shell stage is complete: everything the render can emit from the shell
  // prefix has flushed, so this is the shell's byte length.
  const byteLengthAfterShellStage = totalByteLength

  // Wait one task for the rest of the segment data (past the page's own shell
  // boundary) to flush, per the timing rule: one macrotask after the release
  // enqueues it into the input decode, the render has emitted all of it.
  await waitAtLeastOneReactRenderTask()

  // Resolve `a`: null when the page said its shell is the whole response
  // (shellIsFullResponse) — then so is every segment's. Otherwise resolve the
  // measured boundary, even if no segment *content* follows it: the
  // stage-dependent metadata (`staleTime`, `needsRuntimeRequest`) always
  // lands its post-shell values and completion rows after this point, so a
  // truncated decode is meaningful for every segment of a staged page. When
  // the page wasn't staged at all, the release resolved before any bytes
  // flushed and the measured boundary falls out as 0, the "no shell"
  // sentinel.
  if (shellIsFullResponse) {
    shellByteOffset.resolve(null)
  } else {
    shellByteOffset.resolve(byteLengthAfterShellStage)
  }

  // Now write the stream metadata (`a`, the `isPartial` promises, and a
  // post-shell `needsRuntimeRequest` resolution). This is gated behind
  // streamInfoStage so it lands strictly after the boundary measurement
  // above — the post-shell values must not count as (or leak into) the
  // shell prefix.
  streamInfoStage.resolve()

  // Wait for the metadata rows to flush before halting — two macrotasks,
  // each a distinct hop:
  //   1. streamInfoStage unblocks the completeness probe renders; a static
  //      segment's probe resolves within this task (a partial one never does,
  //      which is how it stays pending → read as partial).
  //   2. those resolutions (and the already-resolved `a`) ping the render,
  //      which emits their rows; the consumer reads that chunk here.
  // Halting after only the first hop would drop the not-yet-flushed metadata.
  await waitAtLeastOneReactRenderTask()
  await waitAtLeastOneReactRenderTask()

  // We're done writing, so we can abort the stream.
  abortController.abort()
  return [responseKey, Buffer.concat(await chunksPromise)]
}

// Attaches the staged per-segment fields to a segment's data. We can
// determine if a segment contains only partial data if it takes longer
// than a task to encode, because dynamic data is encoded as an infinite
// promise. We must do this in a separate Flight prerender from the one
// that actually generates the prefetch stream because we need to include
// the result in the stream itself.
function createStagedSegmentData(
  data: SegmentSource,
  staleTime: AsyncIterable<number>,
  clientModules: ManifestNode,
  // The response's streamInfoStage gate; the completeness probe must not
  // start until it resolves, i.e. until the input stream is fully unblocked.
  streamInfoStage: Promise<void>
): TransportSegmentData {
  const contentIsComplete = new Promise<void>(async (resolve) => {
    // Wait for the input stream to be fully unblocked before checking if
    // the data can be decoded synchronously.
    await streamInfoStage

    // If the data is fully static, this will resolve synchronously.
    // Otherwise, the promise stays unresolved forever, and so does
    // whatever field it's encoded into in the outer response.
    await prerender(data.rsc, clientModules, {
      filterStackFrame,
      onError() {},
    })
    resolve()
  })
  return {
    r: data.rsc,
    p: contentIsComplete,
    v: data.varyParams,
    s: staleTime,
  }
}

// Wraps a known staleTime value in the same async-iterable shape as the page
// response's `s`, so segment responses carry staleTime uniformly (and
// rewindably) whether or not Cache Components supplied a real `s` iterable.
// Re-consumable: each consumer gets a fresh generator (one segment response's
// render, and there can be several).
function createStaleTimeIterable(staleTime: number): AsyncIterable<number> {
  return {
    async *[Symbol.asyncIterator]() {
      yield staleTime
    },
  }
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
