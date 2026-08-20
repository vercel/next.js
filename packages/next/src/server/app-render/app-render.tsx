import type { ComponentType, ErrorInfo, JSX, ReactNode } from 'react'
import type { PartialTransportData } from '../../shared/lib/rsc-transport'
import type { RenderOpts, PreloadCallbacks } from './types'
import type {
  ActionResult,
  DynamicParamTypesShort,
  DynamicSegmentTuple,
  FlightRouterState,
  RSCPayload,
  NavigationFlightResponse,
  DynamicNavigationFlightResponse,
  ActionFlightResponse,
  InitialRSCPayload,
  PrefetchHints,
} from '../../shared/lib/app-router-types'
import { PrefetchHint } from '../../shared/lib/app-router-types'
import type { Readable } from 'node:stream'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import type {
  InstantValidationSamples,
  PrerenderStoreModernClient,
  PrerenderStoreModernRuntime,
  PrerenderStoreModernServer,
  RequestStore,
  ValidationStoreClient,
  WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'
import type { NextParsedUrlQuery } from '../request-meta'
import { getTurbopackChunkGroupBootstrap } from '../get-page-files'
import { UNDERSCORE_NOT_FOUND_ROUTE_ENTRY } from '../../shared/lib/entry-constants'
import type { LoaderTree } from '../lib/app-dir-module'
import type { AppPageModule } from '../route-modules/app-page/module'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { IncomingHttpHeaders } from 'http'
import * as ReactClient from 'react'

import RenderResult, {
  type AppPageRenderResultMetadata,
  type RenderResultOptions,
} from '../render-result'
import {
  chainStreams,
  continueFizzStream,
  continueDynamicPrerender,
  continueStaticPrerender,
  continueDynamicHTMLResumeNode,
  continueDynamicHTMLResumeWeb,
  continueStaticFallbackPrerender,
  streamToBuffer,
  streamToString,
  createWebInlinedDataStream,
  createPendingStream,
  createOnHeadersCallback,
  resumeAndAbort,
  renderToWebFlightStream,
  resumeToFizzStream,
  getServerPrerender,
  getClientPrerender,
  processPrelude as processPreludeOp,
  createDocumentClosingStream,
  teeStream,
  renderToWebFizzStream,
  renderToNodeFlightStream,
  renderToNodeFizzStream,
  createNodeInlinedDataStream,
} from './stream-ops'
import type { AnyStream } from './stream-ops'
import { getInstantTestBootstrapScriptContent } from './instant-test-bootstrap'
import { stripInternalQueries } from '../internal-utils'
import {
  NEXT_HMR_REFRESH_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_ROUTER_STALE_TIME_HEADER,
  NEXT_URL,
  RSC_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_REQUEST_ID_HEADER,
  NEXT_HTML_REQUEST_ID_HEADER,
} from '../../client/components/app-router-headers'
import { createMetadataContext } from '../../lib/metadata/metadata-context'
import {
  createRequestStore as createRequestStoreFromInputs,
  createRequestStoreForRender,
} from '../async-storage/request-store'
import { isRSCRequestHeader } from '../lib/is-rsc-request'
import {
  createPrerenderWorkStore,
  createWorkStore,
} from '../async-storage/work-store'
import { formatValidationEvent } from './dev-validation-events'
import { createSnapshot } from './async-local-storage'
import {
  getDevValidationWorker,
  type DevValidationWorkerMessage,
  type SerializedValidationInputs,
} from './dev-validation-worker-globals'
import { buildDevValidationSnapshot } from './dev-validation-worker-snapshot'
import {
  getAccessFallbackErrorTypeByStatus,
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from '../../client/components/http-access-fallback/http-access-fallback'
import {
  getURLFromRedirectError,
  getRedirectStatusCodeFromError,
} from '../../client/components/redirect'
import { isRedirectError } from '../../client/components/redirect-error'
import { getImplicitTags, type ImplicitTags } from '../lib/implicit-tags'
import { AppRenderSpan, NextNodeServerSpan } from '../lib/trace/constants'
import {
  getRequestInsightsIdentity,
  runWithRequestInsightsIdentity,
} from '../lib/trace/request-insights-identity'
import { getTracer, SpanStatusCode } from '../lib/trace/tracer'
import { traceLocalSpan } from '../lib/trace/local-span-recorder'
import { isRequestInsightsEnabled } from '../lib/trace/request-insights'
import { FlightRenderResult } from './flight-render-result'
import {
  createReactServerErrorHandler,
  createHTMLErrorHandler,
  type DigestedError,
  isUserLandError,
  getDigestForWellKnownError,
} from './create-error-handler'
import { dynamicParamTypes } from './get-short-dynamic-param-type'
import { getSegmentParam } from '../../shared/lib/router/utils/get-segment-param'
import { getScriptNonceFromHeader } from './get-script-nonce-from-header'
import { parseAndValidateFlightRouterState } from './parse-and-validate-flight-router-state'
import {
  createFullTransportTreeFromLoaderTree,
  getMissingPrefetchHintPolicy,
  type MissingPrefetchHintPolicy,
} from './create-transport-tree-from-loader-tree'
import { handleAction } from './action-handler'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { warn, error } from '../../build/output/log'
import {
  appendMutableCookies,
  RequestCookiesAdapter,
} from '../web/spec-extension/adapters/request-cookies'
import { HeadersAdapter } from '../web/spec-extension/adapters/headers'
import { createServerInsertedHTML } from './server-inserted-html'
import { getRequiredScripts } from './required-scripts'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'
import { makeGetServerInsertedHTML } from './make-get-server-inserted-html'
import {
  walkTreeWithFlightRouterState,
  createFullTreeForNavigation,
} from './walk-tree-with-flight-router-state'
import { createFullComponentTree, getRootParams } from './create-component-tree'
import { getAssetQueryString } from './get-asset-query-string'
import {
  getClientReferenceManifest,
  getServerModuleMap,
} from './manifests-singleton'
import {
  DynamicState,
  type PostponedState,
  DynamicHTMLPreludeState,
  parsePostponedState,
  parseResumeDataCacheFromPostponedState,
} from './postponed-state'
import {
  getDynamicDataPostponedState,
  getDynamicHTMLPostponedState,
  getPostponedFromState,
} from './postponed-state'
import { isDynamicServerError } from '../../client/components/hooks-server-context'
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
import { getFlightStream } from './use-flight-response'
import {
  StaticGenBailoutError,
  isStaticGenBailoutError,
} from '../../client/components/static-generation-bailout'
import { getStackWithoutErrorMessage } from '../../lib/format-server-error'
import { extractNextErrorCode } from '../../lib/error-telemetry-utils'
import {
  accessedDynamicData,
  createRenderInBrowserAbortSignal,
  formatDynamicAPIAccesses,
  isPrerenderInterruptedError,
  createDynamicTrackingState,
  createDynamicValidationState,
  trackAllowedDynamicAccess,
  throwIfDisallowedDynamic,
  PreludeState,
  consumeDynamicAccess,
  type DynamicAccess,
  logDisallowedDynamicError,
  trackDynamicHoleInRuntimeShell,
  trackDynamicHoleInStaticShell,
  getStaticShellDisallowedDynamicReasons,
  getNavigationDisallowedDynamicReasons,
  trackDynamicHoleInNavigation,
  DynamicHoleKind,
  trackThrownErrorInNavigation,
  createInstantValidationState,
  type NavigationValidationResult,
  throwIfSyncIOUsed,
} from './dynamic-rendering'
import { logBuildDebugHint } from './blocking-route-messages'
import {
  getClientComponentLoaderMetrics,
  wrapClientComponentLoader,
} from '../client-component-renderer-logger'
import { isNodeNextRequest, isNodeNextResponse } from '../base-http/helpers'
import { waitForResponseToFinish } from './wait-for-response'
import {
  beginDevValidation,
  type DevValidationGeneration,
  yieldToForegroundRequest,
} from './dev-validation-scheduler'
import { signalFromNodeResponse } from '../web/spec-extension/adapters/next-request'
import {
  parseRelativeUrl,
  type ParsedRelativeUrl,
} from '../../shared/lib/router/utils/parse-relative-url'
import AppRouter from '../../client/components/app-router'
import type { ServerComponentsHmrCache } from '../response-cache'
import type { RequestErrorContext } from '../instrumentation/types'
import { getIsPossibleServerAction } from '../lib/server-action-request-meta'
import { createInitialRouterState } from '../../client/components/router-reducer/create-initial-router-state'
import { createMutableActionQueue } from '../../client/components/app-router-instance'
import { getRevalidateReason } from '../instrumentation/utils'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import {
  getFallbackRouteParams,
  type OpaqueFallbackRouteParams,
} from '../request/fallback-params'
import {
  ReactServerPrerenderResult,
  createReactServerPrerenderResult,
  ReactServerResult,
  ReplayableNodeStream,
  createReactServerPrerenderResultFromRender,
} from './app-render-prerender-utils'
import {
  Phase,
  printDebugThrownValueForProspectiveRender,
} from './prospective-render-utils'
import { runInSequentialTasks } from './app-render-render-utils'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import {
  getHmrRefreshHash,
  workUnitAsyncStorage,
  type PrerenderStore,
} from './work-unit-async-storage.external'
import { consoleAsyncStorage } from './console-async-storage.external'
import { CacheSignal } from './cache-signal'
import {
  createResponseVaryParamsAccumulator,
  finishAccumulatingVaryParams,
  getMetadataVaryParamsAccumulator,
  getRootParamsVaryParamsAccumulator,
} from './vary-params'
import { getTracedMetadata } from '../lib/trace/utils'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  StaleTimeIterable,
  createSelectStaleTime,
  trackStaleTime,
} from './stale-time'

import { HTML_CONTENT_TYPE_HEADER, INFINITE_CACHE } from '../../lib/constants'
import { createComponentStylesAndScripts } from './create-component-styles-and-scripts'
import { parseLoaderTree } from '../../shared/lib/router/utils/parse-loader-tree'
import {
  createPrerenderResumeDataCache,
  createRenderResumeDataCache,
  type PrerenderResumeDataCache,
  type RenderResumeDataCache,
  type ResumeDataCache,
} from '../resume-data-cache/resume-data-cache'
import type { MetadataErrorType } from '../../lib/metadata/resolve-metadata'
import isError from '../../lib/is-error'
import { createServerInsertedMetadata } from './metadata-insertion/create-server-inserted-metadata'
import { getPreviouslyRevalidatedTags } from '../server-utils'
import { executeRevalidates } from '../revalidation-utils'
import {
  trackPendingChunkLoad,
  trackPendingImport,
  trackPendingModules,
} from './module-loading/track-module-loading.external'
import { isReactLargeShellError } from './react-large-shell-error'
import type { GlobalErrorComponent } from '../../client/components/builtin/global-error'
import { normalizeConventionFilePath } from './segment-explorer-path'
import { getRequestMeta } from '../request-meta'
import {
  getDynamicParam,
  interpolateParallelRouteParams,
} from '../../shared/lib/router/utils/get-dynamic-param'
import type { Params } from '../request/params'
import { ImageConfigContext } from '../../shared/lib/image-config-context.shared-runtime'
import { imageConfigDefault } from '../../shared/lib/image-config'
import {
  getNextStage,
  isAdvanceableRenderStage,
  RENDER_STAGE_ADVANCE_ORDER,
  RenderStage,
  StagedRenderingController,
  SyncIOMode,
  type AdvanceableRenderStage,
} from './staged-rendering'
import {
  anySegmentHasPartialPrefetchingEnabled,
  isPageAllowedToBlock,
  anySegmentNeedsInstantValidationInDev,
  anySegmentNeedsInstantValidationInBuild,
  resolveInstantConfigSamplesForPage,
} from './instant-validation/instant-config'
import { warnOnce } from '../../shared/lib/utils/warn-once'
import {
  createWebDebugChannel,
  createNodeDebugChannel,
  type DebugChannelPair,
  type NodeDebugChannelPair,
} from './debug-channel-server'
import {
  createNodeStreamFromChunks,
  createNodeStreamWithLateRelease,
} from './instant-validation/stream-utils'

import {
  createValidationBoundaryTracking,
  type ValidationBoundaryTracking,
} from './instant-validation/boundary-tracking'
import type {
  AppSegmentConfig,
  InstantSample,
} from '../../build/segment-config/app/app-segment-config'
import { ResponseCookies } from '../web/spec-extension/cookies'
import { isInstantValidationError } from './instant-validation/instant-validation-error'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
import { RENDER_STAGES_BY_DATA_KIND } from '../dynamic-rendering-utils'
import type { StageEndTimes } from './instant-validation/instant-validation'

export type GetDynamicParamFromSegment = (
  // The LoaderTree to extract the dynamic param from
  loaderTree: LoaderTree
) => DynamicParam | null

export type DynamicParam = {
  param: string
  value: string | string[] | null
  treeSegment: DynamicSegmentTuple
  type: DynamicParamTypesShort
}

export type GenerateFlight = typeof generateDynamicFlightRenderResult

export type AppSharedContext = {
  buildId: string
  deploymentId: string
  clientAssetToken: string
}

type AppRenderCapabilities = {
  /**
   * Whether the response may contain postponed holes. This is conservatively
   * true for prerenders with PPR enabled, even when the response turns out to
   * be fully static, because a false negative could cause the client to skip
   * fetching dynamic data. Per-segment prefetch responses replace this with a
   * more precise value during segment-data collection.
   */
  isPossiblyPartialResponse: boolean
  /** Whether this route supports per-segment prefetching in the client protocol. */
  supportsPerSegmentPrefetching: boolean
}

export type AppRenderContext = {
  sharedContext: AppSharedContext
  workStore: WorkStore
  missingPrefetchHintPolicy: MissingPrefetchHintPolicy
  renderCapabilities: AppRenderCapabilities
  url: ReturnType<typeof parseRelativeUrl>
  componentMod: AppPageModule
  renderOpts: RenderOpts
  parsedRequestHeaders: ParsedRequestHeaders
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  interpolatedParams: Params
  /**
   * The request's fallback route params (the same ones
   * `getDynamicParamFromSegment` closes over). Kept on the context so the dev
   * validation worker can rebuild an identical `getDynamicParamFromSegment`;
   * the depth-loop segment keys are derived from it, so it must match what
   * produced the seed render's Flight, not the separate fallback set validation
   * uses to mark params unknown in its stores.
   */
  fallbackRouteParams: OpaqueFallbackRouteParams | null
  query: NextParsedUrlQuery
  isPrefetch: boolean
  isPossibleServerAction: boolean
  requestTimestamp: number
  appUsingSizeAdjustment: boolean
  flightRouterState?: FlightRouterState
  requestId: string
  htmlRequestId: string
  pagePath: string
  assetPrefix: string
  isNotFoundPath: boolean
  nonce: string | undefined
  res: BaseNextResponse
  /**
   * For now, the implicit tags are common for the whole route. If we ever start
   * rendering/revalidating segments independently, they need to move to the
   * work unit store.
   */
  implicitTags: ImplicitTags
}

function maybeAppendBuildIdToRSCPayload<T extends RSCPayload>(
  ctx: AppRenderContext,
  payload: T
): T {
  if (!ctx.sharedContext.deploymentId) {
    // When using the build id, we need to initialize the id on initial page load, so a build id
    // header wouldn't be enough.
    payload.b = ctx.sharedContext.buildId
  }
  return payload
}

interface ParseRequestHeadersOptions {
  readonly isRoutePPREnabled: boolean
  readonly previewModeId: string | undefined
}

const flightDataPathHeadKey = 'h'
const getFlightViewportKey = (requestId: string) => requestId + 'v'
const getFlightMetadataKey = (requestId: string) => requestId + 'm'

const filterStackFrame =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .filterStackFrameDEV
    : undefined

interface ParsedRequestHeaders {
  /**
   * Router state provided from the client-side router. Used to handle rendering
   * from the common layout down. This value will be undefined if the request is
   * not a client-side navigation request, or if the request is a prefetch
   * request.
   */
  readonly flightRouterState: FlightRouterState | undefined
  readonly isPrefetchRequest: boolean
  readonly isRuntimePrefetchRequest: boolean
  /**
   * App Shell prefetch: a runtime prefetch that the server renders with
   * params omitted (any `await params` hangs forever). Produces the
   * param-independent shell of the route. Implies isRuntimePrefetchRequest.
   */
  readonly isAppShellPrefetchRequest: boolean
  readonly isRouteTreePrefetchRequest: boolean
  readonly isHmrRefresh: boolean
  readonly isRSCRequest: boolean
  readonly nonce: string | undefined
  readonly previouslyRevalidatedTags: string[]
  readonly requestId: string | undefined
  readonly htmlRequestId: string | undefined
}

function parseRequestHeaders(
  headers: IncomingHttpHeaders,
  options: ParseRequestHeadersOptions
): ParsedRequestHeaders {
  const isRSCRequest = isRSCRequestHeader(headers[RSC_HEADER])

  // runtime prefetch requests are *not* treated as prefetch requests
  // (TODO: this is confusing, we should refactor this to express this better)
  const isPrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_PREFETCH_HEADER] === '1'

  const isAppShellPrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_PREFETCH_HEADER] === '3'

  // App Shell prefetches are a subtype of runtime prefetch — same code path,
  // but with less resolved content (omitting link data)
  const isRuntimePrefetchRequest =
    isRSCRequest &&
    (headers[NEXT_ROUTER_PREFETCH_HEADER] === '2' || isAppShellPrefetchRequest)

  const isHmrRefresh = headers[NEXT_HMR_REFRESH_HEADER] !== undefined

  const shouldProvideFlightRouterState =
    isRSCRequest && (!isPrefetchRequest || !options.isRoutePPREnabled)

  const flightRouterState = shouldProvideFlightRouterState
    ? parseAndValidateFlightRouterState(headers[NEXT_ROUTER_STATE_TREE_HEADER])
    : undefined

  // Checks if this is a prefetch of the Route Tree by the Segment Cache
  const isRouteTreePrefetchRequest =
    isRSCRequest && headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] === '/_tree'

  const csp =
    headers['content-security-policy'] ||
    headers['content-security-policy-report-only']

  const nonce =
    typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined

  const previouslyRevalidatedTags = getPreviouslyRevalidatedTags(
    headers,
    options.previewModeId
  )

  let requestId: string | undefined
  let htmlRequestId: string | undefined

  if (process.env.__NEXT_DEV_SERVER) {
    // The request IDs are only used for the dev server to send debug
    // information to the matching client (identified by the HTML request ID
    // that was sent to the client with the HTML document) for the current
    // request (identified by the request ID, as defined by the client).

    requestId =
      typeof headers[NEXT_REQUEST_ID_HEADER] === 'string'
        ? headers[NEXT_REQUEST_ID_HEADER]
        : undefined

    htmlRequestId =
      typeof headers[NEXT_HTML_REQUEST_ID_HEADER] === 'string'
        ? headers[NEXT_HTML_REQUEST_ID_HEADER]
        : undefined
  }

  return {
    flightRouterState,
    isPrefetchRequest,
    isRuntimePrefetchRequest,
    isAppShellPrefetchRequest,
    isRouteTreePrefetchRequest,
    isHmrRefresh,
    isRSCRequest,
    nonce,
    previouslyRevalidatedTags,
    requestId,
    htmlRequestId,
  }
}

/**
 * Walks the loader tree to find the minimum `unstable_dynamicStaleTime` exported by
 * any page module. Returns null if no page exports the config.
 *
 * This only reads static exports from page modules — it does not render any
 * server components, so it's cheap to call.
 *
 * TODO: Move this to the prefetch hints file so we don't have to walk the
 * tree on every render.
 */
async function getDynamicStaleTime(tree: LoaderTree): Promise<number | null> {
  const { page, parallelRoutes } = parseLoaderTree(tree)

  let result: number | null = null

  // Only pages (not layouts) can export unstable_dynamicStaleTime.
  if (typeof page !== 'undefined') {
    const pageMod = await page[0]()
    if (
      pageMod &&
      typeof (pageMod as AppSegmentConfig).unstable_dynamicStaleTime ===
        'number'
    ) {
      const value = (pageMod as AppSegmentConfig).unstable_dynamicStaleTime!
      result = result !== null ? Math.min(result, value) : value
    }
  }

  const childPromises: Promise<number | null>[] = []
  for (const parallelRouteKey in parallelRoutes) {
    childPromises.push(getDynamicStaleTime(parallelRoutes[parallelRouteKey]))
  }
  const childResults = await Promise.all(childPromises)
  for (const childResult of childResults) {
    if (childResult !== null) {
      result = result !== null ? Math.min(result, childResult) : childResult
    }
  }

  return result
}

function createNotFoundLoaderTree(loaderTree: LoaderTree): LoaderTree {
  const components = loaderTree[2]
  const hasGlobalNotFound = !!components['global-not-found']
  const notFoundTreeComponents: LoaderTree[2] = hasGlobalNotFound
    ? {
        layout: components['global-not-found']!,
        page: [() => null, 'next/dist/client/components/builtin/empty-stub'],
      }
    : {
        page: components['not-found'],
      }

  return [
    '',
    {
      children: [PAGE_SEGMENT_KEY, {}, notFoundTreeComponents, null],
    },
    // Always include global-error so that getGlobalErrorStyles can access it.
    // When global-not-found is present, use full components.
    // Otherwise, only include global-error module.
    hasGlobalNotFound
      ? components
      : { 'global-error': components['global-error'] },
    null, // staticSiblings
  ]
}

/**
 * Returns a function that parses the dynamic segment and return the associated value.
 */
function makeGetDynamicParamFromSegment(
  interpolatedParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  optimisticRouting: boolean
): GetDynamicParamFromSegment {
  return function getDynamicParamFromSegment(loaderTree: LoaderTree) {
    const [segment, , , staticSiblings] = loaderTree
    const segmentParam = getSegmentParam(segment)
    if (!segmentParam) {
      return null
    }
    const segmentKey = segmentParam.paramName
    const dynamicParamType = dynamicParamTypes[segmentParam.paramType]
    // Static siblings are only included when optimistic routing is enabled
    const siblings = optimisticRouting ? staticSiblings : null
    return getDynamicParam(
      interpolatedParams,
      segmentKey,
      dynamicParamType,
      fallbackRouteParams,
      siblings
    )
  }
}

function NonIndex({
  createElement,
  pagePath,
  statusCode,
  isPossibleServerAction,
}: {
  createElement: typeof ReactClient.createElement
  pagePath: string
  statusCode: number | undefined
  isPossibleServerAction: boolean
}) {
  const is404Page = pagePath === '/404'
  const isInvalidStatusCode = typeof statusCode === 'number' && statusCode > 400

  // Only render noindex for page request, skip for server actions
  // TODO: is this correct if `isPossibleServerAction` is a false positive?
  if (!isPossibleServerAction && (is404Page || isInvalidStatusCode)) {
    return createElement('meta', {
      name: 'robots',
      content: 'noindex',
    })
  }
  return null
}

/**
 * This is used by server actions & client-side navigations to generate RSC data from a client-side request.
 * This function is only called on "dynamic" requests (ie, there wasn't already a static response).
 * It uses request headers (namely `next-router-state-tree`) to determine where to start rendering.
 */
async function generateDynamicRSCPayload(
  ctx: AppRenderContext,
  options?: {
    actionResult?: ActionResult
    skipPageRendering?: boolean
    staleTimeIterable?: AsyncIterable<number>
    staticStageByteLengthPromise?: Promise<number>
    shellByteLengthPromise?: Promise<number | null>
    shellUsedSessionDataPromise?: Promise<boolean>
    runtimePrefetchStream?: ReadableStream<Uint8Array>
  }
): Promise<RSCPayload> {
  // Transport data that is going to be passed to the browser. Undefined when
  // the response renders nothing: server actions, if the server action
  // handler instructs this function to skip rendering. When the server action
  // reducer sees an absent tree, it resolves the action with no data.
  let transportData: PartialTransportData | undefined = undefined

  const {
    componentMod: {
      routeModule: {
        userland: { loaderTree },
      },
      createElement,
      createMetadataComponents,
      Fragment,
    },
    query,
    requestId,
    flightRouterState,
    workStore,
    url,
  } = ctx

  const serveStreamingMetadata = !!ctx.renderOpts.serveStreamingMetadata

  if (!options?.skipPageRendering) {
    const preloadCallbacks: PreloadCallbacks = []
    const requestStore = workUnitAsyncStorage.getStore()

    // If we're performing instant validation, we need to render the whole tree,
    // without skipping shared layouts.
    const needsFullTree =
      process.env.__NEXT_DEV_SERVER &&
      ctx.renderOpts.cacheComponents &&
      !(
        requestStore?.type === 'request' &&
        isBypassingCachesInDev(requestStore, workStore)
      ) &&
      !options?.actionResult && // Only for navigations
      (await anySegmentNeedsInstantValidationInDev(loaderTree))

    const { Viewport, Metadata, MetadataOutlet } = createMetadataComponents({
      tree: loaderTree,
      parsedQuery: query,
      pathname: url.pathname,
      metadataContext: createMetadataContext(ctx.renderOpts),
      interpolatedParams: ctx.interpolatedParams,
      serveStreamingMetadata,
    })

    const rscHead = createElement(
      Fragment,
      {
        key: flightDataPathHeadKey,
      },
      createElement(NonIndex, {
        createElement,
        pagePath: ctx.pagePath,
        statusCode: ctx.res.statusCode,
        isPossibleServerAction: ctx.isPossibleServerAction,
      }),
      createElement(Viewport, {
        key: getFlightViewportKey(requestId),
      }),
      createElement(Metadata, {
        key: getFlightMetadataKey(requestId),
      })
    )

    const responseTree = needsFullTree
      ? await createFullTreeForNavigation({
          ctx,
          loaderTree,
          rscHead,
          injectedCSS: new Set(),
          injectedJS: new Set(),
          injectedFontPreloadTags: new Set(),
          preloadCallbacks,
          MetadataOutlet,
        })
      : await walkTreeWithFlightRouterState({
          ctx,
          loaderTreeToFilter: loaderTree,
          parentParams: {},
          flightRouterState,
          rscHead,
          injectedCSS: new Set(),
          injectedJS: new Set(),
          injectedFontPreloadTags: new Set(),
          rootLayoutIncluded: false,
          preloadCallbacks,
          MetadataOutlet,
          hintTree: ctx.renderOpts.prefetchHints?.[ctx.pagePath] ?? null,
        })

    if (responseTree !== null) {
      transportData = {
        t: responseTree.tree,
        h: {
          r: responseTree.head,
          p: responseTree.isHeadPartial,
          v: getMetadataVaryParamsAccumulator(),
        },
      }
    }
  }

  // In dev, the Vary header may not reliably reflect whether a route can
  // be intercepted, because interception routes are compiled on demand.
  // Default to true so the client doesn't cache a stale Fallback entry.
  const varyHeader = ctx.res.getHeader('vary')
  const couldBeIntercepted =
    !!process.env.__NEXT_DEV_SERVER ||
    (typeof varyHeader === 'string' && varyHeader.includes(NEXT_URL))

  // If we have an action result, then this is a server action response.
  // We can rely on this because `ActionResult` will always be a promise, even if
  // the result is falsey.
  if (options?.actionResult) {
    const actionResponse: ActionFlightResponse = {
      a: options.actionResult,
      q: getRenderedSearch(query),
      i: !!couldBeIntercepted,
    }
    if (transportData !== undefined) {
      actionResponse.t = transportData
    }
    return maybeAppendBuildIdToRSCPayload(ctx, actionResponse)
  }

  // Otherwise, it's a regular RSC response.
  const baseResponse: DynamicNavigationFlightResponse =
    maybeAppendBuildIdToRSCPayload(ctx, {
      q: getRenderedSearch(query),
      i: !!couldBeIntercepted,
      // Tells the client whether this route supports per-segment prefetching.
      // With Cache Components, all routes support it. Without it, only fully
      // static pages do, because their per-segment prefetch responses are
      // generated during static generation (build or ISR).
      S: ctx.renderCapabilities.supportsPerSegmentPrefetching,
      r: getRootParamsVaryParamsAccumulator() ?? undefined,
    })
  if (transportData !== undefined) {
    baseResponse.t = transportData
  }

  if (options?.staleTimeIterable !== undefined) {
    baseResponse.s = options.staleTimeIterable
  }

  if (options?.staticStageByteLengthPromise !== undefined) {
    baseResponse.l = options.staticStageByteLengthPromise
  }
  if (options?.shellByteLengthPromise !== undefined) {
    baseResponse.a = options.shellByteLengthPromise
  }
  if (options?.shellUsedSessionDataPromise !== undefined) {
    baseResponse.w = options.shellUsedSessionDataPromise
  }

  if (options?.runtimePrefetchStream !== undefined) {
    baseResponse.p = options.runtimePrefetchStream
  }

  // Include the per-page dynamic stale time from unstable_dynamicStaleTime. This
  // function only generates payloads for dynamic requests, and the client treats
  // the field's presence as authoritative.
  // TODO: Move this to the prefetch hints file so we don't have to walk the
  // tree on every render.
  const dynamicStaleTime = await getDynamicStaleTime(
    ctx.componentMod.routeModule.userland.loaderTree
  )
  if (dynamicStaleTime !== null) {
    baseResponse.d = dynamicStaleTime
  }

  return baseResponse
}

function createRequestErrorContext(
  ctx: AppRenderContext,
  renderSource: RequestErrorContext['renderSource']
): RequestErrorContext {
  return createErrorContext(
    ctx,
    renderSource,
    getRevalidateReason({
      isOnDemandRevalidate: ctx.workStore.isOnDemandRevalidate,
    })
  )
}

function createPrerenderErrorContext(
  ctx: AppRenderContext,
  renderSource: RequestErrorContext['renderSource']
): RequestErrorContext {
  return createErrorContext(
    ctx,
    renderSource,
    getRevalidateReason({
      isOnDemandRevalidate: ctx.workStore.isOnDemandRevalidate,
      isStaticGeneration: true,
    })
  )
}

function createErrorContext(
  ctx: AppRenderContext,
  renderSource: RequestErrorContext['renderSource'],
  revalidateReason: RequestErrorContext['revalidateReason']
): RequestErrorContext {
  return {
    routerKind: 'App Router',
    routePath: ctx.pagePath,
    // TODO: is this correct if `isPossibleServerAction` is a false positive?
    routeType: ctx.isPossibleServerAction ? 'action' : 'render',
    renderSource,
    revalidateReason,
  }
}

/**
 * Produces a RenderResult containing the Flight data for the given request. See
 * `generateDynamicRSCPayload` for information on the contents of the render result.
 */
async function generateDynamicFlightRenderResult(
  req: BaseNextRequest,
  ctx: AppRenderContext,
  requestStore: RequestStore,
  options?: {
    actionResult: ActionResult
    skipPageRendering: boolean
    preloadCallbacks?: PreloadCallbacks
    temporaryReferences?: WeakMap<any, string>
    waitUntil?: Promise<unknown>
  }
): Promise<RenderResult> {
  const { htmlRequestId, renderOpts, requestId, workStore } = ctx

  const {
    onInstrumentationRequestError,
    setReactDebugChannel,
    isBuildTimePrerendering = false,
  } = renderOpts

  function onFlightDataRenderError(err: DigestedError, silenceLog: boolean) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createRequestErrorContext(ctx, 'react-server-components-payload'),
      silenceLog
    )
  }

  const onError = createReactServerErrorHandler(
    process.env.NODE_ENV === 'development',
    isBuildTimePrerendering,
    workStore.reactServerErrorsByDigest,
    onFlightDataRenderError
  )

  // With Server Components HMR cancellation enabled, a superseded HMR refresh
  // aborts its own client fetch, which closes this response. We use that
  // response-close to abort the discarded render. This is the
  // non-Cache-Components dev RSC path; unlike the Cache Components staged path
  // it has no detached validation, so the render is the only work to cancel.
  const requestAbortSignal =
    process.env.__NEXT_DEV_SERVER &&
    renderOpts.experimental.serverComponentsHmrCancellation === true &&
    requestStore.isHmrRefresh === true &&
    isNodeNextResponse(ctx.res)
      ? signalFromNodeResponse(ctx.res.originalResponse)
      : undefined

  if (process.env.__NEXT_USE_NODE_STREAMS) {
    const debugChannel = setReactDebugChannel && createNodeDebugChannel()

    if (debugChannel) {
      setReactDebugChannel(debugChannel.clientSide, htmlRequestId, requestId)
    }

    const { clientModules } = getClientReferenceManifest()

    const rscPayload = await workUnitAsyncStorage.run(
      requestStore,
      generateDynamicRSCPayload,
      ctx,
      options
    )

    const flightStream = workUnitAsyncStorage.run(
      requestStore,
      renderToNodeFlightStream,
      ctx.componentMod,
      rscPayload,
      clientModules,
      {
        onError,
        temporaryReferences: options?.temporaryReferences,
        filterStackFrame,
        debugChannel: debugChannel?.serverSide,
        signal: requestAbortSignal,
      }
    )

    return new FlightRenderResult(
      flightStream,
      { fetchMetrics: workStore.fetchMetrics },
      options?.waitUntil
    )
  } else {
    const debugChannel = setReactDebugChannel && createWebDebugChannel()

    if (debugChannel) {
      setReactDebugChannel(debugChannel.clientSide, htmlRequestId, requestId)
    }

    const { clientModules } = getClientReferenceManifest()

    const rscPayload = await workUnitAsyncStorage.run(
      requestStore,
      generateDynamicRSCPayload,
      ctx,
      options
    )

    const flightStream = workUnitAsyncStorage.run(
      requestStore,
      renderToWebFlightStream,
      ctx.componentMod,
      rscPayload,
      clientModules,
      {
        onError,
        temporaryReferences: options?.temporaryReferences,
        filterStackFrame,
        debugChannel: debugChannel?.serverSide,
        signal: requestAbortSignal,
      }
    )

    return new FlightRenderResult(
      flightStream,
      { fetchMetrics: workStore.fetchMetrics },
      options?.waitUntil
    )
  }
}

/**
 * Production-only staged dynamic flight render for cache components (Node.js
 * streams). Uses staged rendering to separate static (RDC-backed) from
 * runtime/dynamic content.
 */
async function generateStagedDynamicFlightRenderResultNode(
  req: BaseNextRequest,
  ctx: AppRenderContext,
  requestStore: RequestStore
): Promise<RenderResult> {
  const { componentMod, workStore, renderOpts } = ctx
  const { routeModule } = componentMod
  const { loaderTree } = routeModule.userland
  const { onInstrumentationRequestError, experimental } = renderOpts

  function onFlightDataRenderError(err: DigestedError, silenceLog: boolean) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createRequestErrorContext(ctx, 'react-server-components-payload'),
      silenceLog
    )
  }

  const onError = createReactServerErrorHandler(
    false,
    false,
    workStore.reactServerErrorsByDigest,
    onFlightDataRenderError
  )

  const selectStaleTime = createSelectStaleTime(experimental)
  const staleTimeIterable = new StaleTimeIterable()

  const stageController = new StagedRenderingController({
    abortSignal: null,
    abandonController: null,
    // TODO(cached-navs): this assumes that we checked during build that there's no sync IO.
    // but it can happen e.g. after a revalidation or conditionally for a param that wasn't prerendered.
    // we should change this to track sync IO, log an error and advance to dynamic.
    syncIO: SyncIOMode.Untracked,
    finalStage: null,
  })

  // Initialize stale time tracking on the request store.
  requestStore.stale = INFINITE_CACHE
  requestStore.stagedRendering = stageController
  requestStore.varyParamsAccumulator = createResponseVaryParamsAccumulator()
  requestStore.asyncApiPromises = createAsyncApiPromises(
    stageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  trackStaleTime(
    requestStore as { stale: number },
    staleTimeIterable,
    selectStaleTime
  )

  const shellByteLengthDeferred = createPromiseWithResolvers<number | null>()
  const staticStageByteLengthDeferred = createPromiseWithResolvers<number>()

  let runtimePrefetchStream: ReadableStream<Uint8Array> | undefined

  // Check if this route should runtime-cache its navigation. This happens when
  // Partial Prefetching is enabled for the route, either per segment (a
  // `prefetch` of 'partial') or globally (the
  // `partialPrefetching` config). If so, we piggyback on the dynamic render to
  // fill caches and then spawn a final runtime prerender whose result stream
  // is embedded in the RSC payload. This is gated because it adds extra server
  // processing and increases the response payload size.
  if (
    Boolean(renderOpts.partialPrefetching) ||
    (await anySegmentHasPartialPrefetchingEnabled(loaderTree))
  ) {
    // Create a mutable cache that gets filled during the dynamic render.
    const prerenderResumeDataCache = createPrerenderResumeDataCache()
    requestStore.resumeDataCache = prerenderResumeDataCache

    const cacheSignal = new CacheSignal()
    trackPendingModules(cacheSignal)
    requestStore.cacheSignal = cacheSignal

    // Create a deferred stream for the runtime prefetch result. Its readable
    // side goes into the RSC payload (Flight serializes it lazily). The
    // writable side receives the runtime prerender result once the dynamic
    // render has filled all caches.
    const runtimePrefetchTransform = new TransformStream<Uint8Array>()
    runtimePrefetchStream = runtimePrefetchTransform.readable

    // Wait for the dynamic render to fill caches, then run the final runtime
    // prerender (fire-and-forget — does not block the response).
    void cacheSignal
      .cacheReady()
      .then(() =>
        spawnRuntimePrefetchWithFilledCaches(
          runtimePrefetchTransform.writable,
          ctx,
          prerenderResumeDataCache,
          requestStore,
          onError
        )
      )
  }

  const rscPayload = await workUnitAsyncStorage.run(
    requestStore,
    generateDynamicRSCPayload,
    ctx,
    {
      staleTimeIterable,
      staticStageByteLengthPromise: staticStageByteLengthDeferred.promise,
      shellByteLengthPromise: shellByteLengthDeferred.promise,
      runtimePrefetchStream,
    }
  )

  const { clientModules } = getClientReferenceManifest()

  const flightStream = await runInSequentialTasks(
    () => {
      stageController.advanceStage(RenderStage.ShellStatic)

      const sourceStream = workUnitAsyncStorage.run(
        requestStore,
        renderToNodeFlightStream,
        ctx.componentMod,
        rscPayload,
        clientModules,
        { onError, filterStackFrame }
      ) as Readable

      const replayable = new ReplayableNodeStream(sourceStream)
      const dynamicStream = replayable.createReplayStream()
      const staticStream = replayable.createReplayStream()

      void countShellAndStaticStageBytes(staticStream, stageController).then(
        (byteLengths) => {
          staticStageByteLengthDeferred.resolve(byteLengths[RenderStage.Static])
          shellByteLengthDeferred.resolve(byteLengths[RenderStage.ShellStatic])
        }
      )

      return dynamicStream
    },
    () => {
      stageController.advanceStage(RenderStage.Static)
    },
    () => {
      // This is a separate task that doesn't advance a stage. It forces
      // draining the immediate queue so that the stale time iterable and vary
      // params accumulators are flushed before we advance to the dynamic stage.
      staleTimeIterable.close()
      if (requestStore.varyParamsAccumulator) {
        finishAccumulatingVaryParams(requestStore.varyParamsAccumulator)
      }
    },
    () => {
      stageController.advanceStage(RenderStage.Dynamic)
    }
  )

  return new FlightRenderResult(flightStream, {
    fetchMetrics: workStore.fetchMetrics,
  })
}

/**
 * Runs a final runtime prerender using the provided (already filled) cache and
 * pipes its output into the provided writable stream. The caller is responsible
 * for waiting until caches are warm before calling this function.
 */
async function spawnRuntimePrefetchWithFilledCaches(
  writable: WritableStream<Uint8Array>,
  ctx: AppRenderContext,
  prerenderResumeDataCache: PrerenderResumeDataCache,
  requestStore: RequestStore,
  onError: (err: unknown) => string | undefined
): Promise<void> {
  try {
    const { componentMod, getDynamicParamFromSegment } = ctx
    const { loaderTree } = componentMod.routeModule.userland

    const rootParams = getRootParams(loaderTree, getDynamicParamFromSegment)
    const staleTimeIterable = new StaleTimeIterable()

    // We want to be able to rewind the result to a session shell.
    const mode: RuntimePrerenderMode = {
      type: 'rewindable-session-shell',
      shellUsedSessionDataDeferred: createPromiseWithResolvers(),
      shellByteLengthDeferred: createPromiseWithResolvers(),
    }

    const { result } = await finalRuntimeServerPrerender(
      mode,
      ctx,
      generateDynamicRSCPayload.bind(null, ctx, {
        staleTimeIterable,
        shellByteLengthPromise:
          mode.type === 'rewindable-session-shell'
            ? mode.shellByteLengthDeferred.promise
            : undefined,
        shellUsedSessionDataPromise: mode.shellUsedSessionDataDeferred.promise,
      }),
      prerenderResumeDataCache,
      rootParams,
      requestStore.headers,
      requestStore.cookies,
      requestStore.draftMode,
      onError,
      staleTimeIterable,
      // This path is only reached on the production Cache Components + Cached
      // Navigations renders (the staged Flight response and the HTML hydration
      // payload), which set up no React debug channel.
      undefined
    )

    await result.prelude.pipeTo(writable)
  } catch {
    // Runtime prerender failed. Close the stream gracefully — the navigation
    // still works, we just won't get cached runtime data.
    try {
      await writable.close()
    } catch {
      // Writable may already be closed/errored.
    }
  }
}

type RenderToReadableStreamServerOptions = NonNullable<
  Parameters<
    (typeof import('react-server-dom-webpack/server.node'))['renderToReadableStream']
  >[2]
>

async function stagedRenderWithoutCachesInDevNode(
  ctx: AppRenderContext,
  requestStore: RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  options: Omit<RenderToReadableStreamServerOptions, 'environmentName'>
) {
  // We're rendering while bypassing caches,
  // so we have no hope of showing a useful runtime stage.
  // But we still want things like `params` to show up in devtools correctly,
  // which relies on mechanisms we've set up for staged rendering,
  // so we do a 2-task version (Static -> Dynamic) instead.

  // We aren't filling caches so we don't need to abort this render, it'll
  // stream in a single pass
  const stageController = new StagedRenderingController({
    abortSignal: null,
    abandonController: null,
    syncIO: SyncIOMode.Untracked, // do not track sync IO (we don't have reliable stages)
    finalStage: null,
  })

  const environmentName = () => {
    const currentStage = stageController.currentStage
    return getEnvironmentNameForStageWithoutCaches(currentStage)
  }

  requestStore.stagedRendering = stageController
  requestStore.asyncApiPromises = createAsyncApiPromises(
    stageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  const { clientModules } = getClientReferenceManifest()
  const rscPayload = await getPayload(requestStore)

  return await runInSequentialTasks(
    () => {
      stageController.advanceStage(RenderStage.ShellStatic)

      return workUnitAsyncStorage.run(
        requestStore,
        renderToNodeFlightStream,
        ctx.componentMod,
        rscPayload,
        clientModules,
        {
          ...options,
          environmentName,
        }
      )
    },
    () => {
      stageController.advanceStage(RenderStage.Static)
    },
    () => {
      stageController.advanceStage(RenderStage.Dynamic)
    }
  )
}

function getEnvironmentNameForStageWithoutCaches(stage: RenderStage) {
  switch (stage) {
    case RenderStage.Before:
    case RenderStage.ShellStatic:
    case RenderStage.Static:
      return 'Prerender'
    case RenderStage.ShellRuntime:
    case RenderStage.Runtime:
    case RenderStage.Dynamic:
    case RenderStage.Abandoned:
      return 'Server'
    default:
      stage satisfies never
      throw new InvariantError(`Invalid render stage: ${stage}`)
  }
}

/**
 * Fork of `generateDynamicFlightRenderResult` that renders using `renderWithRestartOnCacheMissInDev`
 * to ensure correct separation of environments Prerender/Server (for use in Cache Components)
 */
async function generateDynamicFlightRenderResultWithStagesInDev(
  req: BaseNextRequest,
  ctx: AppRenderContext,
  initialRequestStore: RequestStore,
  createRequestStore: (() => RequestStore) | undefined,
  fallbackParams: OpaqueFallbackRouteParams | null
): Promise<RenderResult> {
  const {
    htmlRequestId,
    renderOpts,
    requestId,
    workStore,
    componentMod: {
      createElement,
      routeModule: {
        userland: { loaderTree },
      },
    },
    url,
  } = ctx

  const {
    onInstrumentationRequestError,
    setReactDebugChannel,
    setCacheStatus,
    isBuildTimePrerendering = false,
  } = renderOpts

  let didErrorObservably = false
  function onFlightDataRenderError(err: DigestedError, silenceLog: boolean) {
    didErrorObservably = true
    return onInstrumentationRequestError?.(
      err,
      req,
      createRequestErrorContext(ctx, 'react-server-components-payload'),
      silenceLog
    )
  }

  const onError = createReactServerErrorHandler(
    process.env.NODE_ENV === 'development',
    isBuildTimePrerendering,
    workStore.reactServerErrorsByDigest,
    onFlightDataRenderError
  )

  // We validate RSC requests for HMR refreshes and client navigations when
  // instant configs exist, since we render all the layouts necessary to perform
  // the validation in those cases.
  const shouldValidate =
    !ctx.isPrefetch &&
    !isBypassingCachesInDev(initialRequestStore, workStore) &&
    (initialRequestStore.isHmrRefresh === true ||
      (await anySegmentNeedsInstantValidationInDev(loaderTree)))

  const getPayload = async (requestStore: RequestStore) => {
    const payload: RSCPayload &
      RSCPayloadDevProperties &
      RSCInitialPayloadPartialDev = await workUnitAsyncStorage.run(
      requestStore,
      generateDynamicRSCPayload,
      ctx,
      undefined
    )

    if (isBypassingCachesInDev(requestStore, workStore)) {
      // Mark the RSC payload to indicate that caches were bypassed in dev.
      // This lets the client know not to cache anything based on this render.
      payload._bypassCachesInDev = createElement(WarnForBypassCachesInDev, {
        route: workStore.route,
      })
    } else if (shouldValidate) {
      // If this payload will be used for validation, it needs to contain the
      // canonical URL. Without it we'd get an error.
      payload.c = prepareInitialCanonicalUrl(url)
    }

    return payload
  }

  let debugChannel: DebugChannelPair | undefined
  let stream: AnyStream

  if (
    // We only do this flow if we can safely recreate the store from scratch
    // (which is not the case for renders after an action)
    createRequestStore &&
    // We only do this flow if we're not bypassing caches in dev using
    // "disable cache" in devtools, a hard refresh (cache-control: "no-cache"),
    // or draft mode.
    !isBypassingCachesInDev(initialRequestStore, workStore)
  ) {
    // Before we kick off the render, we set the cache status back to it's initial state
    // in case a previous render bypassed the cache.
    if (setCacheStatus) {
      setCacheStatus('ready', htmlRequestId)
    }

    const prefetchMode = await getPrefetchingModeForPage(renderOpts, loaderTree)

    // A client navigation into a Partial Prefetching route extends the shell
    // through the runtime-prefetchable content: it has already settled on the
    // client (via the prefetch) by the time it navigates, so it belongs in this
    // response's shell. Everything else uses the static shell, like an initial
    // load: plain navigations, and HMR refreshes (a fresh render of the current
    // page, with no settled prefetch to draw on). Dynamic content always
    // streams in after the shell.
    let prefetchStage: StreamRevealStage

    if (initialRequestStore.isHmrRefresh === true) {
      prefetchStage = RenderStage.Static
    } else {
      if (prefetchMode === PrefetchingMode.Partial) {
        // TODO(app-shells): if this navigation came from <Link prefetch={true} />,
        // we should show the shell for a speculative prefetch
        // (which can have more data than the app shell)
        prefetchStage = RenderStage.ShellRuntime
      } else {
        prefetchStage = RenderStage.Static
      }
    }

    // With Server Components HMR cancellation enabled, a superseded HMR refresh
    // aborts its own client fetch (see the client-side supersession logic),
    // which closes this response. We use that response-close as the signal to
    // stop the server work this refresh started that's now discarded: the
    // streaming render below is aborted, and the detached validation is skipped
    // (including aborting the background renders it uses to prepare its
    // inputs). The render's in-flight `'use cache'` fills are left running,
    // since they aren't tied to its controller. A superseding refresh can't
    // reuse those fills today, because each edit changes the HMR hash baked
    // into the cache key; that becomes useful only once those keys use
    // implementation-derived hashes instead (see `use-cache-wrapper.ts`).
    //
    // The detached validation is Cache Components only: it runs only on this
    // staged dev render, so there's nothing to skip on the non-Cache Components
    // dev RSC path. That path (`generateDynamicFlightRenderResult`) aborts its
    // superseded render the same way; it just has no validation to skip.
    //
    // TODO: The gate is `isHmrRefresh` for now because that's the only case we
    // cancel today. The response-close signal itself is general, so this could
    // later be relaxed to also cover a browser stop or a devtools "cancel
    // render" button.
    const requestAbortSignal =
      renderOpts.experimental.serverComponentsHmrCancellation === true &&
      initialRequestStore.isHmrRefresh === true &&
      isNodeNextResponse(ctx.res)
        ? signalFromNodeResponse(ctx.res.originalResponse)
        : undefined

    const result = await stagedRenderWithCachesInDev({
      prefetchMode,
      ctx,
      requestStore: initialRequestStore,
      createRequestStore,
      getPayload,
      onError,
      shouldValidate,
      fallbackRouteParams: fallbackParams,
      getDevRenderDidError: () => didErrorObservably,
      navigationKind: {
        type: 'prefetched-client',
        prefetchStage,
      },
      requestAbortSignal,
    })
    stream = result.stream
    debugChannel = result.debugChannel
  } else {
    // We're either bypassing caches or we can't restart the render.
    // Do a dynamic render, but with (basic) environment labels.

    // Set cache status to bypass when specifically bypassing caches in dev
    if (setCacheStatus) {
      setCacheStatus('bypass', htmlRequestId)
    }

    debugChannel = setReactDebugChannel && createNodeDebugChannel()

    stream = await stagedRenderWithoutCachesInDevNode(
      ctx,
      initialRequestStore,
      getPayload,
      {
        onError: onError,
        filterStackFrame,
        debugChannel: debugChannel?.serverSide,
      }
    )
  }

  if (debugChannel && setReactDebugChannel) {
    setReactDebugChannel(debugChannel.clientSide, htmlRequestId, requestId)
  }

  return new FlightRenderResult(stream, {
    fetchMetrics: workStore.fetchMetrics,
  })
}

async function generateRuntimePrefetchResult(
  req: BaseNextRequest,
  ctx: AppRenderContext,
  requestStore: RequestStore,
  isShellPrefetch: boolean
): Promise<RenderResult> {
  const { workStore, renderOpts, htmlRequestId, requestId } = ctx
  const {
    isBuildTimePrerendering = false,
    onInstrumentationRequestError,
    setReactDebugChannel,
  } = renderOpts

  function onFlightDataRenderError(err: DigestedError, silenceLog: boolean) {
    return onInstrumentationRequestError?.(
      err,
      req,
      // TODO(runtime-ppr): should we use a different value?
      createRequestErrorContext(ctx, 'react-server-components-payload'),
      silenceLog
    )
  }

  const onError = createReactServerErrorHandler(
    false,
    isBuildTimePrerendering,
    workStore.reactServerErrorsByDigest,
    onFlightDataRenderError
  )

  const metadata: AppPageRenderResultMetadata = {}
  const staleTimeIterable = new StaleTimeIterable()

  const {
    componentMod: {
      routeModule: {
        userland: { loaderTree },
      },
    },
    getDynamicParamFromSegment,
  } = ctx
  const rootParams = getRootParams(loaderTree, getDynamicParamFromSegment)

  // We need to share caches between the prospective prerender and the final prerender,
  // but we're not going to persist this anywhere.
  const prerenderResumeDataCache = createPrerenderResumeDataCache()

  await prospectiveRuntimeServerPrerender(
    ctx,
    isShellPrefetch,
    generateDynamicRSCPayload.bind(null, ctx),
    prerenderResumeDataCache,
    rootParams,
    requestStore.headers,
    requestStore.cookies,
    requestStore.draftMode
  )

  const mode: RuntimePrerenderMode = isShellPrefetch
    ? {
        type: 'session-shell-only',
        shellUsedSessionDataDeferred: createPromiseWithResolvers(),
      }
    : {
        type: 'rewindable-session-shell',
        shellUsedSessionDataDeferred: createPromiseWithResolvers(),
        shellByteLengthDeferred: createPromiseWithResolvers(),
      }

  const debugChannel = setReactDebugChannel
    ? createWebDebugChannel()
    : undefined
  if (debugChannel && setReactDebugChannel) {
    setReactDebugChannel(debugChannel.clientSide, htmlRequestId, requestId)
  }

  const response = await finalRuntimeServerPrerender(
    mode,
    ctx,
    generateDynamicRSCPayload.bind(null, ctx, {
      staleTimeIterable,
      shellByteLengthPromise:
        mode.type === 'rewindable-session-shell'
          ? mode.shellByteLengthDeferred.promise
          : undefined,
      shellUsedSessionDataPromise: mode.shellUsedSessionDataDeferred.promise,
    }),
    prerenderResumeDataCache,
    rootParams,
    requestStore.headers,
    requestStore.cookies,
    requestStore.draftMode,
    onError,
    staleTimeIterable,
    debugChannel?.serverSide
  )

  applyMetadataFromPrerenderResult(response, metadata, workStore)
  metadata.fetchMetrics = ctx.workStore.fetchMetrics

  return new FlightRenderResult(response.result.prelude, metadata)
}

async function prospectiveRuntimeServerPrerender(
  ctx: AppRenderContext,
  isShellPrefetch: boolean,
  getPayload: () => Promise<RSCPayload>,
  resumeDataCache: PrerenderResumeDataCache | null,
  rootParams: Params,
  headers: PrerenderStoreModernRuntime['headers'],
  cookies: PrerenderStoreModernRuntime['cookies'],
  draftMode: PrerenderStoreModernRuntime['draftMode']
) {
  const { implicitTags, renderOpts, workStore } = ctx
  const { ComponentMod } = renderOpts

  // Prerender controller represents the lifetime of the prerender.
  // It will be aborted when a Task is complete or a synchronously aborting
  // API is called. Notably during cache-filling renders this does not actually
  // terminate the render itself which will continue until all caches are filled
  const initialServerPrerenderController = new AbortController()

  // This controller represents the lifetime of the React render call. Notably
  // during the cache-filling render it is different from the prerender controller
  // because we don't want to end the react render until all caches are filled.
  const initialServerRenderController = new AbortController()

  // The cacheSignal helps us track whether caches are still filling or we are ready
  // to cut the render off.
  const cacheSignal = new CacheSignal()

  const initialServerPrerenderStore: PrerenderStoreModernRuntime = {
    type: 'prerender-runtime',
    phase: 'render',
    rootParams,
    implicitTags,
    renderSignal: initialServerRenderController.signal,
    controller: initialServerPrerenderController,
    // During the initial prerender we need to track all cache reads to ensure
    // we render long enough to fill every cache it is possible to visit during
    // the final prerender.
    cacheSignal,
    // We only need to track dynamic accesses during the final prerender.
    dynamicTracking: null,
    // Runtime prefetches are never cached server-side, only client-side,
    // so we set `expire` and `revalidate` to their minimum values just in case.
    revalidate: 1,
    expire: 0,
    stale: INFINITE_CACHE,
    tags: [...implicitTags.tags],
    resumeDataCache,
    hmrRefreshHash: undefined,
    // We don't track vary params during initial prerender, only the final one
    varyParamsAccumulator: null,
    // No stage sequencing needed for prospective renders.
    stagedRendering: null,
    isSessionShell: isShellPrefetch,
    // These are not present in regular prerenders, but allowed in a runtime
    // prerender.
    // Any cache keyed on headers() or cookies() needs to be invalidated.
    // Otherwise some Next.js API semantics leak across render passes.
    headers: HeadersAdapter.fresh(headers),
    cookies: RequestCookiesAdapter.fresh(cookies),
    draftMode,
  }

  const { clientModules } = getClientReferenceManifest()

  // We're not going to use the result of this render because the only time it could be used
  // is if it completes in a microtask and that's likely very rare for any non-trivial app
  const initialServerPayload = await workUnitAsyncStorage.run(
    initialServerPrerenderStore,
    getPayload
  )

  const prerenderOptions = {
    filterStackFrame,
    onError: (err: unknown) => {
      const digest = getDigestForWellKnownError(err)

      if (digest) {
        return digest
      }

      if (initialServerPrerenderController.signal.aborted) {
        // The render aborted before this error was handled which indicates
        // the error is caused by unfinished components within the render
        return
      } else if (
        process.env.NEXT_DEBUG_BUILD ||
        process.env.__NEXT_VERBOSE_LOGGING
      ) {
        printDebugThrownValueForProspectiveRender(
          err,
          workStore.route,
          Phase.ProspectiveRender
        )
      }
    },
    // We don't want to stop rendering until the cacheSignal is complete so we pass
    // a different signal to this render call than is used by dynamic APIs to signify
    // transitioning out of the prerender environment
    signal: initialServerRenderController.signal,
  }

  const pendingInitialServerResult = workUnitAsyncStorage.run(
    initialServerPrerenderStore,
    getServerPrerender(ComponentMod),
    initialServerPayload,
    clientModules,
    prerenderOptions
  )

  // Wait for all caches to be finished filling and for async imports to resolve
  trackPendingModules(cacheSignal)
  await cacheSignal.cacheReady()

  initialServerRenderController.abort()
  initialServerPrerenderController.abort()

  // We don't need to continue the prerender process if we already
  // detected invalid dynamic usage in the initial prerender phase.
  if (workStore.invalidDynamicUsageError) {
    throw workStore.invalidDynamicUsageError
  }

  try {
    return await createReactServerPrerenderResult(pendingInitialServerResult)
  } catch (err) {
    if (
      initialServerRenderController.signal.aborted ||
      initialServerPrerenderController.signal.aborted
    ) {
      // These are expected errors that might error the prerender. we ignore them.
    } else if (
      process.env.NEXT_DEBUG_BUILD ||
      process.env.__NEXT_VERBOSE_LOGGING
    ) {
      // We don't normally log these errors because we are going to retry anyway but
      // it can be useful for debugging Next.js itself to get visibility here when needed
      printDebugThrownValueForProspectiveRender(
        err,
        workStore.route,
        Phase.ProspectiveRender
      )
    }
    return null
  }
}

/**
 * Prepends a single ASCII byte to the chunks indicating whether the response
 * is partial (contains dynamic holes): '~' (0x7e) for partial, '#' (0x23)
 * for complete.
 */
function prependIsPartialByteToChunks(
  chunks: Uint8Array[],
  isPartial: boolean
) {
  const markerByte = isPartial ? 0x7e : 0x23
  return [new Uint8Array([markerByte]), ...chunks]
}

type RuntimePrerenderMode =
  | {
      type: 'session-shell-only'
      shellUsedSessionDataDeferred: PromiseWithResolvers<boolean>
    }
  | {
      type: 'rewindable-session-shell'
      shellUsedSessionDataDeferred: PromiseWithResolvers<boolean>
      shellByteLengthDeferred: PromiseWithResolvers<number | null>
    }

async function finalRuntimeServerPrerender(
  mode: RuntimePrerenderMode,
  ctx: AppRenderContext,
  getPayload: () => Promise<RSCPayload>,
  resumeDataCache: PrerenderResumeDataCache | null,
  rootParams: Params,
  headers: PrerenderStoreModernRuntime['headers'],
  cookies: PrerenderStoreModernRuntime['cookies'],
  draftMode: PrerenderStoreModernRuntime['draftMode'],
  onError: (err: unknown) => string | undefined,
  staleTimeIterable: StaleTimeIterable,
  debugChannel: RenderToReadableStreamServerOptions['debugChannel']
) {
  const { implicitTags, renderOpts } = ctx
  const { ComponentMod, experimental, isDebugDynamicAccesses } = renderOpts
  const selectStaleTime = createSelectStaleTime(experimental)

  let resultIsPartial = false
  const finalServerController = new AbortController()

  const serverDynamicTracking = createDynamicTrackingState(
    isDebugDynamicAccesses
  )

  const finalStageController = new StagedRenderingController({
    abortSignal: finalServerController.signal,
    abandonController: null,
    // In dynamic renders, we allow Sync IO in the Runtime stage
    // if partialPrefetching is not enabled. However, a runtime prerender
    // (or App Shell) is stricter and never allows sync IO in any stage
    // that we go through here (i.e. < Dynamic)
    syncIO: SyncIOMode.AllowedInDynamic,
    // we only reach the runtime stage if we're doing a rewindable render
    finalStage:
      mode.type === 'session-shell-only'
        ? RenderStage.ShellRuntime
        : RenderStage.Runtime,
  })

  const varyParamsAccumulator = createResponseVaryParamsAccumulator()

  const finalServerPrerenderStore: PrerenderStoreModernRuntime = {
    type: 'prerender-runtime',
    phase: 'render',
    rootParams,
    implicitTags,
    renderSignal: finalServerController.signal,
    controller: finalServerController,
    // All caches we could read must already be filled so no tracking is necessary
    cacheSignal: null,
    dynamicTracking: serverDynamicTracking,
    // Runtime prefetches are never cached server-side, only client-side,
    // so we set `expire` and `revalidate` to their minimum values just in case.
    revalidate: 1,
    expire: 0,
    stale: INFINITE_CACHE,
    tags: [...implicitTags.tags],
    resumeDataCache,
    hmrRefreshHash: undefined,
    varyParamsAccumulator,
    stagedRendering: finalStageController,
    isSessionShell: mode.type === 'session-shell-only',
    // These are not present in regular prerenders, but allowed in a runtime
    // prerender.
    headers: HeadersAdapter.fresh(headers),
    cookies: RequestCookiesAdapter.fresh(cookies),
    draftMode,
  }

  trackStaleTime(finalServerPrerenderStore, staleTimeIterable, selectStaleTime)

  const { clientModules } = getClientReferenceManifest()

  const finalRSCPayload = await workUnitAsyncStorage.run(
    finalServerPrerenderStore,
    getPayload
  )

  const streamState = createStreamPendingState()
  const collectedChunks = createPrerenderChunksAccumulator()
  const stageByteLengths = createStageByteLengths()
  const collectChunk = (chunk: Uint8Array) => {
    collectPrerenderChunk(collectedChunks, finalServerController.signal, chunk)
    increaseChunkByteLengths(
      stageByteLengths,
      finalStageController.currentStage,
      chunk.byteLength
    )
  }

  let didHandleUnexpectedAbort = false
  /**
   * @returns - whether or not the task should be skipped
   * because the render was already aborted.
   * */
  const checkUnexpectedAbort = (): boolean => {
    if (finalServerController.signal.aborted) {
      // If the server controller is already aborted, then we must have encountered sync IO
      if (!didHandleUnexpectedAbort) {
        didHandleUnexpectedAbort = true
        onUnexpectedAbort()
      }
      return true
    }

    // Not aborted.
    return false
  }

  const onUnexpectedAbort = () => {
    resultIsPartial = true

    // FIXME(NAR-810): If we're already aborted due to Sync IO, there should be no need to
    // finish the accumulators. However, it seems like in `--debug-prerender`
    // the stream will stay open if we don't close the iterable here.
    if (process.env.NODE_ENV === 'development') {
      if (staleTimeIterable !== undefined) {
        staleTimeIterable.close()
      }
      finishAccumulatingVaryParams(varyParamsAccumulator)
    }
  }

  await runInSequentialTasks(
    async () => {
      finalStageController.advanceStage(RenderStage.ShellStatic)

      let stream = workUnitAsyncStorage.run(
        finalServerPrerenderStore,
        ComponentMod.renderToReadableStream,
        finalRSCPayload,
        clientModules,
        {
          filterStackFrame,
          onError,
          signal: finalServerController.signal,
          debugChannel,
        }
      )

      // Note: this await will only resolve after the last task (unless sync IO aborts the render earlier)
      // We await it here so that if the stream errors, it's not an unhandled rejection.
      await iterateStreamingPrerenderChunks(
        stream,
        finalServerController.signal,
        collectChunk,
        streamState
      )
    },
    () => {
      if (checkUnexpectedAbort()) return
      finalStageController.advanceStage(RenderStage.Static)
    },
    () => {
      if (checkUnexpectedAbort()) return
      finalStageController.advanceStage(RenderStage.ShellRuntime)
    },
    () => {
      if (checkUnexpectedAbort()) return

      if (mode.type === 'session-shell-only') {
        // We're only rendering a shell, so we do not advance to stages where link data is resolved.
        return
      }
      finalStageController.advanceStage(RenderStage.Runtime)
    },
    () => {
      if (checkUnexpectedAbort()) return

      // Finish the accumulators. We need to wait for Flight to flush the result into the stream,
      // which is scheduled in a (fast) immediate, so we do this in a separate task
      // (fast immediates will be drained at the end of the task, so in the next task we know we're done flushing)

      // Check if session data unblocked new content in the shell.
      const didSessionDataUnblockNewContent =
        stageByteLengths[RenderStage.ShellRuntime] >
        stageByteLengths[RenderStage.Static]
      mode.shellUsedSessionDataDeferred.resolve(didSessionDataUnblockNewContent)

      if (mode.type === 'rewindable-session-shell') {
        // If advancing to the runtime stage didn't unblock new content,
        // then the result does not depend on link data and can be used as a shell (indicated via `null`).
        // Otherwise, send a byte length to indicate where the shell content ends.
        const didLinkDataUnblockNewContent =
          stageByteLengths[RenderStage.Runtime] >
          stageByteLengths[RenderStage.ShellRuntime]
        mode.shellByteLengthDeferred.resolve(
          didLinkDataUnblockNewContent
            ? stageByteLengths[RenderStage.ShellRuntime]
            : null
        )
      }

      staleTimeIterable.close()
      finishAccumulatingVaryParams(varyParamsAccumulator)
    },
    () => {
      if (checkUnexpectedAbort()) return

      if (streamState.isPending) {
        // If the prerender is still pending then it must depend on dynamic data
        // (or, if this is a shell prefetch, link data)
        resultIsPartial = true
      }

      workUnitAsyncStorage.run(
        finalServerPrerenderStore,
        finalServerController.abort.bind(finalServerController)
      )
    }
  )

  const result = {
    prelude: new ReactServerPrerenderResult(
      prependIsPartialByteToChunks(
        collectedChunks.prerenderChunks,
        resultIsPartial
      )
    ).consumeAsStream(),
  }

  return {
    result,
    // TODO(runtime-ppr): do we need to produce a digest map here?
    // digestErrorsMap: ...,
    dynamicAccess: serverDynamicTracking,
    isPartial: resultIsPartial,
    collectedRevalidate: finalServerPrerenderStore.revalidate,
    collectedExpire: finalServerPrerenderStore.expire,
    collectedStale: staleTimeIterable.currentValue,
    collectedTags: finalServerPrerenderStore.tags,
  }
}

/**
 * Crawlers will inadvertently think the canonicalUrl in the RSC payload should be crawled
 * when our intention is to just seed the router state with the current URL.
 * This function splits up the pathname so that we can later join it on
 * when we're ready to consume the path.
 */
function prepareInitialCanonicalUrl(url: RequestStore['url']) {
  return (url.pathname + url.search).split('/')
}

function getRenderedSearch(query: NextParsedUrlQuery): string {
  // Inlined implementation of querystring.encode, which is not available in
  // the Edge runtime.
  const pairs = []
  for (const key in query) {
    const value = query[key]
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const v of value) {
        pairs.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`
        )
      }
    } else {
      pairs.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      )
    }
  }

  // The result should match the format of a web URL's `search` property, since
  // this is the format that's stored in the App Router state.
  // TODO: We're a bit inconsistent about this. The x-nextjs-rewritten-query
  // header omits the leading question mark. Should refactor to always do
  // that instead.
  if (pairs.length === 0) {
    // If the search string is empty, return an empty string.
    return ''
  }
  // Prepend '?' to the search params string.
  return '?' + pairs.join('&')
}

// This is the data necessary to render <AppRouter /> when no SSR errors are encountered
async function getRSCPayload(
  tree: LoaderTree,
  ctx: AppRenderContext,
  options: {
    is404: boolean
    isPrerendering: boolean
    staleTimeIterable?: AsyncIterable<number>
    staticStageByteLengthPromise?: Promise<number>
    shellByteLengthPromise?: Promise<number | null>
    runtimePrefetchStream?: ReadableStream<Uint8Array>
  }
): Promise<InitialRSCPayload & { P: ReactNode }> {
  const {
    is404,
    isPrerendering,
    staleTimeIterable,
    staticStageByteLengthPromise,
    shellByteLengthPromise,
    runtimePrefetchStream,
  } = options
  const injectedCSS = new Set<string>()
  const injectedJS = new Set<string>()
  const injectedFontPreloadTags = new Set<string>()
  let missingSlots: Set<string> | undefined

  // We only track missing parallel slots in development
  if (process.env.__NEXT_DEV_SERVER) {
    missingSlots = new Set<string>()
  }

  const {
    query,
    appUsingSizeAdjustment,
    componentMod: { createMetadataComponents, createElement, Fragment },
    url,
  } = ctx

  const hints = ctx.renderOpts.prefetchHints?.[ctx.pagePath] ?? null
  const serveStreamingMetadata = !!ctx.renderOpts.serveStreamingMetadata
  const hasGlobalNotFound = !!tree[2]['global-not-found']

  const { Viewport, Metadata, MetadataOutlet } = createMetadataComponents({
    tree,
    // When it's using global-not-found, metadata errorType is undefined, which will retrieve the
    // metadata from the page.
    // When it's using not-found, metadata errorType is 'not-found', which will retrieve the
    // metadata from the not-found.js boundary.
    // TODO: remove this condition and keep it undefined when global-not-found is stabilized.
    errorType: is404 && !hasGlobalNotFound ? 'not-found' : undefined,
    parsedQuery: query,
    pathname: url.pathname,
    metadataContext: createMetadataContext(ctx.renderOpts),
    interpolatedParams: ctx.interpolatedParams,
    serveStreamingMetadata,
  })

  const preloadCallbacks: PreloadCallbacks = []

  const initialTree = await createFullComponentTree({
    ctx,
    loaderTree: tree,
    parentParams: {},
    parentOptionalCatchAllParamName: null,
    parentRuntimePrefetchable: false,
    injectedCSS,
    injectedJS,
    injectedFontPreloadTags,
    rootLayoutIncluded: false,
    missingSlots,
    preloadCallbacks,
    authInterrupts: ctx.renderOpts.experimental.authInterrupts,
    MetadataOutlet,
    isPrerendering,
    hintTree: hints,
  })

  // When the `vary` response header is present with `Next-URL`, that means there's a chance
  // it could respond differently if there's an interception route. We provide this information
  // to `AppRouter` so that it can properly seed the prefetch cache with a prefix, if needed.
  // In dev, the Vary header may not reliably reflect whether a route can
  // be intercepted, because interception routes are compiled on demand.
  // Default to true so the client doesn't cache a stale Fallback entry.
  const varyHeader = ctx.res.getHeader('vary')
  const couldBeIntercepted =
    !!process.env.__NEXT_DEV_SERVER ||
    (typeof varyHeader === 'string' && varyHeader.includes(NEXT_URL))

  const initialHead = createElement(
    Fragment,
    {
      key: flightDataPathHeadKey,
    },
    createElement(NonIndex, {
      createElement,
      pagePath: ctx.pagePath,
      statusCode: ctx.res.statusCode,
      isPossibleServerAction: ctx.isPossibleServerAction,
    }),
    createElement(Viewport, null),
    createElement(Metadata, null),
    appUsingSizeAdjustment
      ? createElement('meta', {
          name: 'next-size-adjust',
          content: '',
        })
      : null
  )

  const { GlobalError, styles: globalErrorStyles } = await getGlobalErrorStyles(
    tree,
    ctx
  )

  // Assume the head we're rendering contains only partial data if PPR is
  // enabled and this is a statically generated response. This is used by the
  // client Segment Cache after a prefetch to determine if it can skip the
  // second request to fill in the dynamic data.
  //
  // See AppRenderCapabilities.isPossiblyPartialResponse for more context.
  const isPossiblyPartialHead = ctx.renderCapabilities.isPossiblyPartialResponse

  return maybeAppendBuildIdToRSCPayload(ctx, {
    // See the comment above the `Preloads` component (below) for why this is part of the payload
    P: createElement(Preloads, {
      preloadCallbacks: preloadCallbacks,
    }),
    c: prepareInitialCanonicalUrl(url),
    q: getRenderedSearch(query),
    i: !!couldBeIntercepted,
    t: {
      t: initialTree,
      h: {
        r: initialHead,
        p: isPossiblyPartialHead,
        v: getMetadataVaryParamsAccumulator(),
      },
    },
    m: missingSlots,
    G: [GlobalError, globalErrorStyles],
    // Tells the client whether this route supports per-segment prefetching.
    // With Cache Components, all routes support it. Without it, only fully
    // static pages do, because their per-segment prefetch responses are
    // generated during static generation (build or ISR).
    S: ctx.renderCapabilities.supportsPerSegmentPrefetching,
    r: getRootParamsVaryParamsAccumulator() ?? undefined,
    s: staleTimeIterable,
    a: shellByteLengthPromise,
    l: staticStageByteLengthPromise,
    p: runtimePrefetchStream,
    // Include the per-page dynamic stale time from unstable_dynamicStaleTime, but
    // only for dynamic renders. The client treats its presence as
    // authoritative.
    // TODO: Move this to the prefetch hints file so we don't have to walk
    // the tree on every render.
    d: !isPrerendering
      ? ((await getDynamicStaleTime(tree)) ?? undefined)
      : undefined,
  } satisfies InitialRSCPayload & { P: ReactNode })
}

/**
 * Preload calls (such as `ReactDOM.preloadStyle` and `ReactDOM.preloadFont`) need to be called during rendering
 * in order to create the appropriate preload tags in the DOM, otherwise they're a no-op. Since we invoke
 * renderToReadableStream with a function that returns component props rather than a component itself, we use
 * this component to "render  " the preload calls.
 */
function Preloads({ preloadCallbacks }: { preloadCallbacks: Function[] }) {
  preloadCallbacks.forEach((preloadFn) => preloadFn())
  return null
}

// This is the data necessary to render <AppRouter /> when an error state is triggered
async function getErrorRSCPayload(
  tree: LoaderTree,
  ctx: AppRenderContext,
  ssrError: unknown,
  errorType: MetadataErrorType | 'redirect' | undefined,
  shouldRenderMetadataAndViewport: boolean
) {
  const {
    getDynamicParamFromSegment,
    query,
    componentMod: { createMetadataComponents, createElement, Fragment },
    url,
  } = ctx

  let Viewport: ComponentType | null = null
  let Metadata: ComponentType | null = null
  if (shouldRenderMetadataAndViewport) {
    const serveStreamingMetadata = !!ctx.renderOpts.serveStreamingMetadata
    const metadataComponents = createMetadataComponents({
      tree,
      parsedQuery: query,
      pathname: url.pathname,
      metadataContext: createMetadataContext(ctx.renderOpts),
      errorType,
      interpolatedParams: ctx.interpolatedParams,
      serveStreamingMetadata: serveStreamingMetadata,
    })
    Viewport = metadataComponents.Viewport
    Metadata = metadataComponents.Metadata
  }

  const initialHead = createElement(
    Fragment,
    {
      key: flightDataPathHeadKey,
    },
    createElement(NonIndex, {
      createElement,
      pagePath: ctx.pagePath,
      statusCode: ctx.res.statusCode,
      isPossibleServerAction: ctx.isPossibleServerAction,
    }),
    Viewport ? createElement(Viewport, null) : null,
    process.env.__NEXT_DEV_SERVER &&
      createElement('meta', {
        name: 'next-error',
        content: 'not-found',
      }),
    Metadata ? createElement(Metadata, null) : null
  )

  const errorHints = ctx.renderOpts.prefetchHints?.[ctx.pagePath] ?? null
  const errorPrefetchInliningEnabled = Boolean(
    ctx.renderOpts.experimental.prefetchInlining
  )

  let err: Error | undefined = undefined
  if (ssrError) {
    err = isError(ssrError) ? ssrError : new Error(ssrError + '')
  }

  // For metadata notFound error there's no global not found boundary on top
  // so we create a not found page with AppRouter
  const errorShell = createElement(
    'html',
    {
      id: '__next_error__',
    },
    createElement('head', null),
    createElement(
      'body',
      null,
      process.env.__NEXT_DEV_SERVER && err
        ? createElement('template', {
            'data-next-error-message': err.message,
            'data-next-error-digest': 'digest' in err ? err.digest : '',
            'data-next-error-stack': err.stack,
          })
        : null
    )
  )

  const initialTree = await createFullTransportTreeFromLoaderTree(
    tree,
    errorHints,
    errorPrefetchInliningEnabled,
    ctx.missingPrefetchHintPolicy,
    Boolean(ctx.renderOpts.partialPrefetching),
    getDynamicParamFromSegment,
    query
  )
  // Attach the error shell as the root's render output. Vary params are not
  // tracked for error pages.
  initialTree.d = { r: errorShell, p: false, v: null }

  const { GlobalError, styles: globalErrorStyles } = await getGlobalErrorStyles(
    tree,
    ctx
  )

  const isPossiblyPartialHead = ctx.renderCapabilities.isPossiblyPartialResponse

  return maybeAppendBuildIdToRSCPayload(ctx, {
    c: prepareInitialCanonicalUrl(url),
    q: getRenderedSearch(query),
    m: undefined,
    i: false,
    t: {
      t: initialTree,
      h: {
        r: initialHead,
        p: isPossiblyPartialHead,
        v: getMetadataVaryParamsAccumulator(),
      },
    },
    G: [GlobalError, globalErrorStyles],
    // Tells the client whether this route supports per-segment prefetching.
    // With Cache Components, all routes support it. Without it, only fully
    // static pages do, because their per-segment prefetch responses are
    // generated during static generation (build or ISR).
    S: ctx.renderCapabilities.supportsPerSegmentPrefetching,
    r: getRootParamsVaryParamsAccumulator() ?? undefined,
  } satisfies InitialRSCPayload)
}

// This component must run in an SSR context. It will render the RSC root component
function App<T>({
  reactServerStream,
  reactDebugStream,
  debugEndTime,
  preinitScripts,
  ServerInsertedHTMLProvider,
  nonce,
  images,
}: {
  /* eslint-disable @next/internal/no-ambiguous-jsx -- React Client */
  reactServerStream: Readable | BinaryStreamOf<T>
  reactDebugStream: AnyStream | undefined
  debugEndTime: number | undefined
  preinitScripts: () => void
  ServerInsertedHTMLProvider: ComponentType<{
    children: JSX.Element
  }>
  images: RenderOpts['images']
  nonce?: string
}): JSX.Element {
  preinitScripts()
  const response = ReactClient.use(
    getFlightStream<InitialRSCPayload>(
      reactServerStream,
      reactDebugStream,
      debugEndTime,
      nonce
    )
  )

  const initialState = createInitialRouterState({
    // This is not used during hydration, so we don't have to pass a
    // real timestamp.
    navigatedAt: -1,
    initialRSCPayload: response,
    // location is not initialized in the SSR render
    // it's set to window.location during hydration
    location: null,
  })

  const actionQueue = createMutableActionQueue(initialState)

  const { HeadManagerContext } =
    require('../../shared/lib/head-manager-context.shared-runtime') as typeof import('../../shared/lib/head-manager-context.shared-runtime')

  return (
    <HeadManagerContext.Provider
      value={{
        appDir: true,
        nonce,
      }}
    >
      <ImageConfigContext.Provider value={images ?? imageConfigDefault}>
        <ServerInsertedHTMLProvider>
          <AppRouter actionQueue={actionQueue} globalErrorState={response.G} />
        </ServerInsertedHTMLProvider>
      </ImageConfigContext.Provider>
    </HeadManagerContext.Provider>
  )
  /* eslint-enable @next/internal/no-ambiguous-jsx -- React Client */
}

// @TODO our error stream should be probably just use the same root component. But it was previously
// different I don't want to figure out if that is meaningful at this time so just keeping the behavior
// consistent for now.
function ErrorApp<T>({
  reactServerStream,
  preinitScripts,
  ServerInsertedHTMLProvider,
  nonce,
  images,
}: {
  reactServerStream: BinaryStreamOf<T>
  preinitScripts: () => void
  ServerInsertedHTMLProvider: ComponentType<{
    children: JSX.Element
  }>
  nonce?: string
  images: RenderOpts['images']
}): JSX.Element {
  /* eslint-disable @next/internal/no-ambiguous-jsx -- React Client */
  preinitScripts()
  const response = ReactClient.use(
    getFlightStream<InitialRSCPayload>(
      reactServerStream,
      undefined,
      undefined,
      nonce
    )
  )

  const initialState = createInitialRouterState({
    // This is not used during hydration, so we don't have to pass a
    // real timestamp.
    navigatedAt: -1,
    initialRSCPayload: response,
    // location is not initialized in the SSR render
    // it's set to window.location during hydration
    location: null,
  })

  const actionQueue = createMutableActionQueue(initialState)

  return (
    <ImageConfigContext.Provider value={images ?? imageConfigDefault}>
      <ServerInsertedHTMLProvider>
        <AppRouter actionQueue={actionQueue} globalErrorState={response.G} />
      </ServerInsertedHTMLProvider>
    </ImageConfigContext.Provider>
  )
  /* eslint-enable @next/internal/no-ambiguous-jsx -- React Client */
}

// We use a trick with TS Generics to branch streams with a type so we can
// consume the parsed value of a Readable Stream if it was constructed with a
// certain object shape. The generic type is not used directly in the type so it
// requires a disabling of the eslint rule disallowing unused vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type BinaryStreamOf<T> = AnyStream

/**
 * Extracted to a separate function to prevent V8 from retaining the entire
 * `prepareAppPageRender` closure scope through globalThis.__next_require__.
 * V8 shares a single Context object per scope for all closures; by creating
 * these closures in their own function scope, the globalThis references only
 * retain `instrumented` and `cacheComponents`, not request-specific data like
 * req/res/workStore.
 */
function installGlobalModuleLoadingHandlers(
  ComponentMod: AppPageModule,
  cacheComponents: boolean,
  isTracingEnabled: boolean
) {
  const instrumented = wrapClientComponentLoader(ComponentMod, isTracingEnabled)

  // When we are prerendering if there is a cacheSignal for tracking
  // cache reads we track calls to `loadChunk` and `require`. This allows us
  // to treat chunk/module loading with similar semantics as cache reads to avoid
  // module loading from causing a prerender to abort too early.
  const shouldTrackModuleLoading = () => {
    if (!cacheComponents) {
      return false
    }
    if (process.env.__NEXT_DEV_SERVER) {
      return true
    }
    const workUnitStore = workUnitAsyncStorage.getStore()

    if (!workUnitStore) {
      return false
    }

    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-client':
      case 'validation-client':
      case 'prerender-runtime':
      case 'cache':
      case 'private-cache':
        return true
      case 'prerender-legacy':
      case 'request':
      case 'unstable-cache':
      case 'generate-static-params':
        return false
      default:
        workUnitStore satisfies never
    }
  }

  // @ts-expect-error
  globalThis.__next_require__ = (
    ...args: Parameters<typeof instrumented.require>
  ) => {
    const exportsOrPromise = instrumented.require(...args)
    if (shouldTrackModuleLoading()) {
      trackPendingImport(exportsOrPromise)
    }
    return exportsOrPromise
  }

  // @ts-expect-error
  globalThis.__next_chunk_load__ = (
    ...args: Parameters<typeof instrumented.loadChunk>
  ) => {
    const loadingChunk = instrumented.loadChunk(...args)
    if (shouldTrackModuleLoading()) {
      trackPendingChunkLoad(loadingChunk)
    }
    return loadingChunk
  }
}

type PreparedAppPageRender = {
  req: BaseNextRequest
  ctx: AppRenderContext
  metadata: AppPageRenderResultMetadata
  loaderTree: LoaderTree
}

type GenerateRequestId = (req: BaseNextRequest) => string | Promise<string>

const generateRenderRequestId: GenerateRequestId = () => {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return crypto.randomUUID()
  } else {
    return (
      require('next/dist/compiled/nanoid') as typeof import('next/dist/compiled/nanoid')
    ).nanoid()
  }
}

const generatePrerenderRequestId: GenerateRequestId = async (req) => {
  return Buffer.from(
    await crypto.subtle.digest('SHA-1', Buffer.from(req.url))
  ).toString('hex')
}

async function prepareAppPageRender(
  req: BaseNextRequest,
  res: BaseNextResponse,
  url: ReturnType<typeof parseRelativeUrl>,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  workStore: WorkStore,
  parsedRequestHeaders: ParsedRequestHeaders,
  sharedContext: AppSharedContext,
  interpolatedParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  generateRequestId: GenerateRequestId,
  missingPrefetchHintPolicy: MissingPrefetchHintPolicy,
  renderCapabilities: AppRenderCapabilities
) {
  const isNotFoundPath = pagePath === '/404'
  if (isNotFoundPath) {
    res.statusCode = 404
  }

  // A unique request timestamp used by development to ensure that it's
  // consistent and won't change during this request. This is important to
  // avoid that resources can be deduped by React Float if the same resource is
  // rendered or preloaded multiple times: `<link href="a.css?v={Date.now()}"/>`.
  const requestTimestamp = Date.now()

  const {
    ComponentMod,
    nextFontManifest,
    assetPrefix = '',
    enableTainting,
    cacheComponents,
    setIsrStatus,
  } = renderOpts

  // We need to expose the bundled `require` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app__) {
    const isTracingEnabled =
      getTracer().getActiveScopeSpan()?.isRecording() ?? false
    installGlobalModuleLoadingHandlers(
      ComponentMod,
      cacheComponents,
      isTracingEnabled
    )
  }

  if (process.env.__NEXT_DEV_SERVER && setIsrStatus && !cacheComponents) {
    // Reset the ISR status at start of request.
    const { pathname } = new URL(req.url || '/', 'http://n')
    setIsrStatus(
      pathname,
      // Only pages using the Node runtime can use ISR, Edge is always dynamic.
      process.env.NEXT_RUNTIME === 'edge' ? false : undefined
    )
  }

  if (
    // The type check here ensures that `req` is correctly typed, and the
    // environment variable check provides dead code elimination.
    process.env.NEXT_RUNTIME !== 'edge' &&
    isNodeNextRequest(req)
  ) {
    res.onClose(() => {
      // We stop tracking fetch metrics when the response closes, since we
      // report them at that time.
      workStore.shouldTrackFetchMetrics = false
    })

    req.originalRequest.on('end', () => {
      if ('performance' in globalThis) {
        const metrics = getClientComponentLoaderMetrics({ reset: true })
        if (
          metrics &&
          metrics.clientComponentLoadEnd >= metrics.clientComponentLoadStart
        ) {
          getTracer()
            .startSpan(NextNodeServerSpan.clientComponentLoading, {
              startTime: metrics.clientComponentLoadStart,
              attributes: {
                'next.clientComponentLoadCount':
                  metrics.clientComponentLoadCount,
                'next.span_type': NextNodeServerSpan.clientComponentLoading,
              },
            })
            .end(metrics.clientComponentLoadEnd)
        }
      }
    })
  }

  const metadata: AppPageRenderResultMetadata = {
    statusCode: isNotFoundPath ? 404 : undefined,
    hasPendingUi: false,
  }

  const appUsingSizeAdjustment = !!nextFontManifest?.appUsingSizeAdjust

  ComponentMod.patchFetch()

  // Pull out the hooks/references from the component.
  const {
    routeModule: {
      userland: { loaderTree },
    },
    taintObjectReference,
  } = ComponentMod
  if (enableTainting) {
    taintObjectReference(
      'Do not pass process.env to Client Components since it will leak sensitive data',
      process.env
    )
  }

  workStore.fetchMetrics = []
  metadata.fetchMetrics = workStore.fetchMetrics

  // don't modify original query object
  query = { ...query }
  stripInternalQueries(query)

  let requestId: string
  let htmlRequestId: string
  const requestInsightsIdentity = process.env.__NEXT_REQUEST_INSIGHTS
    ? getRequestInsightsIdentity()
    : undefined

  const { flightRouterState, isPrefetchRequest, nonce } = parsedRequestHeaders

  if (parsedRequestHeaders.requestId) {
    // If the client has provided a request ID (in development mode), we use it.
    requestId = parsedRequestHeaders.requestId
  } else if (requestInsightsIdentity) {
    // Request Insights starts recording before the work store exists. Reuse
    // the identity from that outer request scope so all spans stay together.
    requestId = requestInsightsIdentity.requestId
  } else {
    // Otherwise we generate a new request ID.
    requestId = await generateRequestId(req)
  }

  // If the client has provided an HTML request ID, we use it to associate the
  // request with the HTML document from which it originated, which is used to
  // send debug information to the associated WebSocket client. Otherwise, this
  // is the request for the HTML document, so we use the request ID also as the
  // HTML request ID.
  htmlRequestId =
    parsedRequestHeaders.htmlRequestId ||
    requestInsightsIdentity?.htmlRequestId ||
    requestId
  workStore.requestId = requestId
  workStore.htmlRequestId = htmlRequestId

  const getDynamicParamFromSegment = makeGetDynamicParamFromSegment(
    interpolatedParams,
    fallbackRouteParams,
    renderOpts.experimental.optimisticRouting
  )

  const isPossibleActionRequest = getIsPossibleServerAction(req)

  // For implicit tags, we use the resolved pathname which has dynamic params
  // interpolated, is decoded, and has trailing slash removed.
  const resolvedPathname = getRequestMeta(req, 'resolvedPathname')
  if (!resolvedPathname) {
    throw new InvariantError('resolvedPathname must be set in request metadata')
  }

  const implicitTags = await getImplicitTags(
    workStore.page,
    resolvedPathname,
    fallbackRouteParams
  )

  const ctx: AppRenderContext = {
    componentMod: ComponentMod,
    url,
    renderOpts,
    workStore,
    missingPrefetchHintPolicy,
    renderCapabilities,
    parsedRequestHeaders,
    getDynamicParamFromSegment,
    interpolatedParams,
    fallbackRouteParams,
    query,
    isPrefetch: isPrefetchRequest,
    isPossibleServerAction: isPossibleActionRequest,
    requestTimestamp,
    appUsingSizeAdjustment,
    flightRouterState,
    requestId,
    htmlRequestId,
    pagePath,
    assetPrefix,
    isNotFoundPath,
    nonce,
    res,
    sharedContext,
    implicitTags,
  }

  getTracer().setRootSpanAttribute('next.route', pagePath)

  return {
    req,
    ctx,
    metadata,
    loaderTree,
  }
}

async function prerenderAppPage({
  req,
  ctx,
  metadata,
  loaderTree,
}: PreparedAppPageRender) {
  const { res, pagePath, renderOpts, workStore, url, fallbackRouteParams } = ctx

  // We're either building or revalidating. In either case we need to
  // prerender our page rather than render it.
  const prerenderToStreamWithTracing = getTracer().wrap(
    AppRenderSpan.getBodyResult,
    {
      spanName: `prerender route (app) ${pagePath}`,
      attributes: {
        'next.route': pagePath,
      },
    },
    prerenderToStream
  )

  const response = await prerenderToStreamWithTracing(
    req,
    res,
    ctx,
    metadata,
    loaderTree,
    fallbackRouteParams
  )

  // If we're debugging partial prerendering, print all the dynamic API accesses
  // that occurred during the render.
  // @TODO move into renderToStream function
  if (
    response.dynamicAccess &&
    accessedDynamicData(response.dynamicAccess) &&
    renderOpts.isDebugDynamicAccesses
  ) {
    warn('The following dynamic usage was detected:')
    for (const access of formatDynamicAPIAccesses(response.dynamicAccess)) {
      warn(access)
    }
  }

  // If we encountered any unexpected errors during build we fail the
  // prerendering phase and the build.
  if (workStore.invalidDynamicUsageError) {
    logDisallowedDynamicError(workStore, workStore.invalidDynamicUsageError)
    throw new StaticGenBailoutError()
  }
  if (response.digestErrorsMap.size) {
    const buildFailingError = response.digestErrorsMap.values().next().value
    if (buildFailingError) throw buildFailingError
  }
  // Pick first userland SSR error, which is also not a RSC error.
  if (response.ssrErrors.length) {
    const buildFailingError = response.ssrErrors.find((err) =>
      isUserLandError(err)
    )
    if (buildFailingError) throw buildFailingError
  }

  const options: RenderResultOptions = {
    metadata,
    contentType: HTML_CONTENT_TYPE_HEADER,
  }

  // If we have pending revalidates, wait until they are all resolved.
  const maybeRevalidatesPromise = executeRevalidates(workStore)
  if (maybeRevalidatesPromise !== false) {
    const revalidatesPromise = maybeRevalidatesPromise.finally(() => {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.log('pending revalidates promise finished for:', url.href)
      }
    })
    if (renderOpts.waitUntil) {
      renderOpts.waitUntil(revalidatesPromise)
    } else {
      options.waitUntil = revalidatesPromise
    }
  }

  applyMetadataFromPrerenderResult(response, metadata, workStore)

  if (response.renderResumeDataCache) {
    metadata.renderResumeDataCache = response.renderResumeDataCache
  }

  const streamString = await streamToString(response.stream)
  const result = new RenderResult(streamString, options)

  // Run build-time instant validation if the page has instant configs
  // TODO(instant-validation-build): This is not a great place to wire this in.
  if (
    workStore.cacheComponentsEnabled &&
    workStore.isBuildTimePrerendering &&
    renderOpts.runInstantValidation &&
    (await anySegmentNeedsInstantValidationInBuild(loaderTree))
  ) {
    // Throws StaticGenBailoutError if validation failed.
    await validateInstantConfigsInBuild(
      ctx,
      response.renderResumeDataCache ?? null
    )
  }

  return result
}

async function renderAppPage(
  { req, ctx, metadata, loaderTree }: PreparedAppPageRender,
  postponedState: PostponedState | null,
  serverComponentsHmrCache: ServerComponentsHmrCache | undefined
) {
  const {
    res,
    url,
    renderOpts,
    workStore,
    parsedRequestHeaders,
    componentMod: ComponentMod,
    implicitTags,
  } = ctx
  const { cacheComponents, setIsrStatus, serverActions } = renderOpts
  const { cachedNavigations } = renderOpts.experimental
  const {
    isHmrRefresh,
    isRSCRequest,
    isRuntimePrefetchRequest,
    isAppShellPrefetchRequest,
  } = parsedRequestHeaders
  const isPossibleActionRequest = ctx.isPossibleServerAction

  // We're rendering dynamically
  const renderResumeDataCache =
    renderOpts.renderResumeDataCache ??
    postponedState?.renderResumeDataCache ??
    null

  const rootParams = getRootParams(loaderTree, ctx.getDynamicParamFromSegment)
  const fallbackParams = getRequestMeta(req, 'fallbackParams') || null
  const hmrRefreshHash = getRequestMeta(req, 'hmrRefreshHash')

  const createRequestStore = createRequestStoreForRender.bind(
    null,
    req,
    res,
    url,
    rootParams,
    implicitTags,
    renderOpts.onUpdateCookies,
    renderOpts.previewProps,
    isHmrRefresh,
    serverComponentsHmrCache,
    renderResumeDataCache,
    fallbackParams,
    hmrRefreshHash
  )
  const requestStore = createRequestStore()

  if (
    process.env.__NEXT_DEV_SERVER &&
    setIsrStatus &&
    !cacheComponents &&
    // Only pages using the Node runtime can use ISR, so we only need to
    // update the status for those.
    // The type check here ensures that `req` is correctly typed, and the
    // environment variable check provides dead code elimination.
    process.env.NEXT_RUNTIME !== 'edge' &&
    isNodeNextRequest(req)
  ) {
    req.originalRequest.on('end', () => {
      const { pathname } = new URL(req.url || '/', 'http://n')
      const isStatic = !requestStore.usedDynamic && !workStore.forceDynamic
      setIsrStatus(pathname, isStatic)
    })
  }

  // MARK: RSC request
  if (isRSCRequest) {
    if (isRuntimePrefetchRequest) {
      // MARK: RSC runtimePrefetch
      return generateRuntimePrefetchResult(
        req,
        ctx,
        requestStore,
        isAppShellPrefetchRequest
      )
    } else {
      if (
        process.env.__NEXT_DEV_SERVER &&
        process.env.NEXT_RUNTIME !== 'edge' &&
        cacheComponents
      ) {
        // MARK: RSC devCacheComponents
        return generateDynamicFlightRenderResultWithStagesInDev(
          req,
          ctx,
          requestStore,
          createRequestStore,
          fallbackParams
        )
      } else if (cacheComponents && cachedNavigations) {
        // MARK: RSC cacheComponents
        return generateStagedDynamicFlightRenderResultNode(
          req,
          ctx,
          requestStore
        )
      } else {
        // MARK: RSC dynamic
        return generateDynamicFlightRenderResult(req, ctx, requestStore)
      }
    }
  }

  let didExecuteServerAction = false
  let formState: null | any = null
  if (isPossibleActionRequest) {
    // For action requests, we handle them differently with a special render result.
    const actionRequestResult = await handleAction({
      req,
      res,
      ComponentMod,
      generateFlight: generateDynamicFlightRenderResult,
      workStore,
      requestStore,
      serverActions,
      ctx,
      metadata,
    })

    if (actionRequestResult) {
      if (actionRequestResult.type === 'not-found') {
        const notFoundLoaderTree = createNotFoundLoaderTree(loaderTree)
        res.statusCode = 404
        metadata.statusCode = 404
        const stream = await renderToStream(
          requestStore,
          req,
          res,
          ctx,
          notFoundLoaderTree,
          formState,
          postponedState,
          metadata,
          undefined, // Prevent restartable-render behavior in dev + Cache Components mode
          fallbackParams
        )

        return new RenderResult(stream, {
          metadata,
          contentType: HTML_CONTENT_TYPE_HEADER,
        })
      } else if (actionRequestResult.type === 'done') {
        if (actionRequestResult.result) {
          actionRequestResult.result.assignMetadata(metadata)
          return actionRequestResult.result
        } else if (actionRequestResult.formState) {
          formState = actionRequestResult.formState
        }
      }
    }

    didExecuteServerAction = true
  }

  const options: RenderResultOptions = {
    metadata,
    contentType: HTML_CONTENT_TYPE_HEADER,
  }

  const stream = await renderToStream(
    // NOTE: in Cache Components (dev), if the render is restarted, it will use a different requestStore
    // than the one that we're passing in here.
    requestStore,
    req,
    res,
    ctx,
    loaderTree,
    formState,
    postponedState,
    metadata,
    // If we're rendering HTML after an action, we don't want restartable-render behavior
    // because the result should be dynamic, like it is in prod.
    // Also, the request store might have been mutated by the action (e.g. enabling draftMode)
    // and we currently we don't copy changes over when creating a new store,
    // so the restarted render wouldn't be correct.
    didExecuteServerAction ? undefined : createRequestStore,
    fallbackParams
  )

  // Forward an invalid-dynamic-usage error recorded by `'use cache'` only
  // when userland caught it (try/catch around the cache call). If userland
  // didn't catch, the rejection propagated into the React render, and React's
  // `serverComponentsErrorHandler` already stamped a digest on the error and
  // emitted it as a Flight error chunk — surfacing it again here would
  // duplicate the entry in the dev overlay.
  //
  // The cacheComponents paths forward this themselves via
  // `runValidationInDev` and the validation-skipped fallback in
  // `generateDynamicFlightRenderResultWithStagesInDev`. Here we cover the
  // non-cacheComponents dev path where neither runs.
  if (
    process.env.__NEXT_DEV_SERVER &&
    !cacheComponents &&
    workStore.invalidDynamicUsageError &&
    !(workStore.invalidDynamicUsageError as { digest?: unknown }).digest
  ) {
    void logMessagesAndSendErrorsToBrowser(
      [workStore.invalidDynamicUsageError],
      ctx
    )
  }

  // If we have pending revalidates, wait until they are all resolved.
  const maybeRevalidatesPromise = executeRevalidates(workStore)
  if (maybeRevalidatesPromise !== false) {
    const revalidatesPromise = maybeRevalidatesPromise.finally(() => {
      if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
        console.log('pending revalidates promise finished for:', url.href)
      }
    })
    if (renderOpts.waitUntil) {
      renderOpts.waitUntil(revalidatesPromise)
    } else {
      options.waitUntil = revalidatesPromise
    }
  }

  // Create the new render result for the response.
  return new RenderResult(stream, options)
}

async function renderToHTMLOrFlightImpl(
  req: BaseNextRequest,
  res: BaseNextResponse,
  url: ReturnType<typeof parseRelativeUrl>,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  workStore: WorkStore,
  parsedRequestHeaders: ParsedRequestHeaders,
  postponedState: PostponedState | null,
  serverComponentsHmrCache: ServerComponentsHmrCache | undefined,
  sharedContext: AppSharedContext,
  interpolatedParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
) {
  const prepared = await prepareAppPageRender(
    req,
    res,
    url,
    pagePath,
    query,
    renderOpts,
    workStore,
    parsedRequestHeaders,
    sharedContext,
    interpolatedParams,
    fallbackRouteParams,
    generateRenderRequestId,
    getMissingPrefetchHintPolicy(
      renderOpts.isBuildTimePrerendering ?? false,
      false,
      renderOpts.cacheComponents
    ),
    {
      isPossiblyPartialResponse: false,
      supportsPerSegmentPrefetching: renderOpts.cacheComponents,
    }
  )
  return renderAppPage(prepared, postponedState, serverComponentsHmrCache)
}

async function prerenderToHTMLOrFlightImpl(
  req: BaseNextRequest,
  res: BaseNextResponse,
  url: ReturnType<typeof parseRelativeUrl>,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  workStore: WorkStore,
  parsedRequestHeaders: ParsedRequestHeaders,
  sharedContext: AppSharedContext,
  interpolatedParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
) {
  const isRoutePPREnabled = renderOpts.experimental.isRoutePPREnabled === true
  const prepared = await prepareAppPageRender(
    req,
    res,
    url,
    pagePath,
    query,
    renderOpts,
    workStore,
    parsedRequestHeaders,
    sharedContext,
    interpolatedParams,
    fallbackRouteParams,
    generatePrerenderRequestId,
    getMissingPrefetchHintPolicy(
      renderOpts.isBuildTimePrerendering ?? false,
      true,
      renderOpts.cacheComponents
    ),
    {
      isPossiblyPartialResponse: isRoutePPREnabled,
      supportsPerSegmentPrefetching: true,
    }
  )
  return prerenderAppPage(prepared)
}

export type AppPageRender = (
  req: BaseNextRequest,
  res: BaseNextResponse,
  pagePath: string,
  query: NextParsedUrlQuery,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  renderOpts: RenderOpts,
  serverComponentsHmrCache: ServerComponentsHmrCache | undefined,
  sharedContext: AppSharedContext
) => Promise<RenderResult<AppPageRenderResultMetadata>>

type AppPagePreparation = {
  url: ReturnType<typeof parseRelativeUrl>
  parsedRequestHeaders: ParsedRequestHeaders
  interpolatedParams: Params
  postponedState: PostponedState | null
}

function prepareAppPage(
  req: BaseNextRequest,
  pagePath: string,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  renderOpts: RenderOpts
): AppPagePreparation {
  if (!req.url) {
    throw new Error('Invalid URL')
  }

  const url = parseRelativeUrl(req.url, undefined, false)

  // We read these values from the request object as, in certain cases,
  // base-server will strip them to opt into different rendering behavior.
  const parsedRequestHeaders = parseRequestHeaders(req.headers, {
    isRoutePPREnabled: renderOpts.experimental.isRoutePPREnabled === true,
    previewModeId: renderOpts.previewProps?.previewModeId,
  })

  const interpolatedParams = interpolateParallelRouteParams(
    renderOpts.ComponentMod.routeModule.userland.loaderTree,
    renderOpts.params ?? {},
    pagePath,
    fallbackRouteParams
  )

  // If provided, the postpone state should be parsed so it can be provided to
  // React.
  let postponedState: PostponedState | null = null
  if (typeof renderOpts.postponed === 'string') {
    if (fallbackRouteParams) {
      if (!getServerActionRequestMetadata(req).isFetchAction) {
        throw new InvariantError(
          'postponed state should not be provided when fallback params are provided'
        )
      }

      // A fetch action with fallback params cannot render this page, so its
      // React postponed state cannot be resumed. The RDC is still useful while
      // executing cached functions in the action.
      postponedState = {
        type: DynamicState.DATA,
        renderResumeDataCache: parseResumeDataCacheFromPostponedState(
          renderOpts.postponed,
          renderOpts.experimental.maxPostponedStateSizeBytes,
          renderOpts.experimental.disableResumeDataCacheCompression
        ),
      }
    } else {
      postponedState = parsePostponedState(
        renderOpts.postponed,
        interpolatedParams,
        renderOpts.experimental.maxPostponedStateSizeBytes,
        renderOpts.experimental.disableResumeDataCacheCompression
      )
    }
  }

  if (
    postponedState?.renderResumeDataCache &&
    renderOpts.renderResumeDataCache
  ) {
    throw new InvariantError(
      'postponed state and dev warmup immutable resume data cache should not be provided together'
    )
  }

  return {
    url,
    parsedRequestHeaders,
    interpolatedParams,
    postponedState,
  }
}

export const renderToHTMLOrFlight: AppPageRender = (
  req,
  res,
  pagePath,
  query,
  fallbackRouteParams,
  renderOpts,
  serverComponentsHmrCache,
  sharedContext
) => {
  const { url, parsedRequestHeaders, interpolatedParams, postponedState } =
    prepareAppPage(req, pagePath, fallbackRouteParams, renderOpts)
  const { isPrefetchRequest, previouslyRevalidatedTags, nonce } =
    parsedRequestHeaders
  const workStore = createWorkStore({
    page: renderOpts.routeModule.definition.page,
    renderOpts,
    // @TODO move to workUnitStore of type Request
    isPrefetchRequest,
    buildId: sharedContext.buildId,
    deploymentId: sharedContext.deploymentId,
    previouslyRevalidatedTags,
    nonce,
  })

  return workAsyncStorage.run(
    workStore,
    renderToHTMLOrFlightImpl,
    req,
    res,
    url,
    pagePath,
    query,
    renderOpts,
    workStore,
    parsedRequestHeaders,
    postponedState,
    serverComponentsHmrCache,
    sharedContext,
    interpolatedParams,
    fallbackRouteParams
  )
}

export const prerenderToHTMLOrFlight: AppPageRender = (
  req,
  res,
  pagePath,
  query,
  fallbackRouteParams,
  renderOpts,
  _serverComponentsHmrCache,
  sharedContext
) => {
  const { url, parsedRequestHeaders, interpolatedParams } = prepareAppPage(
    req,
    pagePath,
    fallbackRouteParams,
    renderOpts
  )
  const { isPrefetchRequest, previouslyRevalidatedTags, nonce } =
    parsedRequestHeaders
  const workStore = createPrerenderWorkStore({
    page: renderOpts.routeModule.definition.page,
    renderOpts,
    // @TODO move to workUnitStore of type Request
    isPrefetchRequest,
    buildId: sharedContext.buildId,
    deploymentId: sharedContext.deploymentId,
    previouslyRevalidatedTags,
    nonce,
  })

  return workAsyncStorage.run(
    workStore,
    prerenderToHTMLOrFlightImpl,
    req,
    res,
    url,
    pagePath,
    query,
    renderOpts,
    workStore,
    parsedRequestHeaders,
    sharedContext,
    interpolatedParams,
    fallbackRouteParams
  )
}

function applyMetadataFromPrerenderResult(
  response: Pick<
    PrerenderToStreamResult,
    | 'collectedExpire'
    | 'collectedRevalidate'
    | 'collectedStale'
    | 'collectedTags'
  >,
  metadata: AppPageRenderResultMetadata,
  workStore: WorkStore
) {
  if (response.collectedTags) {
    metadata.fetchTags = response.collectedTags.join(',')
  }

  // Let the client router know how long to keep the cached entry around.
  const staleHeader = String(response.collectedStale)
  metadata.headers ??= {}
  metadata.headers[NEXT_ROUTER_STALE_TIME_HEADER] = staleHeader

  // If force static is specifically set to false, we should not revalidate
  // the page.
  if (workStore.forceStatic === false || response.collectedRevalidate === 0) {
    metadata.cacheControl = { revalidate: 0, expire: undefined }
  } else {
    // Copy the cache control value onto the render result metadata.
    metadata.cacheControl = {
      revalidate:
        response.collectedRevalidate >= INFINITE_CACHE
          ? false
          : response.collectedRevalidate,
      expire:
        response.collectedExpire >= INFINITE_CACHE
          ? undefined
          : response.collectedExpire,
    }
  }

  // provide bailout info for debugging
  if (metadata.cacheControl.revalidate === 0) {
    metadata.staticBailoutInfo = {
      description: workStore.dynamicUsageDescription,
      stack: workStore.dynamicUsageStack,
    }
  }
}

type RSCPayloadDevProperties = {
  /** Only available during cacheComponents development builds. Used for logging errors. */
  _validation?: Promise<ReactNode>
  _bypassCachesInDev?: ReactNode
}

type RSCInitialPayloadPartialDev = {
  c?: InitialRSCPayload['c']
}

async function renderToStream(
  requestStore: RequestStore,
  req: BaseNextRequest,
  res: BaseNextResponse,
  ctx: AppRenderContext,
  tree: LoaderTree,
  formState: any,
  postponedState: PostponedState | null,
  metadata: AppPageRenderResultMetadata,
  createRequestStore: (() => RequestStore) | undefined,
  fallbackParams: OpaqueFallbackRouteParams | null
): Promise<AnyStream> {
  /* eslint-disable @next/internal/no-ambiguous-jsx -- React Client */
  // MARK: renderToStream setup
  const {
    assetPrefix,
    htmlRequestId,
    nonce,
    pagePath,
    renderOpts,
    requestId,
    workStore,
  } = ctx

  const {
    basePath,
    buildManifest,
    ComponentMod: { createElement },
    crossOrigin,
    experimental,
    isBuildTimePrerendering = false,
    onInstrumentationRequestError,
    page,
    reactMaxHeadersLength,
    setReactDebugChannel,
    subresourceIntegrityManifest,
    supportsDynamicResponse,
    cacheComponents,
  } = renderOpts

  const { cachedNavigations } = renderOpts.experimental
  const waitForAllReady = supportsDynamicResponse !== true

  const { ServerInsertedHTMLProvider, renderServerInsertedHTML } =
    createServerInsertedHTML()
  const getServerInsertedMetadata = createServerInsertedMetadata(nonce)

  const tracingMetadata = getTracedMetadata(
    getTracer().getTracePropagationData(),
    experimental.clientTraceMetadata
  )

  const polyfills: JSX.IntrinsicElements['script'][] =
    buildManifest.polyfillFiles
      .filter(
        (polyfill) =>
          polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
      )
      .map((polyfill) => ({
        src: `${assetPrefix}/_next/${polyfill}${getAssetQueryString(
          ctx,
          false
        )}`,
        integrity: subresourceIntegrityManifest?.[polyfill],
        crossOrigin,
        noModule: true,
        nonce,
      }))

  const [preinitScripts, bootstrapScript] = getRequiredScripts(
    buildManifest,
    // Why is assetPrefix optional on renderOpts?
    // @TODO make it default empty string on renderOpts and get rid of it from ctx
    assetPrefix,
    crossOrigin,
    subresourceIntegrityManifest,
    getAssetQueryString(ctx, true),
    nonce,
    page
  )

  // In development mode, set the request ID as a global variable, before the
  // bootstrap script is executed, which depends on it during hydration.
  // For MPA navigations (page reload, direct URL entry), the request ID
  // header is not present, so we generate a random one.
  let bootstrapScriptContent: string | undefined
  if (process.env.__NEXT_DEV_SERVER) {
    bootstrapScriptContent = `self.__next_r=${JSON.stringify(
      requestId ?? crypto.randomUUID()
    )}`
  } else if (
    buildManifest.pagesChunkGroupBootstrapParams &&
    buildManifest.chunkLoadingGlobal
  ) {
    bootstrapScriptContent = getTurbopackChunkGroupBootstrap(
      buildManifest.pagesChunkGroupBootstrapParams,
      buildManifest.chunkLoadingGlobal,
      [page]
    )
  }

  // Instant Navigation Testing API: embed the cookie-guarded bootstrap so it
  // runs before the client bootstrap module reads self.__next_instant_test as
  // its hydration source. This mirrors the prerender path so a dynamically
  // rendered document carries the same script as the cached static prelude.
  if (ctx.renderOpts.experimental.exposeTestingApi) {
    bootstrapScriptContent =
      (bootstrapScriptContent ? `${bootstrapScriptContent};` : '') +
      (await getInstantTestBootstrapScriptContent())
  }

  // Create the "render route (app)" span manually so we can keep it open during streaming.
  // This is necessary because errors inside Suspense boundaries are reported asynchronously
  // during stream consumption, after a typical wrapped function would have ended the span.
  // Note: We pass the full span name as the first argument since startSpan uses it directly.
  const renderSpan = getTracer().startSpan(
    `render route (app) ${pagePath}` as any,
    {
      attributes: {
        'next.span_name': `render route (app) ${pagePath}`,
        'next.span_type': AppRenderSpan.getBodyResult,
        'next.route': pagePath,
      },
    }
  )

  // Helper to end the span with error status (used when throwing from catch blocks)
  const endSpanWithError = (err: unknown) => {
    if (!renderSpan.isRecording()) return
    if (err instanceof Error) {
      renderSpan.recordException(err)
      renderSpan.setAttribute('error.type', err.name)
    }
    renderSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : undefined,
    })
    renderSpan.end()
  }

  // Run the rest of the function within the span's context so child spans
  // (like "build component tree", "generateMetadata") are properly parented.
  return getTracer().withSpan(renderSpan, async () => {
    // MARK: renderToStream errorHandlers
    const { reactServerErrorsByDigest } = workStore

    // We use this to determine if we should suppress other derivative errors
    let didErrorObservably = false
    function onHTMLRenderRSCError(err: DigestedError, silenceLog: boolean) {
      didErrorObservably = true
      return onInstrumentationRequestError?.(
        err,
        req,
        createRequestErrorContext(ctx, 'react-server-components'),
        silenceLog
      )
    }
    const serverComponentsErrorHandler = createReactServerErrorHandler(
      process.env.NODE_ENV === 'development',
      isBuildTimePrerendering,
      reactServerErrorsByDigest,
      onHTMLRenderRSCError,
      renderSpan
    )

    function onHTMLRenderSSRError(err: DigestedError) {
      // We don't need to silence logs here. onHTMLRenderSSRError won't be called
      // at all if the error was logged before in the RSC error handler.
      const silenceLog = false
      return onInstrumentationRequestError?.(
        err,
        req,
        createRequestErrorContext(ctx, 'server-rendering'),
        silenceLog
      )
    }

    const allCapturedErrors: Array<unknown> = []
    const htmlRendererErrorHandler = createHTMLErrorHandler(
      process.env.NODE_ENV === 'development',
      isBuildTimePrerendering,
      reactServerErrorsByDigest,
      allCapturedErrors,
      onHTMLRenderSSRError,
      renderSpan
    )

    let reactServerResult: null | ReactServerResult = null
    let reactDebugStream: AnyStream | undefined

    const setHeader = res.setHeader.bind(res)
    const appendHeader = res.appendHeader.bind(res)
    const { clientModules } = getClientReferenceManifest()

    try {
      if (
        process.env.__NEXT_DEV_SERVER &&
        // Edge routes never prerender so we don't have a Prerender environment for anything in edge runtime
        process.env.NEXT_RUNTIME !== 'edge' &&
        // We only have a Prerender environment for projects opted into cacheComponents
        cacheComponents
      ) {
        let debugChannelClientStream: ReplayableNodeStream | undefined

        // eslint-disable-next-line @typescript-eslint/no-shadow
        const getPayload = async (requestStore: RequestStore) => {
          const payload: InitialRSCPayload & RSCPayloadDevProperties =
            await workUnitAsyncStorage.run(
              requestStore,
              getRSCPayload,
              tree,
              ctx,
              { is404: res.statusCode === 404, isPrerendering: false }
            )

          if (isBypassingCachesInDev(requestStore, workStore)) {
            // Mark the RSC payload to indicate that caches were bypassed in dev.
            // This lets the client know not to cache anything based on this render.
            if (renderOpts.setCacheStatus) {
              // we know this is available  when cacheComponents is enabled, but typeguard to be safe
              renderOpts.setCacheStatus('bypass', htmlRequestId)
            }
            payload._bypassCachesInDev = createElement(
              WarnForBypassCachesInDev,
              {
                route: workStore.route,
              }
            )
          }

          return payload
        }

        if (
          // We only do this flow if we can safely recreate the store from scratch
          // (which is not the case for renders after an action)
          createRequestStore &&
          // We only do this flow if we're not bypassing caches in dev using
          // "disable cache" in devtools, a hard refresh (cache-control: "no-cache"),
          // or draft mode.
          !isBypassingCachesInDev(requestStore, workStore)
        ) {
          const loaderTree = ctx.componentMod.routeModule.userland.loaderTree
          const prefetchMode = await getPrefetchingModeForPage(
            renderOpts,
            loaderTree
          )

          const { stream: serverStream, debugChannel: returnedDebugChannel } =
            await stagedRenderWithCachesInDev({
              prefetchMode,
              ctx,
              requestStore,
              createRequestStore,
              getPayload,
              onError: serverComponentsErrorHandler,
              shouldValidate: true,
              fallbackRouteParams: fallbackParams,
              getDevRenderDidError: () => didErrorObservably,
              // An initial HTML load serves the static shell; runtime and
              // dynamic content stream in afterward.
              navigationKind: {
                type: 'initial-load',
              },
              // We currently only abort HMR refresh requests.
              requestAbortSignal: undefined,
            })

          reactServerResult = new ReactServerResult(serverStream)

          if (returnedDebugChannel) {
            debugChannelClientStream = new ReplayableNodeStream(
              returnedDebugChannel.clientSide.readable
            )
          }
        } else {
          logValidationSkipped(ctx)

          // We're either bypassing caches or we can't restart the render.
          // Do a dynamic render, but with (basic) environment labels.

          const debugChannel = setReactDebugChannel && createNodeDebugChannel()

          const serverStream = await stagedRenderWithoutCachesInDevNode(
            ctx,
            requestStore,
            getPayload,
            {
              onError: serverComponentsErrorHandler,
              filterStackFrame,
              debugChannel: debugChannel?.serverSide,
            }
          )
          reactServerResult = new ReactServerResult(serverStream)

          if (debugChannel) {
            debugChannelClientStream = new ReplayableNodeStream(
              debugChannel.clientSide.readable
            )
          }
        }

        if (debugChannelClientStream && setReactDebugChannel) {
          reactDebugStream = debugChannelClientStream.createReplayStream()

          setReactDebugChannel(
            { readable: debugChannelClientStream.createReplayStream() },
            htmlRequestId,
            requestId
          )
        }
      } else if (cacheComponents && cachedNavigations) {
        // Production Cache Components + Cached Navigations: use staged
        // rendering so the RSC payload includes the static stage byte length
        // (`l` field), enabling the client to cache the static subset during
        // hydration.

        const selectStaleTime = createSelectStaleTime(experimental)
        const staleTimeIterable = new StaleTimeIterable()

        const stageController = new StagedRenderingController({
          abortSignal: null,
          abandonController: null,
          // TODO(cached-navs): this assumes that we checked during build that there's no sync IO.
          // but it can happen e.g. after a revalidation or conditionally for a param that wasn't prerendered.
          // we should change this to track sync IO, log an error and advance to dynamic.
          syncIO: SyncIOMode.Untracked,
          finalStage: null,
        })

        requestStore.stale = INFINITE_CACHE
        requestStore.stagedRendering = stageController
        requestStore.asyncApiPromises = createAsyncApiPromises(
          stageController,
          requestStore.cookies,
          requestStore.mutableCookies,
          requestStore.headers
        )
        requestStore.varyParamsAccumulator =
          createResponseVaryParamsAccumulator()

        trackStaleTime(
          requestStore as { stale: number },
          staleTimeIterable,
          selectStaleTime
        )

        const shellByteLengthDeferred = createPromiseWithResolvers<
          number | null
        >()
        const staticStageByteLengthDeferred =
          createPromiseWithResolvers<number>()

        let runtimePrefetchStream: ReadableStream<Uint8Array> | undefined

        // If the route should runtime-cache its navigation, spawn a runtime
        // prerender after the resume render fills caches. The result is
        // embedded in the initial RSC payload so the client can cache
        // runtime-prefetchable content during hydration. This is enabled when
        // Partial Prefetching is on for the route, either per segment (a
        // `prefetch` of 'partial') or globally (the
        // `partialPrefetching` config).
        if (
          Boolean(renderOpts.partialPrefetching) ||
          (await anySegmentHasPartialPrefetchingEnabled(tree))
        ) {
          const prerenderResumeDataCache = createPrerenderResumeDataCache()
          requestStore.resumeDataCache = prerenderResumeDataCache

          const cacheSignal = new CacheSignal()
          trackPendingModules(cacheSignal)
          requestStore.cacheSignal = cacheSignal

          const runtimePrefetchTransform = new TransformStream<Uint8Array>()
          runtimePrefetchStream = runtimePrefetchTransform.readable

          void cacheSignal
            .cacheReady()
            .then(() =>
              spawnRuntimePrefetchWithFilledCaches(
                runtimePrefetchTransform.writable,
                ctx,
                prerenderResumeDataCache,
                requestStore,
                serverComponentsErrorHandler
              )
            )
        }

        const RSCPayload = await workUnitAsyncStorage.run(
          requestStore,
          getRSCPayload,
          tree,
          ctx,
          {
            is404: res.statusCode === 404,
            isPrerendering: false,
            staleTimeIterable,
            shellByteLengthPromise: shellByteLengthDeferred.promise,
            staticStageByteLengthPromise: staticStageByteLengthDeferred.promise,
            runtimePrefetchStream,
          }
        )

        const flightStream = await runInSequentialTasks(
          () => {
            stageController.advanceStage(RenderStage.ShellStatic)

            const stream = workUnitAsyncStorage.run(
              requestStore,
              renderToNodeFlightStream,
              ctx.componentMod,
              RSCPayload,
              clientModules,
              {
                onError: serverComponentsErrorHandler,
                filterStackFrame,
              }
            ) as Readable

            const replayable = new ReplayableNodeStream(stream)
            const dynamicStream = replayable.createReplayStream()
            const staticStream = replayable.createReplayStream()

            void countShellAndStaticStageBytes(
              staticStream,
              stageController
            ).then((byteLengths) => {
              staticStageByteLengthDeferred.resolve(
                byteLengths[RenderStage.Static]
              )
              shellByteLengthDeferred.resolve(
                byteLengths[RenderStage.ShellStatic]
              )
            })

            return dynamicStream
          },
          () => {
            stageController.advanceStage(RenderStage.Static)
          },
          () => {
            // This is a separate task that doesn't advance a stage. It forces
            // draining the immediate queue so that the stale time iterable and vary
            // params accumulators are flushed before we advance to the dynamic stage.
            staleTimeIterable.close()
            if (requestStore.varyParamsAccumulator) {
              finishAccumulatingVaryParams(requestStore.varyParamsAccumulator)
            }
          },
          () => {
            stageController.advanceStage(RenderStage.Dynamic)
          }
        )

        reactServerResult = new ReactServerResult(flightStream)
      } else {
        // MARK: nodeStreams RSC
        if (process.env.__NEXT_USE_NODE_STREAMS) {
          // This is a dynamic render. We don't do dynamic tracking because we're not prerendering
          const RSCPayload: RSCPayload & RSCPayloadDevProperties =
            await workUnitAsyncStorage.run(
              requestStore,
              getRSCPayload,
              tree,
              ctx,
              { is404: res.statusCode === 404, isPrerendering: false }
            )

          const debugChannel = setReactDebugChannel && createNodeDebugChannel()

          if (debugChannel) {
            const [readableSsr, readableBrowser] = teeStream(
              debugChannel.clientSide.readable
            )

            reactDebugStream = readableSsr

            setReactDebugChannel(
              { readable: readableBrowser },
              htmlRequestId,
              requestId
            )
          }

          reactServerResult = new ReactServerResult(
            workUnitAsyncStorage.run(
              requestStore,
              renderToNodeFlightStream,
              ctx.componentMod,
              RSCPayload,
              clientModules,
              {
                filterStackFrame,
                onError: serverComponentsErrorHandler,
                debugChannel: debugChannel?.serverSide,
              }
            )
          )
        } else {
          // MARK: webStreams RSC
          // This is a dynamic render. We don't do dynamic tracking because we're not prerendering
          const RSCPayload: RSCPayload & RSCPayloadDevProperties =
            await workUnitAsyncStorage.run(
              requestStore,
              getRSCPayload,
              tree,
              ctx,
              { is404: res.statusCode === 404, isPrerendering: false }
            )

          const debugChannel = setReactDebugChannel && createWebDebugChannel()

          if (debugChannel) {
            const [readableSsr, readableBrowser] = teeStream(
              debugChannel.clientSide.readable
            )

            reactDebugStream = readableSsr

            setReactDebugChannel(
              { readable: readableBrowser },
              htmlRequestId,
              requestId
            )
          }

          reactServerResult = new ReactServerResult(
            workUnitAsyncStorage.run(
              requestStore,
              renderToWebFlightStream,
              ctx.componentMod,
              RSCPayload,
              clientModules,
              {
                filterStackFrame,
                onError: serverComponentsErrorHandler,
                debugChannel: debugChannel?.serverSide,
              }
            )
          )
        }
      }

      // React doesn't start rendering synchronously but we want the RSC render to have a chance to start
      // before we begin SSR rendering because we want to capture any available preload headers so we tick
      // one task before continuing
      await waitAtLeastOneReactRenderTask()

      // MARK: nodeStreams HTML
      if (process.env.__NEXT_USE_NODE_STREAMS) {
        // If provided, the postpone state should be parsed as JSON so it can be
        // provided to React.
        if (typeof renderOpts.postponed === 'string') {
          if (postponedState?.type === DynamicState.DATA) {
            // We have a complete HTML Document in the prerender but we need to
            // still include the new server component render because it was not included
            // in the static prelude.
            const inlinedDataStream = createNodeInlinedDataStream(
              reactServerResult.tee(),
              nonce,
              formState
            )

            // End the span since there's no async rendering in this path
            if (renderSpan.isRecording()) renderSpan.end()
            return chainStreams(
              inlinedDataStream,
              createDocumentClosingStream()
            )
          } else if (postponedState) {
            // We assume we have dynamic HTML requiring a resume render to complete
            const { postponed, preludeState } =
              getPostponedFromState(postponedState)

            const resumeAppElement = (
              <App
                reactServerStream={reactServerResult.tee()}
                reactDebugStream={reactDebugStream}
                debugEndTime={undefined}
                preinitScripts={preinitScripts}
                ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
                nonce={nonce}
                images={ctx.renderOpts.images}
              />
            )

            const getServerInsertedHTML = makeGetServerInsertedHTML({
              polyfills,
              renderServerInsertedHTML,
              serverCapturedErrors: allCapturedErrors,
              basePath,
              tracingMetadata: tracingMetadata,
            })

            const { stream: htmlStream, allReady } =
              await workUnitAsyncStorage.run(
                requestStore,
                resumeToFizzStream,
                resumeAppElement,
                postponed,
                { onError: htmlRendererErrorHandler, nonce }
              )

            // End the render span only after React completed rendering (including anything inside Suspense boundaries)
            allReady.finally(() => {
              if (renderSpan.isRecording()) renderSpan.end()
            })

            return await continueDynamicHTMLResumeNode(htmlStream, {
              delayDataUntilFirstHtmlChunk:
                preludeState === DynamicHTMLPreludeState.Empty,
              inlinedDataStream: createNodeInlinedDataStream(
                reactServerResult.consume(),
                nonce,
                formState
              ),
              getServerInsertedHTML,
              getServerInsertedMetadata,
              deploymentId: ctx.sharedContext.deploymentId,
            })
          }
        }

        // This is a regular dynamic render
        const getServerInsertedHTML = makeGetServerInsertedHTML({
          polyfills,
          renderServerInsertedHTML,
          serverCapturedErrors: allCapturedErrors,
          basePath,
          tracingMetadata: tracingMetadata,
        })

        const appElement = (
          <App
            reactServerStream={reactServerResult.tee()}
            // TODO: Pass Node.js debugStream
            reactDebugStream={reactDebugStream}
            debugEndTime={undefined}
            preinitScripts={preinitScripts}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />
        )

        const fizzOptions = {
          onError: htmlRendererErrorHandler,
          nonce,
          onHeaders: (headers: { [header: string]: string }) => {
            for (const key in headers) {
              appendHeader(key, headers[key])
            }
          },
          maxHeadersLength: reactMaxHeadersLength,
          bootstrapScriptContent,
          bootstrapScripts: [bootstrapScript],
          formState,
        }

        const { stream: htmlStream, allReady } = await getTracer().trace(
          AppRenderSpan.renderToNodeFizzStream,
          () =>
            workUnitAsyncStorage.run(
              requestStore,
              renderToNodeFizzStream,
              appElement,
              fizzOptions,
              { waitForAllReady }
            )
        )

        // End the render span only after React completed rendering (including anything inside Suspense boundaries)
        allReady.finally(() => {
          if (renderSpan.isRecording()) renderSpan.end()
        })

        return await continueFizzStream(htmlStream, {
          inlinedDataStream: createNodeInlinedDataStream(
            reactServerResult.consume(),
            nonce,
            formState
          ),
          waitForAllReady,
          allReady,
          deploymentId: ctx.sharedContext.deploymentId,
          getServerInsertedHTML,
          getServerInsertedMetadata,
          validateRootLayout: !!process.env.__NEXT_DEV_SERVER,
        })
      } else {
        // MARK: webStreams HTML
        // If provided, the postpone state should be parsed as JSON so it can be
        // provided to React.
        if (typeof renderOpts.postponed === 'string') {
          if (postponedState?.type === DynamicState.DATA) {
            // We have a complete HTML Document in the prerender but we need to
            // still include the new server component render because it was not included
            // in the static prelude.
            const inlinedDataStream = createWebInlinedDataStream(
              reactServerResult.tee(),
              nonce,
              formState
            )

            // End the span since there's no async rendering in this path
            if (renderSpan.isRecording()) renderSpan.end()
            return chainStreams(
              inlinedDataStream,
              createDocumentClosingStream()
            )
          } else if (postponedState) {
            // We assume we have dynamic HTML requiring a resume render to complete
            const { postponed, preludeState } =
              getPostponedFromState(postponedState)

            const resumeAppElement = (
              <App
                reactServerStream={reactServerResult.tee()}
                reactDebugStream={reactDebugStream}
                debugEndTime={undefined}
                preinitScripts={preinitScripts}
                ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
                nonce={nonce}
                images={ctx.renderOpts.images}
              />
            )

            const getServerInsertedHTML = makeGetServerInsertedHTML({
              polyfills,
              renderServerInsertedHTML,
              serverCapturedErrors: allCapturedErrors,
              basePath,
              tracingMetadata: tracingMetadata,
            })

            const { stream: htmlStream, allReady } =
              await workUnitAsyncStorage.run(
                requestStore,
                resumeToFizzStream,
                resumeAppElement,
                postponed,
                { onError: htmlRendererErrorHandler, nonce }
              )

            // End the render span only after React completed rendering (including anything inside Suspense boundaries)
            allReady.finally(() => {
              if (renderSpan.isRecording()) renderSpan.end()
            })

            return await continueDynamicHTMLResumeWeb(htmlStream, {
              delayDataUntilFirstHtmlChunk:
                preludeState === DynamicHTMLPreludeState.Empty,
              inlinedDataStream: createWebInlinedDataStream(
                reactServerResult.consume(),
                nonce,
                formState
              ),
              getServerInsertedHTML,
              getServerInsertedMetadata,
              deploymentId: ctx.sharedContext.deploymentId,
            })
          }
        }

        // This is a regular dynamic render
        const getServerInsertedHTML = makeGetServerInsertedHTML({
          polyfills,
          renderServerInsertedHTML,
          serverCapturedErrors: allCapturedErrors,
          basePath,
          tracingMetadata: tracingMetadata,
        })

        const appElement = (
          <App
            reactServerStream={reactServerResult.tee()}
            reactDebugStream={reactDebugStream}
            debugEndTime={undefined}
            preinitScripts={preinitScripts}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />
        )

        const fizzOptions = {
          onError: htmlRendererErrorHandler,
          nonce,
          onHeaders: (headers: Headers) => {
            headers.forEach((value, key) => {
              appendHeader(key, value)
            })
          },
          maxHeadersLength: reactMaxHeadersLength,
          bootstrapScriptContent,
          bootstrapScripts: [bootstrapScript],
          formState,
        }

        const { stream: htmlStream, allReady } = await workUnitAsyncStorage.run(
          requestStore,
          renderToWebFizzStream,
          appElement,
          fizzOptions
        )

        // End the render span only after React completed rendering (including anything inside Suspense boundaries)
        allReady.finally(() => {
          if (renderSpan.isRecording()) renderSpan.end()
        })

        return await continueFizzStream(htmlStream, {
          inlinedDataStream: createWebInlinedDataStream(
            reactServerResult.consume(),
            nonce,
            formState
          ),
          waitForAllReady,
          allReady,
          deploymentId: ctx.sharedContext.deploymentId,
          getServerInsertedHTML,
          getServerInsertedMetadata,
          validateRootLayout: !!process.env.__NEXT_DEV_SERVER,
        })
      }
      // MARK: renderToStream errorRecovery
    } catch (err) {
      if (
        isStaticGenBailoutError(err) ||
        (typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof err.message === 'string' &&
          err.message.includes(
            'https://nextjs.org/docs/advanced-features/static-html-export'
          ))
      ) {
        // Ensure that "next dev" prints the red error overlay
        endSpanWithError(err)
        throw err
      }

      // If a bailout made it to this point, it means it wasn't wrapped inside
      // a suspense boundary.
      const shouldBailoutToCSR = isBailoutToCSRError(err)
      if (shouldBailoutToCSR) {
        const stack = getStackWithoutErrorMessage(err)
        error(
          `${err.reason} should be wrapped in a suspense boundary at page "${pagePath}". Read more: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout\n${stack}`
        )

        endSpanWithError(err)
        throw err
      }

      // MARK: errorRecovery classification
      let errorType: MetadataErrorType | 'redirect' | undefined

      if (isHTTPAccessFallbackError(err)) {
        res.statusCode = getAccessFallbackHTTPStatus(err)
        metadata.statusCode = res.statusCode
        errorType = getAccessFallbackErrorTypeByStatus(res.statusCode)
      } else if (isRedirectError(err)) {
        errorType = 'redirect'
        res.statusCode = getRedirectStatusCodeFromError(err)
        metadata.statusCode = res.statusCode

        const redirectUrl = addPathPrefix(
          getURLFromRedirectError(err),
          basePath
        )

        // If there were mutable cookies set, we need to set them on the
        // response.
        const headers = new Headers()
        if (appendMutableCookies(headers, requestStore.mutableCookies)) {
          setHeader('set-cookie', Array.from(headers.values()))
        }

        setHeader('location', redirectUrl)
      } else if (!shouldBailoutToCSR) {
        res.statusCode = 500
        metadata.statusCode = res.statusCode
      }

      const [errorPreinitScripts, errorBootstrapScript] = getRequiredScripts(
        buildManifest,
        assetPrefix,
        crossOrigin,
        subresourceIntegrityManifest,
        getAssetQueryString(ctx, false),
        nonce,
        UNDERSCORE_NOT_FOUND_ROUTE_ENTRY
      )

      let errorBootstrapScriptContent: string | undefined
      if (process.env.__NEXT_DEV_SERVER) {
        errorBootstrapScriptContent = bootstrapScriptContent
      } else if (
        buildManifest.pagesChunkGroupBootstrapParams &&
        buildManifest.chunkLoadingGlobal
      ) {
        errorBootstrapScriptContent = getTurbopackChunkGroupBootstrap(
          buildManifest.pagesChunkGroupBootstrapParams,
          buildManifest.chunkLoadingGlobal,
          [UNDERSCORE_NOT_FOUND_ROUTE_ENTRY]
        )
      }

      if (process.env.__NEXT_USE_NODE_STREAMS) {
        // MARK: nodeStreams errorRecovery RSC + HTML
        let errorRSCPayload: InitialRSCPayload
        let errorServerStream: import('./stream-ops').AnyStream

        try {
          errorRSCPayload = await workUnitAsyncStorage.run(
            requestStore,
            getErrorRSCPayload,
            tree,
            ctx,
            reactServerErrorsByDigest.has((err as any).digest) ? null : err,
            errorType,
            // Normal error rendering should include the error payload head.
            true
          )

          errorServerStream = workUnitAsyncStorage.run(
            requestStore,
            renderToNodeFlightStream,
            ctx.componentMod,
            errorRSCPayload,
            clientModules,
            {
              filterStackFrame,
              onError: serverComponentsErrorHandler,
            }
          )

          if (reactServerResult === null) {
            endSpanWithError(err)
            throw err
          }
        } catch (setupErr) {
          endSpanWithError(setupErr)
          throw setupErr
        }

        try {
          const { stream: errorHtmlStream, allReady: errorAllReady } =
            await workUnitAsyncStorage.run(
              requestStore,
              renderToNodeFizzStream,
              <ErrorApp
                reactServerStream={errorServerStream}
                ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
                preinitScripts={errorPreinitScripts}
                nonce={nonce}
                images={ctx.renderOpts.images}
              />,
              {
                nonce,
                bootstrapScriptContent: errorBootstrapScriptContent,
                bootstrapScripts: [errorBootstrapScript],
                formState,
              },
              { waitForAllReady }
            )

          errorAllReady.finally(() => {
            if (renderSpan.isRecording()) renderSpan.end()
          })

          return await continueFizzStream(errorHtmlStream, {
            inlinedDataStream: createNodeInlinedDataStream(
              // This is intentionally using the readable datastream from the
              // main render rather than the flight data from the error page
              // render
              reactServerResult.consume(),
              nonce,
              formState
            ),
            waitForAllReady,
            deploymentId: ctx.sharedContext.deploymentId,
            getServerInsertedHTML: makeGetServerInsertedHTML({
              polyfills,
              renderServerInsertedHTML,
              serverCapturedErrors: [],
              basePath,
              tracingMetadata: tracingMetadata,
            }),
            getServerInsertedMetadata,
            validateRootLayout: !!process.env.__NEXT_DEV_SERVER,
          })
        } catch (finalErr: any) {
          if (
            process.env.__NEXT_DEV_SERVER &&
            isHTTPAccessFallbackError(finalErr)
          ) {
            const { bailOnRootNotFound } =
              require('../../client/components/dev-root-http-access-fallback-boundary') as typeof import('../../client/components/dev-root-http-access-fallback-boundary')
            bailOnRootNotFound()
          }
          endSpanWithError(finalErr)
          throw finalErr
        }
      } else {
        // MARK: webStreams errorRecovery RSC + HTML
        let errorRSCPayload: InitialRSCPayload
        let errorServerStream: import('./stream-ops').AnyStream

        try {
          errorRSCPayload = await workUnitAsyncStorage.run(
            requestStore,
            getErrorRSCPayload,
            tree,
            ctx,
            reactServerErrorsByDigest.has((err as any).digest) ? null : err,
            errorType,
            // Normal error rendering should include the error payload head.
            true
          )

          errorServerStream = workUnitAsyncStorage.run(
            requestStore,
            renderToWebFlightStream,
            ctx.componentMod,
            errorRSCPayload,
            clientModules,
            {
              filterStackFrame,
              onError: serverComponentsErrorHandler,
            }
          )

          if (reactServerResult === null) {
            endSpanWithError(err)
            throw err
          }
        } catch (setupErr) {
          endSpanWithError(setupErr)
          throw setupErr
        }

        try {
          const { stream: errorHtmlStream, allReady: errorAllReady } =
            await workUnitAsyncStorage.run(
              requestStore,
              renderToWebFizzStream,
              <ErrorApp
                reactServerStream={errorServerStream}
                ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
                preinitScripts={errorPreinitScripts}
                nonce={nonce}
                images={ctx.renderOpts.images}
              />,
              {
                nonce,
                bootstrapScriptContent: errorBootstrapScriptContent,
                bootstrapScripts: [errorBootstrapScript],
                formState,
              }
            )

          errorAllReady.finally(() => {
            if (renderSpan.isRecording()) renderSpan.end()
          })

          return await continueFizzStream(errorHtmlStream, {
            inlinedDataStream: createWebInlinedDataStream(
              // This is intentionally using the readable datastream from the
              // main render rather than the flight data from the error page
              // render
              reactServerResult.consume(),
              nonce,
              formState
            ),
            waitForAllReady,
            deploymentId: ctx.sharedContext.deploymentId,
            getServerInsertedHTML: makeGetServerInsertedHTML({
              polyfills,
              renderServerInsertedHTML,
              serverCapturedErrors: [],
              basePath,
              tracingMetadata: tracingMetadata,
            }),
            getServerInsertedMetadata,
            validateRootLayout: !!process.env.__NEXT_DEV_SERVER,
          })
        } catch (finalErr: any) {
          if (
            process.env.__NEXT_DEV_SERVER &&
            isHTTPAccessFallbackError(finalErr)
          ) {
            const { bailOnRootNotFound } =
              require('../../client/components/dev-root-http-access-fallback-boundary') as typeof import('../../client/components/dev-root-http-access-fallback-boundary')
            bailOnRootNotFound()
          }
          endSpanWithError(finalErr)
          throw finalErr
        }
      }
    }
  })
  /* eslint-enable @next/internal/no-ambiguous-jsx */
}

/**
 * A staged dev render interrupted by sync IO. It has no artifacts that could be
 * used as validation inputs, only the reason it was interrupted.
 */
interface SyncInterruptedStagedDevRender {
  readonly syncInterruptReason: Error
}

/**
 * The chunks and per-stage timings a staged dev render accumulates once its
 * stream finishes. A render only produces them when it runs to the end without
 * a sync-IO interrupt, so they back both a render's uninterrupted outcome and
 * the validation inputs.
 */
interface StagedDevRenderArtifacts {
  readonly accumulatedChunks: AccumulatedStreamChunks
  readonly startTime: number
  readonly stageEndTimes: StageEndTimes
}

/**
 * How a staged dev render ended once its stream has fully finished: with usable
 * artifacts or interrupted by sync IO.
 */
type StagedDevRenderOutcome =
  | StagedDevRenderArtifacts
  | SyncInterruptedStagedDevRender

/**
 * A settled staged dev render: how it ended, plus whether it triggered `use
 * cache` fills that may still be settling. `hadCacheMiss` is orthogonal to the
 * outcome (either kind of render can miss caches) and is consumed before the
 * result is split into validation inputs: it gates the `cacheReady()` wait
 * before the render's work store is inspected, and on an uninterrupted render
 * also marks the output non-prod-representative so it can't be reused for
 * validation.
 */
interface StagedDevRenderResult {
  readonly hadCacheMiss: boolean
  readonly outcome: StagedDevRenderOutcome
}

/**
 * What `runValidationInDev` consumes: an uninterrupted render's artifacts plus
 * the request store and the debug channel. Carries no `syncInterruptReason`:
 * the resolution step has already surfaced and bailed on any sync interrupt.
 */
export interface ResolvedValidationInputs extends StagedDevRenderArtifacts {
  readonly requestStore: RequestStore
  readonly debugChannelClient: AnyStream | undefined
}

/**
 * The inputs produced for validation, before resolution: either an
 * uninterrupted render's artifacts (`ResolvedValidationInputs`) or, for a
 * render interrupted by sync IO, only the interrupt reason. An interrupted
 * render is never validated, so it carries nothing else: its debug channel is
 * dropped at construction. Discriminate with `'syncInterruptReason' in x`; the
 * resolution step surfaces and bails on the interrupted case, so the depth loop
 * only ever sees `ResolvedValidationInputs`.
 */
export type DevValidationInputs =
  | ResolvedValidationInputs
  | SyncInterruptedStagedDevRender

/**
 * Drops a validation debug channel branch we've decided not to read.
 */
function dropValidationDebugChannel(channel: AnyStream | undefined): void {
  if (channel instanceof ReadableStream) {
    channel.cancel()
  } else {
    channel?.destroy()
  }
}

const alreadyForwardedDynamicUsageErrors = new WeakSet<Error>()

/**
 * Forwards an `invalidDynamicUsageError` recorded on the work store (e.g. a
 * request API used inside `'use cache'`) to the dev overlay, so client
 * navigations surface the same error as initial HTML loads do via validation.
 *
 * Returns whether an error was present, so callers can skip further validation.
 * That's independent of whether it was forwarded: an error that already carries
 * a digest is not forwarded again (it was emitted into the React render), but
 * it's still present and already shown, so validation should still be skipped.
 */
function forwardInvalidDynamicUsageError(
  invalidDynamicUsageError: Error | undefined,
  ctx: AppRenderContext
): boolean {
  if (!invalidDynamicUsageError) {
    return false
  }

  // Forward only if userland caught the rejection. If userland didn't catch,
  // the rejection propagated into the React render and React's
  // `serverComponentsErrorHandler` already stamped a digest on the error and
  // emitted it as a Flight error chunk, so surfacing it again here would
  // duplicate the entry in the dev overlay.
  if (
    !(invalidDynamicUsageError as { digest?: unknown }).digest &&
    !alreadyForwardedDynamicUsageErrors.has(invalidDynamicUsageError)
  ) {
    alreadyForwardedDynamicUsageErrors.add(invalidDynamicUsageError)
    void logMessagesAndSendErrorsToBrowser([invalidDynamicUsageError], ctx)
  }

  return true
}

/**
 * Runs Cache Components validation in the background once the response has
 * finished.
 */
function runDevValidationInBackground(
  prefetchMode: PrefetchingMode,
  navigationKind: DevNavigationKind,
  result: StagedDevRenderResult,
  requestStore: RequestStore,
  validationDebugChannel: AnyStream | undefined,
  ctx: AppRenderContext,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  prerenderResumeDataCache: ReturnType<typeof createPrerenderResumeDataCache>,
  getDevRenderDidError: () => boolean,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void,
  validationGeneration: DevValidationGeneration
): void {
  const validationAbortSignal = validationGeneration.signal

  void consoleAsyncStorage
    .run({ dim: true }, async () => {
      // Validation is detached diagnostic work, but the renders and error
      // formatting it performs can still monopolize the event loop. Wait until
      // the response has finished so that work cannot delay Flight delivery or
      // the client navigation.
      if (
        isNodeNextResponse(ctx.res) &&
        !(await waitForResponseToFinish(ctx.res.originalResponse))
      ) {
        logValidationAborted(ctx)
        return
      }

      if (!(await yieldToForegroundRequest(validationAbortSignal))) {
        logValidationAborted(ctx)
        return
      }

      return runInstantInsightsWithTracing(ctx, async (runSpan) => {
        // Read whether the streamed render errored only now that it has fully
        // settled.
        const devRenderDidError = getDevRenderDidError()

        const [instantInputs, staticInputs] = await runSpan(
          AppRenderSpan.instantInsightsPrepareValidation,
          'Prepare validation inputs',
          async () => {
            const lazyInputs = await prepareValidationInputs(
              prefetchMode,
              navigationKind,
              result,
              requestStore,
              validationDebugChannel,
              ctx,
              prerenderResumeDataCache,
              createRequestStore,
              getPayload,
              onError,
              validationAbortSignal
            )

            // If we need to do multiple renders, do them in parallel.
            // `runValidationInDev` currently needs `instantInputs` eagerly
            // right before using `staticInputs` for static shell validation,
            // so there's no point delaying one of the renders.
            // We bail out (after logging an error during
            // `resolveLazyDevValidationInputs`) if sync IO or invalid dynamic
            // errors happen in either.
            return Promise.all([
              lazyInputs.instantInputs
                ? resolveLazyDevValidationInputs(lazyInputs.instantInputs, ctx)
                : null,
              resolveLazyDevValidationInputs(lazyInputs.staticInputs, ctx),
            ])
          }
        )
        if (
          instantInputs === VALIDATION_BAILOUT ||
          staticInputs === VALIDATION_BAILOUT
        ) {
          return
        }

        // A newer render may have superseded this work while we prepared the
        // validation inputs above (which can itself render).
        if (validationAbortSignal.aborted) {
          logValidationAborted(ctx)
          return
        }

        return runSpan(
          AppRenderSpan.instantInsightsRunValidation,
          'Run validation',
          async () => {
            // Hand the whole validation to the worker when one is installed. It
            // runs on a worker thread (off the main thread), emits its own
            // lifecycle markers, logs code frames on its piped stdio, and
            // returns the overlay Flight bytes for the main thread to forward.
            // The worker is absent when `experimental.devValidationWorker` is
            // false, and validation runs in-process instead.
            const devValidationWorker = getDevValidationWorker()

            if (devValidationWorker) {
              const snapshot = await buildDevValidationSnapshot(
                ctx,
                instantInputs,
                staticInputs,
                prefetchMode,
                fallbackRouteParams,
                devRenderDidError
              )

              const chunks = await devValidationWorker(
                snapshot,
                validationAbortSignal
              )

              // A newer navigation may have superseded this validation while
              // the worker ran; don't surface stale insights for a page the user
              // left.
              if (chunks && !validationAbortSignal.aborted) {
                const { sendErrorsToBrowser } = ctx.renderOpts
                if (!sendErrorsToBrowser) {
                  throw new InvariantError(
                    'Expected `sendErrorsToBrowser` to be defined in renderOpts.'
                  )
                }
                sendErrorsToBrowser(
                  createNodeStreamFromChunks(chunks),
                  ctx.htmlRequestId
                )
              }
            } else {
              // In-process path, taken when `experimental.devValidationWorker`
              // is false or no worker is installed (e.g. during a build).
              // Validation computes the errors; the caller delivers them to the
              // dev overlay. `runWithDevValidationLogging` encloses both the
              // render and the delivery in the test-mode lifecycle markers so
              // tests that assert the delivered error between
              // `validation_start` and `validation_end` capture it.
              await runWithDevValidationLogging(
                ctx,
                validationAbortSignal,
                async () => {
                  const validationErrors = await runValidationInDev(
                    prefetchMode,
                    instantInputs,
                    staticInputs,
                    toValidationRenderContext(ctx),
                    fallbackRouteParams,
                    devRenderDidError,
                    validationAbortSignal
                  )

                  if (
                    validationErrors !== undefined &&
                    !validationAbortSignal.aborted
                  ) {
                    await logMessagesAndSendErrorsToBrowser(
                      validationErrors,
                      ctx
                    )
                  }
                }
              )
            }
          }
        )
      })
    })
    // The catch keeps a failed render, or anything thrown inside validation,
    // from surfacing as an unhandled rejection.
    .catch((err) => {
      // Superseded validation is intentionally torn down. Don't log errors
      // caused by its abort signal.
      if (validationAbortSignal.aborted) {
        return
      }
      console.error(
        new InvariantError('An unexpected error occurred during validation', {
          cause: err,
        })
      )
    })
    .finally(() => validationGeneration.finish())
}

type RunInstantInsightsSpan = <T>(
  spanType: AppRenderSpan,
  spanName: string,
  fn: () => Promise<T>
) => Promise<T>

function runInstantInsightsSpan<T>(
  spanType: AppRenderSpan,
  spanName: string,
  fn: () => Promise<T>
): Promise<T> {
  return traceLocalSpan(
    {
      name: spanName,
      attributes: {
        'next.span_category': 'nextjs',
        'next.span_name': spanName,
        'next.span_type': spanType,
      },
    },
    fn
  )
}

function runWithoutInstantInsightsSpan<T>(
  _spanType: AppRenderSpan,
  _spanName: string,
  fn: () => Promise<T>
): Promise<T> {
  return fn()
}

async function runInstantInsightsWithTracing<T>(
  ctx: AppRenderContext,
  fn: (runSpan: RunInstantInsightsSpan) => Promise<T>
): Promise<T> {
  if (!isRequestInsightsEnabled()) {
    return fn(runWithoutInstantInsightsSpan)
  }

  return runWithRequestInsightsIdentity(
    {
      requestId: ctx.requestId,
      kind: 'instant-insights',
      htmlRequestId: ctx.htmlRequestId,
      url: ctx.url.href,
    },
    () =>
      traceLocalSpan(
        {
          name: 'Instant Insights',
          parentSpan: null,
          attributes: {
            'next.span_category': 'nextjs',
            'next.span_name': 'Instant Insights',
            'next.span_type': AppRenderSpan.instantInsights,
            'next.route': ctx.pagePath,
          },
        },
        () => fn(runInstantInsightsSpan)
      )
  )
}

/**
 * The inputs to use for dev validation.
 * If an input needs additional rendering work (because it couldn't be
 * reused from the main render), it'll be an async function that produces
 * the actual input, which lets the consumer consume these lazily and/or
 * control when they are evaluated.
 * */
type PrepareValidationInputsResult = {
  /** `null` if Instant Validation isn't enabled for a route */
  readonly instantInputs: null | DevValidationInputs | LazyDevValidationInputs
  readonly staticInputs: DevValidationInputs | LazyDevValidationInputs
}

/**
 * A lazily evaluated render that will produce validation inputs.
 * If it encounters sync IO or another error, it'll resolve to a sentinel
 * `VALIDATION_BAILOUT` value instead.
 */
type LazyDevValidationInputs = MemoizedThunk<
  Promise<DevValidationInputs | ValidationBailout>
>

const VALIDATION_BAILOUT = Symbol('VALIDATION_BAILOUT')
type ValidationBailout = typeof VALIDATION_BAILOUT

function createLazyDevValidationInputs(
  create: () => Promise<DevValidationInputs | ValidationBailout>
): LazyDevValidationInputs {
  return createMemoizedThunk(create)
}

/** A lazily evaluated value. Only runs once even when called multiple times. */
type MemoizedThunk<T> = (() => T) & { MemoizedOnce: never }

function createMemoizedThunk<T>(cb: () => T): MemoizedThunk<T> {
  let cache: null | { value: T } = null
  const wrapped = (): T => {
    if (cache === null) {
      cache = { value: cb() }
    }
    return cache.value
  }
  return wrapped as MemoizedThunk<T>
}

async function prepareValidationInputs(
  prefetchMode: PrefetchingMode,
  navigationKind: DevNavigationKind,
  result: StagedDevRenderResult,
  requestStore: RequestStore,
  validationDebugChannel: AnyStream | undefined,
  ctx: AppRenderContext,
  prerenderResumeDataCache: ReturnType<typeof createPrerenderResumeDataCache>,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void,
  validationAbortSignal: AbortSignal
): Promise<PrepareValidationInputsResult> {
  // Check if we can re-use the main render for validation.
  let inputsFromNavigation: ResolvedValidationInputs | null
  if (!result.hadCacheMiss && !('syncInterruptReason' in result.outcome)) {
    inputsFromNavigation = {
      accumulatedChunks: result.outcome.accumulatedChunks,
      startTime: result.outcome.startTime,
      stageEndTimes: result.outcome.stageEndTimes,
      requestStore,
      debugChannelClient: validationDebugChannel,
    }
  } else {
    // Cache miss or sync IO. We can't re-use the main render.
    dropValidationDebugChannel(validationDebugChannel)
    inputsFromNavigation = null
  }

  if (prefetchMode === PrefetchingMode.Partial) {
    return prepareValidationInputsInPartialPrefetching(
      navigationKind,
      requestStore,
      ctx,
      prerenderResumeDataCache,
      createRequestStore,
      getPayload,
      onError,
      inputsFromNavigation,
      validationAbortSignal
    )
  } else {
    return prepareValidationInputsInLegacyPrefetching(
      ctx,
      prerenderResumeDataCache,
      createRequestStore,
      getPayload,
      onError,
      inputsFromNavigation,
      validationAbortSignal
    )
  }
}

async function prepareValidationInputsInPartialPrefetching(
  navigationKind: DevNavigationKind,
  requestStore: RequestStore,
  ctx: AppRenderContext,
  prerenderResumeDataCache: ReturnType<typeof createPrerenderResumeDataCache>,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void,
  inputsFromNavigation: ResolvedValidationInputs | null,
  validationAbortSignal: AbortSignal
): Promise<PrepareValidationInputsResult> {
  const loaderTree = ctx.componentMod.routeModule.userland.loaderTree
  const needsInstantValidation =
    await anySegmentNeedsInstantValidationInDev(loaderTree)

  // Certain APIs (static `params`, `unstable_navigation()`, `unstable_prefetch()`) resolve
  // in either static or runtime stages depending on the context (see `needsAppShell`).
  // If one of these APIs is used, the render can't be used for both Instant Validation and
  // Static Shell Validation and we'll need to perform a secondary render.
  // All relevant uses are tracked on the request store.
  const areStagesCompatible = !requestStore.hasIncompatibleShellContent

  const LAZY_FULL_RENDER = createLazyDevValidationInputs(async () => {
    const shouldRenderWithAppShell = true
    const prefetchMode = PrefetchingMode.Partial
    const inputs = await renderWithWarmCachesForValidationInDev(
      ctx,
      createRequestStore,
      getPayload,
      onError,
      prerenderResumeDataCache,
      prefetchMode,
      shouldRenderWithAppShell,
      validationAbortSignal
    )
    if (forwardErrorsFromWarmRender(inputs, ctx)) {
      return VALIDATION_BAILOUT
    }
    return inputs
  })

  const LAZY_RUNTIME_PRERENDER = createLazyDevValidationInputs(async () => {
    const inputs = await prerenderWithWarmCachesForStaticValidationInDev(
      ctx,
      createRequestStore,
      getPayload,
      onError,
      prerenderResumeDataCache,
      validationAbortSignal
    )
    if (forwardErrorsFromWarmRender(inputs, ctx)) {
      return VALIDATION_BAILOUT
    }
    return inputs
  })

  if (inputsFromNavigation) {
    // We can reuse the main render for at least one of the validation passes.
    if (areStagesCompatible) {
      // Stages are compatible across the static shell and the app shell.
      // We reuse the main render for both.
      const instantInputs = needsInstantValidation ? inputsFromNavigation : null
      const staticInputs = inputsFromNavigation
      return { instantInputs, staticInputs }
    }

    // Stages are incompatible across static and instant validation.

    // If this navigation has an accurate app shell, we can use it for instant validation.
    // However, static validation can't use this static stage, so we need to prerender it.
    if (navigationHasAppShell(navigationKind)) {
      const instantInputs = needsInstantValidation ? inputsFromNavigation : null
      const staticInputs = LAZY_RUNTIME_PRERENDER
      return { instantInputs, staticInputs }
    }

    // This navigation does not have an accurate app shell, so if we need instant validation, we need to render again.
    // However, this means that it has an accurate static shell, so we can skip prerendering it.
    const instantInputs = needsInstantValidation ? LAZY_FULL_RENDER : null
    const staticInputs = inputsFromNavigation
    return { instantInputs, staticInputs }
  }

  // We cannot reuse the main navigation, and need to render again.
  // If stages are compatible and we'll rerender for instant validation,
  // we can reuse the result for static validation.
  const instantInputs = needsInstantValidation ? LAZY_FULL_RENDER : null
  const staticInputs =
    areStagesCompatible && instantInputs !== null
      ? instantInputs
      : LAZY_RUNTIME_PRERENDER

  return { instantInputs, staticInputs }
}

async function prepareValidationInputsInLegacyPrefetching(
  ctx: AppRenderContext,
  prerenderResumeDataCache: ReturnType<typeof createPrerenderResumeDataCache>,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void,
  inputsFromNavigation: ResolvedValidationInputs | null,
  validationAbortSignal: AbortSignal
): Promise<PrepareValidationInputsResult> {
  const loaderTree = ctx.componentMod.routeModule.userland.loaderTree
  const needsInstantValidation =
    await anySegmentNeedsInstantValidationInDev(loaderTree)

  // We're not in partialPrefetching, so we can use the same inputs for both
  // instant validation and static shell validation.
  if (inputsFromNavigation) {
    // The main render is reusable.
    const instantInputs = needsInstantValidation ? inputsFromNavigation : null
    const staticInputs = inputsFromNavigation
    return { instantInputs, staticInputs }
  }

  const LAZY_FULL_RENDER = createLazyDevValidationInputs(async () => {
    const shouldRenderWithAppShell = false
    const prefetchMode = PrefetchingMode.LegacySpeculative
    const inputs = await renderWithWarmCachesForValidationInDev(
      ctx,
      createRequestStore,
      getPayload,
      onError,
      prerenderResumeDataCache,
      prefetchMode,
      shouldRenderWithAppShell,
      validationAbortSignal
    )
    if (forwardErrorsFromWarmRender(inputs, ctx)) {
      return VALIDATION_BAILOUT
    }
    return inputs
  })

  const LAZY_RUNTIME_PRERENDER = createLazyDevValidationInputs(async () => {
    const inputs = await prerenderWithWarmCachesForStaticValidationInDev(
      ctx,
      createRequestStore,
      getPayload,
      onError,
      prerenderResumeDataCache,
      validationAbortSignal
    )
    if (forwardErrorsFromWarmRender(inputs, ctx)) {
      return VALIDATION_BAILOUT
    }
    return inputs
  })

  // If instant validation is needed, we need to perform a full rerender.
  // Otherwise, a prerender is enough.
  if (needsInstantValidation) {
    const instantInputs = LAZY_FULL_RENDER
    const staticInputs = instantInputs
    return { instantInputs, staticInputs }
  } else {
    const instantInputs = null
    const staticInputs = LAZY_RUNTIME_PRERENDER
    return { instantInputs, staticInputs }
  }
}

async function resolveLazyDevValidationInputs(
  resolvedOrLazyInputs: DevValidationInputs | LazyDevValidationInputs,
  ctx: AppRenderContext
): Promise<ResolvedValidationInputs | ValidationBailout> {
  let inputs: DevValidationInputs
  if (typeof resolvedOrLazyInputs === 'function') {
    const maybeInputs = await resolvedOrLazyInputs()
    if (maybeInputs === VALIDATION_BAILOUT) {
      return maybeInputs
    }
    inputs = maybeInputs
  } else {
    inputs = resolvedOrLazyInputs
  }

  if ('syncInterruptReason' in inputs) {
    await logMessagesAndSendErrorsToBrowser([inputs.syncInterruptReason], ctx)
    return VALIDATION_BAILOUT
  }
  return inputs
}

function forwardErrorsFromWarmRender(
  inputs: DevValidationInputs,
  ctx: AppRenderContext
) {
  if ('syncInterruptReason' in inputs) {
    void logMessagesAndSendErrorsToBrowser([inputs.syncInterruptReason], ctx)
    return true
  }

  // Unlike the cold streamed render, which fills the caches, the warm
  // render reads them back. Reading a `use cache` entry can surface an
  // invalid dynamic usage error that filling can't (e.g. a nested
  // dynamic `use cache` cache life that propagated to a parent with no
  // explicit `cacheLife`). Forward it and skip validation.
  if (
    forwardInvalidDynamicUsageError(ctx.workStore.invalidDynamicUsageError, ctx)
  ) {
    return true
  }
  return false
}

interface StagedDevRenderSetup {
  readonly cacheSignal: CacheSignal
  readonly prerenderResumeDataCache: ReturnType<
    typeof createPrerenderResumeDataCache
  >
  readonly stageController: StagedRenderingController
  readonly environmentName: () => string
}

export enum PrefetchingMode {
  LegacySpeculative = 1,
  Partial = 2,
}

async function getPrefetchingModeForPage(
  renderOpts: Pick<RenderOpts, 'partialPrefetching'>,
  loaderTree: LoaderTree
): Promise<PrefetchingMode> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  if (renderOpts.partialPrefetching) {
    debug?.('using prefetching mode Partial because of next.config.js')
    return PrefetchingMode.Partial
  }
  if (await anySegmentHasPartialPrefetchingEnabled(loaderTree)) {
    debug?.('using prefetching mode Partial because of segment config')
    return PrefetchingMode.Partial
  }

  debug?.('using prefetching mode LegacySpeculative')
  return PrefetchingMode.LegacySpeculative
}

function getSyncIOMode(prefetchMode: PrefetchingMode): SyncIOMode {
  switch (prefetchMode) {
    case PrefetchingMode.LegacySpeculative:
      return SyncIOMode.AllowedInRuntimeOrDynamic
    case PrefetchingMode.Partial:
      return SyncIOMode.AllowedInDynamic
  }
}

/**
 * Per-render setup shared by the streaming dev Cache Components renders: a
 * cache signal (so caches fill in the background), a prerender resume data
 * cache, async API promises, and a staged rendering controller, all wired into
 * the request store.
 */
function setUpStagedDevRender(
  prefetchingMode: PrefetchingMode,
  navigationKind: DevNavigationKind,
  requestStore: RequestStore
): StagedDevRenderSetup {
  const shouldRenderWithAppShell = navigationHasAppShell(navigationKind)

  const cacheSignal = new CacheSignal()
  trackPendingModules(cacheSignal)
  const prerenderResumeDataCache = createPrerenderResumeDataCache()
  const stageController = new StagedRenderingController({
    abortSignal: null,
    abandonController: null,
    syncIO: getSyncIOMode(prefetchingMode),
    finalStage: null,
  })
  requestStore.resumeDataCache = prerenderResumeDataCache
  requestStore.stagedRendering = stageController
  requestStore.needsAppShell = shouldRenderWithAppShell
  requestStore.hasIncompatibleShellContent = false
  requestStore.asyncApiPromises = createAsyncApiPromises(
    stageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )
  requestStore.cacheSignal = cacheSignal

  const environmentName = () =>
    getEnvironmentNameForStage(stageController.currentStage)

  return {
    cacheSignal,
    prerenderResumeDataCache,
    stageController,
    environmentName,
  }
}

function getEnvironmentNameForStage(stage: RenderStage) {
  switch (stage) {
    case RenderStage.Before:
    case RenderStage.ShellStatic:
    case RenderStage.Static:
      return 'Prerender'
    case RenderStage.ShellRuntime:
    case RenderStage.Runtime:
      return 'Prefetch'
    case RenderStage.Dynamic:
    case RenderStage.Abandoned:
      return 'Server'
    default:
      stage satisfies never
      throw new InvariantError(`Invalid render stage: ${stage}`)
  }
}

// The rendering context and reveal config that `stagedRenderWithCachesInDev`
// forwards to `streamStagedRenderInDev`.
interface StagedDevRenderOptions {
  prefetchMode: PrefetchingMode
  ctx: AppRenderContext
  requestStore: RequestStore
  onError: (error: unknown) => void
  navigationKind: DevNavigationKind
  // This is defined only for foreground HMR requests. When it aborts, the
  // staged render is torn down while its in-flight `'use cache'` fills keep
  // running. Detached validation uses its per-document generation signal;
  // `waitForResponseToFinish` handles response closure before it begins.
  requestAbortSignal: AbortSignal | undefined
}

type DevNavigationKind =
  | { type: 'initial-load' }
  | { type: 'prefetched-client'; prefetchStage: StreamRevealStage }

type StreamRevealStage =
  | RenderStage.Static
  | RenderStage.ShellRuntime
  | RenderStage.Runtime

function navigationHasAppShell(navigationKind: DevNavigationKind): boolean {
  // TODO(app-shells): when we implement `<Link prefetch={true}>` in dev,
  // this might need to be adjusted, because we'll use `Runtime` for the stage
  return (
    navigationKind.type === 'prefetched-client' &&
    navigationKind.prefetchStage === RenderStage.ShellRuntime
  )
}

interface StreamStagedRenderInDevOptions extends StagedDevRenderOptions {
  rscPayload: RSCPayload
  stageController: StagedRenderingController
  cacheSignal: CacheSignal
  environmentName: () => string
  debugChannel: NodeDebugChannelPair | undefined
}

/**
 * Streams a staged dev render to completion without ever abandoning it, so it
 * streams progressively and fills caches as a side effect. Resolves as soon as
 * the first task creates the stream, handing back the response `stream` and a
 * `result` promise. The `result` settles once the full stream has finished, and
 * reports whether any stage boundary still had pending cache reads (a cold load
 * that streamed Suspense fallbacks for not-yet-cached content), the stage
 * timings, and the accumulated chunks.
 *
 * The chunks are accumulated eagerly because detecting completion requires
 * reading the whole stream anyway; the same accumulation feeds validation when
 * the render turns out to be prod-representative.
 */
async function streamStagedRenderInDev({
  ctx,
  requestStore,
  rscPayload,
  stageController,
  cacheSignal,
  environmentName,
  onError,
  debugChannel,
  navigationKind,
  requestAbortSignal,
}: StreamStagedRenderInDevOptions): Promise<{
  stream: Readable
  resultPromise: Promise<StagedDevRenderResult>
}> {
  let holdStreamUntilRevealed: boolean
  let revealAfterStage: StreamRevealStage
  switch (navigationKind.type) {
    case 'initial-load': {
      // Hold the stream until the shell content has flushed so the
      // streamed HTML reflects the prerendered HTML shell
      holdStreamUntilRevealed = true
      revealAfterStage = RenderStage.Static
      break
    }
    case 'prefetched-client': {
      // This stream goes to the browser, which gates revealing the response on
      // the payload's `_revealAfter`, so release it live and let the browser
      // process chunks as they arrive instead of holding it server-side.
      holdStreamUntilRevealed = false
      revealAfterStage = navigationKind.prefetchStage
      break
    }
  }

  const { ComponentMod } = ctx.renderOpts
  const { clientModules } = getClientReferenceManifest()

  // The first task creates the stream; `streamReady` carries it (and its chunk
  // accumulation) out of that task into the function body below.
  const streamReady = createPromiseWithResolvers<{
    stream: Readable
    accumulatedChunksPromise: Promise<AccumulatedStreamChunks>
  }>()

  // `revealAfter` resolves once the `revealAfterStage` content has flushed (or
  // earlier on a cache miss). When streaming live (a client navigation), it's
  // surfaced through the Flight payload as `_revealAfter`: the client decodes
  // it and defers resolving the response's deferred RSCs on it (see
  // `render-tree`), so a Suspense boundary's children aren't revealed
  // before their row has been decoded, which would flush a premature fallback.
  // React serializes the promise as a pending row whose resolution row is
  // emitted only when we resolve it here, and that row follows the children's
  // row in the payload, so the children are already decoded by the time the
  // client unblocks. The HTML (Fizz) render can't gate like this, so we don't
  // surface the promise on its payload and instead hold the whole stream on
  // `revealAfter` for it (see `holdStreamUntilRevealed` below).
  const revealAfter = createPromiseWithResolvers<void>()
  if (!holdStreamUntilRevealed) {
    ;(rscPayload as InitialRSCPayload | NavigationFlightResponse)._revealAfter =
      revealAfter.promise
  }

  let startTime = -Infinity

  // Whether any stage boundary still had pending cache reads (or modules): i.e.
  // the caches weren't filled yet and the render streamed Suspense fallbacks
  // for content that would be cached in production.
  let hadCacheMiss = false

  // Whether the cold-cache status has already been reported for this render. It
  // is reported at most once, and only for a read that's still pending while a
  // shell stage is flushing (see `checkForCacheMiss`).
  let reportedColdCache = false

  // Runs at each stage boundary. Latches the running cache-miss verdict and
  // returns it, so a boundary can reveal the shell as soon as a miss is seen
  // (and so dev validation can later tell whether the streamed render is
  // prod-representative). The first miss seen while a shell stage is still
  // flushing also reports the cold-cache status.
  const checkForCacheMiss = () => {
    if (cacheSignal.hasPendingReads()) {
      hadCacheMiss = true

      // The cold-cache indicator reflects the shell only. A cache read still
      // pending while a shell stage flushes (`currentStage <=
      // revealAfterStage`, using the ordered `RenderStage` values) is part of
      // the shell that production serves instantly, so a cold cache there is
      // worth surfacing and we show the indicator. A cache miss after the shell
      // stage is runtime or dynamic content that production reads/fills during
      // the resume at runtime, so a cold cache there is expected and must not
      // show the indicator.
      if (
        !reportedColdCache &&
        stageController.currentStage <= revealAfterStage
      ) {
        // First in-shell cache miss this render: tell the dev overlay we're
        // streaming with a cold cache now. The per-load `'ready'` reset clears
        // it again on the next load.
        ctx.renderOpts.setCacheStatus?.('cold', ctx.htmlRequestId)
        reportedColdCache = true
      }
    }
    return hadCacheMiss
  }

  const checkCacheMissAndAdvance = (stage: AdvanceableRenderStage) => {
    if (checkForCacheMiss()) {
      revealAfter.resolve()
    }
    stageController.advanceStage(stage)
  }

  const checkReveal = (stage: AdvanceableRenderStage) => {
    if (checkForCacheMiss() || revealAfterStage === stage) {
      revealAfter.resolve()
    }
  }

  const stagesAdvanced = runInSequentialTasks(
    () => {
      stageController.advanceStage(RenderStage.ShellStatic)
      startTime = performance.now() + performance.timeOrigin

      const replayable = new ReplayableNodeStream(
        workUnitAsyncStorage.run(
          requestStore,
          renderToNodeFlightStream,
          ComponentMod,
          rscPayload,
          clientModules,
          {
            onError,
            environmentName,
            startTime,
            filterStackFrame,
            debugChannel: debugChannel?.serverSide,
            signal: requestAbortSignal,
          }
        ) as Readable
      )

      streamReady.resolve({
        stream: replayable.createReplayStream(),
        accumulatedChunksPromise: accumulateStreamChunks(
          replayable.createReplayStream(),
          stageController,
          // Abort accumulation as soon as the signal aborts instead of waiting
          // for the stream to close.
          requestAbortSignal ?? null
        ),
      })
    },
    () => checkCacheMissAndAdvance(RenderStage.Static),
    () => checkReveal(RenderStage.Static),

    () => checkCacheMissAndAdvance(RenderStage.ShellRuntime),
    () => checkReveal(RenderStage.ShellRuntime),

    () => checkCacheMissAndAdvance(RenderStage.Runtime),
    () => checkReveal(RenderStage.Runtime),

    () => {
      // Advance to the dynamic stage even while caches are still filling, so
      // dynamic content streams to the browser right away instead of being
      // withheld until the slowest cache fill completes. Streaming that content
      // promptly is the whole point of the streaming dev render.
      //
      // The tradeoff is that dev no longer detects a `'use cache'` deadlock: a
      // cache whose fill depends on Dynamic-stage IO used to be held here until
      // it hit the fill timeout, but advancing now unblocks that IO so the
      // cache fills instead. That detection only served to debug a build-time
      // deadlock from within dev, and the streaming render no longer blocks the
      // page on the fill, so we accept losing it here.
      // TODO: Surface `'use cache'` deadlocks at build time instead, e.g. via
      // `next build --debug-prerender`, so they can still be diagnosed.
      stageController.advanceStage(RenderStage.Dynamic)
    }
  )

  // If a task throws before the stream is created, surface it to the awaiter
  // below via `streamReady`. Resolve (not reject) `revealAfter` so the client
  // consumers that gate on the payload's `_revealAfter` unblock rather than
  // seeing a rejection; the actual error still surfaces through the stream.
  stagesAdvanced.catch((err) => {
    streamReady.reject(err)
    revealAfter.resolve()
  })

  const { stream, accumulatedChunksPromise } = await streamReady.promise

  // For the HTML (Fizz) render, hold the stream until the shell-stage content
  // has flushed (or until a cache miss reveals early) so the HTML reflects the
  // prerendered shell that production streams rather than a premature fallback.
  // The `_revealAfter` gate is client-side and doesn't apply to this render,
  // which consumes the payload directly and would otherwise stream a boundary's
  // fallback before its content arrived. A client navigation doesn't need the
  // hold: it gates revealing the response on `_revealAfter` (whose resolution
  // row follows the children's row in the stream), so we release the stream to
  // it live and let the browser process chunks as they arrive instead of
  // holding it server-side.
  if (holdStreamUntilRevealed) {
    await revealAfter.promise
  }

  // Advancing the stages only drives the pipeline forward; the render isn't
  // actually complete until its stream has fully finished. The accumulation
  // resolves at that point, so the result is read only once both it and the
  // stages have settled (a late `syncInterruptReason` or
  // `invalidDynamicUsageError` isn't final until the last stage has streamed).
  const resultPromise = Promise.all([
    stagesAdvanced,
    accumulatedChunksPromise,
  ]).then(([, accumulatedChunks]): StagedDevRenderResult => {
    const syncInterruptReason = stageController.getSyncInterruptReason()
    return {
      hadCacheMiss,
      outcome: syncInterruptReason
        ? { syncInterruptReason }
        : {
            startTime,
            stageEndTimes: getStageEndTimes(stageController),
            accumulatedChunks,
          },
    }
  })

  return { stream, resultPromise }
}

function getStageEndTimes(
  stageController: StagedRenderingController
): StageEndTimes {
  return {
    [RenderStage.Static]: stageController.getStageEndTime(RenderStage.Static),
    [RenderStage.ShellRuntime]: stageController.getStageEndTime(
      RenderStage.ShellRuntime
    ),
    [RenderStage.Runtime]: stageController.getStageEndTime(RenderStage.Runtime),
  }
}

async function renderWithWarmCachesForValidationInDev(
  ctx: AppRenderContext,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void,
  prerenderResumeDataCache: ReturnType<typeof createPrerenderResumeDataCache>,
  prefetchMode: PrefetchingMode,
  shouldRenderWithAppShell: boolean,
  validationAbortSignal: AbortSignal
): Promise<DevValidationInputs> {
  const { ComponentMod, setReactDebugChannel } = ctx.renderOpts
  const { clientModules } = getClientReferenceManifest()

  const stageController = new StagedRenderingController({
    abortSignal: null,
    abandonController: null,
    syncIO: getSyncIOMode(prefetchMode),
    finalStage: null,
  })

  const requestStore = createRequestStore()
  requestStore.resumeDataCache = createRenderResumeDataCache(
    prerenderResumeDataCache
  )
  requestStore.stagedRendering = stageController
  requestStore.needsAppShell = shouldRenderWithAppShell
  requestStore.hasIncompatibleShellContent = false
  requestStore.cacheSignal = null
  requestStore.asyncApiPromises = createAsyncApiPromises(
    stageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  const debugChannel = setReactDebugChannel && createNodeDebugChannel()
  const environmentName = () =>
    getEnvironmentNameForStage(stageController.currentStage)

  const rscPayload = await getPayload(requestStore)

  let startTime = -Infinity
  const accumulatedChunks = await runInSequentialTasks(
    () => {
      stageController.advanceStage(RenderStage.ShellStatic)
      startTime = performance.now() + performance.timeOrigin

      const sourceStream = workUnitAsyncStorage.run(
        requestStore,
        renderToNodeFlightStream,
        ComponentMod,
        rscPayload,
        clientModules,
        {
          onError,
          environmentName,
          startTime,
          filterStackFrame,
          debugChannel: debugChannel?.serverSide,
          signal: validationAbortSignal,
        }
      ) as Readable

      return accumulateStreamChunks(
        sourceStream,
        stageController,
        validationAbortSignal
      )
    },
    () => stageController.advanceStage(RenderStage.Static),
    () => stageController.advanceStage(RenderStage.ShellRuntime),
    () => stageController.advanceStage(RenderStage.Runtime),
    () => stageController.advanceStage(RenderStage.Dynamic)
  )

  const syncInterruptReason = stageController.getSyncInterruptReason()
  if (syncInterruptReason) {
    // Sync IO interrupted the render, so it won't be validated. Drop the debug
    // channel now and return only the interrupt reason: nothing downstream
    // reads the request store or chunks of an interrupted render.
    dropValidationDebugChannel(debugChannel?.clientSide.readable)
    return { syncInterruptReason }
  }

  return {
    accumulatedChunks,
    startTime,
    stageEndTimes: getStageEndTimes(stageController),
    requestStore,
    debugChannelClient: debugChannel?.clientSide.readable,
  }
}

interface StagedRenderWithCachesInDevOptions extends StagedDevRenderOptions {
  createRequestStore: () => RequestStore
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>
  shouldValidate: boolean
  fallbackRouteParams: OpaqueFallbackRouteParams | null
  getDevRenderDidError: () => boolean
}

async function prerenderWithWarmCachesForStaticValidationInDev(
  ctx: AppRenderContext,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void,
  prerenderResumeDataCache: ReturnType<typeof createPrerenderResumeDataCache>,
  validationAbortSignal: AbortSignal
): Promise<DevValidationInputs> {
  // This function is currently only used in partialPrefetching.
  const prefetchMode = PrefetchingMode.Partial

  const { ComponentMod, setReactDebugChannel } = ctx.renderOpts
  const { clientModules } = getClientReferenceManifest()

  // This render is for validation only, and won't be shown to the user,
  // so we're only rendering until the runtime stage
  // (we need static chunks and runtime chunks for discriminated errors)
  const finalReactController = new AbortController()
  const finalDataController = new AbortController()

  abortWhenSignalAborts(validationAbortSignal, finalReactController)

  const stageController = new StagedRenderingController({
    abortSignal: finalDataController.signal,
    abandonController: null,
    syncIO: getSyncIOMode(prefetchMode),
    finalStage: RenderStage.Runtime,
  })

  const requestStore = createRequestStore()
  requestStore.resumeDataCache = createRenderResumeDataCache(
    prerenderResumeDataCache
  )
  requestStore.stagedRendering = stageController
  requestStore.needsAppShell = false
  requestStore.hasIncompatibleShellContent = false
  requestStore.cacheSignal = null
  requestStore.asyncApiPromises = createAsyncApiPromises(
    stageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  // We abort upon reaching the runtime stage or on Sync IO.
  // If sync IO occurs in a place where it's not allowed, then we have to fail validation,
  // and we can abort the render immediately, without waiting for anything else..
  requestStore.controller = finalReactController
  requestStore.renderSignal = finalDataController.signal

  const debugChannel = setReactDebugChannel && createNodeDebugChannel()
  const environmentName = () =>
    getEnvironmentNameForStage(stageController.currentStage)

  const rscPayload = await getPayload(requestStore)

  let startTime = -Infinity
  const collectedChunksByStage = createStageChunksAccumulator()

  const collectChunk = (chunk: Uint8Array) => {
    // We abort the render before the dynamic stage.
    // If we aborted, save the errored chunks as if they were emitted
    // in the dynamic stage so that we can late-release them for debug info.
    const stage = finalReactController.signal.aborted
      ? RenderStage.Dynamic
      : stageController.currentStage
    collectStageChunk(collectedChunksByStage, stage, chunk)
  }

  await runInSequentialTasks(
    async () => {
      stageController.advanceStage(RenderStage.ShellStatic)
      startTime = performance.now() + performance.timeOrigin

      const sourceStream = workUnitAsyncStorage.run(
        requestStore,
        renderToNodeFlightStream,
        ComponentMod,
        rscPayload,
        clientModules,
        {
          onError,
          environmentName,
          startTime,
          filterStackFrame,
          debugChannel: debugChannel?.serverSide,
        }
      ) as Readable

      // Only reject hanging promises after react finished aborting.
      abortWhenSignalAborts(finalReactController.signal, finalDataController)

      // Note: this await will only resolve after the last task (unless sync IO aborts the render earlier)
      await iterateStreamingPrerenderChunks(
        sourceStream,
        finalReactController.signal,
        collectChunk
      )
    },
    () => stageController.advanceStage(RenderStage.Static),
    () => stageController.advanceStage(RenderStage.ShellRuntime),
    () => stageController.advanceStage(RenderStage.Runtime),
    () => {
      // Do not advance to the dynamic stage, abort instead.
      abortInRenderContext(requestStore, finalReactController)
    }
  )

  const syncInterruptReason = stageController.getSyncInterruptReason()
  if (syncInterruptReason) {
    // Sync IO interrupted the render, so it won't be validated. Drop the debug
    // channel now and return only the interrupt reason: nothing downstream
    // reads the request store or chunks of an interrupted render.
    dropValidationDebugChannel(debugChannel?.clientSide.readable)
    return { syncInterruptReason }
  }
  return {
    accumulatedChunks: collectedChunksByStage,
    startTime,
    stageEndTimes: getStageEndTimes(stageController),
    requestStore,
    debugChannelClient: debugChannel?.clientSide.readable,
  }
}

/** When the source signal aborts, abort the controller with its reason. */
function abortWhenSignalAborts(
  signal: AbortSignal,
  controller: AbortController
) {
  if (signal.aborted) {
    controller.abort(signal.reason)
    return
  }
  signal.addEventListener(
    'abort',
    () => controller.abort(signal.reason),
    ABORT_ONCE
  )
}

const ABORT_ONCE = { once: true }

/** Make sure that any userspace code that might run during abort has access
 * to the workUnitStore that it was rendered in.
 * This is mostly relevant to Fizz where a component suspended on a hanging use()
 * might get rerendered during an abort for debug info reasons, but we defensively
 * also do it in Flight just in case.
 * x-ref: https://github.com/vercel/next.js/pull/94436
 * */
function abortInRenderContext(
  workUnitStore: WorkUnitStore,
  controller: AbortController,
  reason?: unknown
): void {
  if (controller.signal.aborted) {
    return
  }
  workUnitAsyncStorage.run(
    workUnitStore,
    reason
      ? controller.abort.bind(controller, reason)
      : controller.abort.bind(controller)
  )
}

/**
 * Sets up and streams a dev Cache Components render. Streams immediately and
 * fills caches as a side effect, then runs a background follow-up once the
 * render finishes. When `shouldValidate`, it spawns Cache Components validation
 * (against the streamed render directly when it's prod-representative,
 * otherwise against a separate warm-cache render); otherwise it just forwards
 * any recorded invalid dynamic usage error to the dev overlay.
 */
async function stagedRenderWithCachesInDev({
  prefetchMode,
  ctx,
  requestStore,
  createRequestStore,
  getPayload,
  onError,
  shouldValidate,
  fallbackRouteParams,
  getDevRenderDidError,
  navigationKind,
  requestAbortSignal,
}: StagedRenderWithCachesInDevOptions): Promise<{
  stream: Readable
  debugChannel: NodeDebugChannelPair | undefined
}> {
  const validationGeneration = shouldValidate
    ? beginDevValidation(ctx.htmlRequestId)
    : undefined

  try {
    const { setReactDebugChannel } = ctx.renderOpts

    const {
      cacheSignal,
      prerenderResumeDataCache,
      stageController,
      environmentName,
    } = setUpStagedDevRender(prefetchMode, navigationKind, requestStore)

    let validationDebugChannel: AnyStream | undefined
    const debugChannel = setReactDebugChannel && createNodeDebugChannel()
    if (validationGeneration !== undefined && debugChannel) {
      const debugChannelReplay = new ReplayableNodeStream(
        debugChannel.clientSide.readable
      )
      debugChannel.clientSide.readable = debugChannelReplay.createReplayStream()
      validationDebugChannel = debugChannelReplay.createReplayStream()
    }

    // The stage controller starts in the `Before` stage, where sync IO doesn't
    // abort, so it's fine if it happens while creating the payload.
    const rscPayload = await getPayload(requestStore)

    const { stream, resultPromise } = await streamStagedRenderInDev({
      prefetchMode,
      ctx,
      requestStore,
      rscPayload,
      stageController,
      cacheSignal,
      environmentName,
      onError,
      debugChannel,
      navigationKind,
      requestAbortSignal,
    })

    if (validationGeneration === undefined) {
      logValidationSkipped(ctx)
    }

    // The render may record an invalid dynamic usage error (e.g. a request API
    // used inside `'use cache'`). A cache-miss render records it while filling,
    // so the verdict isn't final until the fills settle. Once the render has
    // settled, forward any such error to the dev overlay: it's a real error
    // from the render the user received, so it surfaces whether or not the
    // route validates. When there is one the render isn't prod-representative,
    // so validating it is pointless and we skip it; otherwise validation runs
    // in the background (deferred there until the response has finished).
    void resultPromise.then(
      async (result) => {
        if (result.hadCacheMiss) {
          await cacheSignal.cacheReady()
        }

        const hadInvalidDynamicUsage = forwardInvalidDynamicUsageError(
          ctx.workStore.invalidDynamicUsageError,
          ctx
        )

        if (validationGeneration === undefined) {
          return
        }

        if (hadInvalidDynamicUsage || validationGeneration.signal.aborted) {
          if (validationGeneration.signal.aborted) {
            logValidationAborted(ctx)
          }
          validationGeneration.finish()
          return
        }

        runDevValidationInBackground(
          prefetchMode,
          navigationKind,
          result,
          requestStore,
          validationDebugChannel,
          ctx,
          fallbackRouteParams,
          prerenderResumeDataCache,
          getDevRenderDidError,
          createRequestStore,
          getPayload,
          onError,
          validationGeneration
        )
      },
      () => {
        // The render itself rejected; there's nothing to forward or validate.
        validationGeneration?.finish()
      }
    )

    return { stream, debugChannel }
  } catch (err) {
    validationGeneration?.finish()
    throw err
  }
}

type AccumulatedStreamChunks = Record<AdvanceableRenderStage, Array<Uint8Array>>

function createStageChunksAccumulator(): AccumulatedStreamChunks {
  const result: Partial<AccumulatedStreamChunks> = {}
  for (const stage of RENDER_STAGE_ADVANCE_ORDER) {
    result[stage] = []
  }
  return result as AccumulatedStreamChunks
}

async function accumulateStreamChunks(
  stream: AnyStream,
  stageController: StagedRenderingController,
  signal: AbortSignal | null
): Promise<AccumulatedStreamChunks> {
  const accumulator = createStageChunksAccumulator()
  await accumulateStreamChunksInto(accumulator, stream, stageController, signal)
  return accumulator
}

async function accumulateStreamChunksInto(
  accumulator: AccumulatedStreamChunks,
  stream: AnyStream,
  stageController: StagedRenderingController,
  signal: AbortSignal | null
): Promise<void> {
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader()

    let cancelled = false
    function cancel() {
      if (!cancelled) {
        cancelled = true
        reader.cancel()
      }
    }

    if (signal) {
      signal.addEventListener('abort', cancel, { once: true })
    }

    try {
      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done || cancelled) {
          cancel()
          break
        }
        collectStageChunk(accumulator, stageController.currentStage, value)
      }
    } catch (err) {
      // When we cancel the reader we may reject the read.
      // Only swallow errors caused by our intentional cancel();
      // re-throw unexpected errors to avoid silently returning partial data.
      if (!cancelled) {
        throw err
      }
    }
  } else {
    const nodeStream = stream as Readable
    let cancelled = false
    function cancel() {
      if (!cancelled) {
        cancelled = true
        nodeStream.destroy()
      }
    }

    if (signal) {
      signal.addEventListener('abort', cancel, { once: true })
    }

    try {
      for await (const value of nodeStream) {
        if (cancelled) break
        collectStageChunk(accumulator, stageController.currentStage, value)
      }
    } catch (err) {
      if (!cancelled) {
        throw err
      }
    }
  }
}

function collectStageChunk(
  accumulator: AccumulatedStreamChunks,
  currentStage: RenderStage,
  value: Uint8Array
): void {
  if (currentStage === RenderStage.Before) {
    throw new InvariantError('Unexpected stream chunk while in Before stage')
  }
  // Stage N+1 contains all the chunks of the stages 1..N,
  // so add the chunk to the array for the current stage and all the stages that follow it.
  // Starting at the end saves us from having to find the current stage in the order array.
  for (let i = RENDER_STAGE_ADVANCE_ORDER.length - 1; i >= 0; i--) {
    const stage = RENDER_STAGE_ADVANCE_ORDER[i]
    if (stage < currentStage) {
      break
    }
    accumulator[stage].push(value)
  }
}

async function countShellAndStaticStageBytes(
  stream: Readable,
  stageController: StagedRenderingController
): Promise<
  Pick<StageByteLengths, RenderStage.ShellStatic | RenderStage.Static>
> {
  const byteLengths = createStageByteLengths()

  // Abort the signal whenever we advance to the stage after static.
  const abortController = new AbortController()
  const endStage = getNextStage(RenderStage.Static)
  stageController.onStage(endStage, abortController.abort.bind(abortController))

  await countStageBytesUntilAbortNode(
    byteLengths,
    stream,
    stageController,
    abortController.signal
  )
  return byteLengths
}

type StageByteLengths = Record<AdvanceableRenderStage, number>

function createStageByteLengths(): StageByteLengths {
  const result: Partial<StageByteLengths> = {}
  for (const stage of RENDER_STAGE_ADVANCE_ORDER) {
    result[stage] = 0
  }
  return result as StageByteLengths
}

async function countStageBytesUntilAbortNode(
  byteLengths: StageByteLengths,
  stream: Readable,
  stageController: StagedRenderingController,
  abortSignal: AbortSignal
): Promise<void> {
  let cancelled = false
  abortSignal.addEventListener(
    'abort',
    () => {
      cancelled = true
      stream.destroy()
    },
    { once: true }
  )

  try {
    for await (const value of stream) {
      if (cancelled) break
      increaseChunkByteLengths(
        byteLengths,
        stageController.currentStage,
        (value as Uint8Array).byteLength
      )
    }
  } catch (err) {
    if (!cancelled) {
      throw err
    }
  }
}

function increaseChunkByteLengths(
  byteLengths: StageByteLengths,
  currentStage: RenderStage,
  length: number
) {
  if (!isAdvanceableRenderStage(currentStage)) {
    return
  }
  // Later stages include earlier stages, so we increment
  // the byte count for all that are `>= currentStage`.
  // Iterate in reverse so we don't have to skip the earlier ones.
  for (let i = RENDER_STAGE_ADVANCE_ORDER.length - 1; i >= 0; i--) {
    const stage = RENDER_STAGE_ADVANCE_ORDER[i]
    if (stage < currentStage) {
      break
    }
    byteLengths[stage] += length
  }
}

function createAsyncApiPromises(
  stagedRendering: StagedRenderingController,
  cookies: RequestStore['cookies'],
  mutableCookies: RequestStore['mutableCookies'],
  headers: RequestStore['headers']
): NonNullable<RequestStore['asyncApiPromises']> {
  // NOTE: Must be kept in sync with cookies.ts, headers.ts, params.ts, search-params.ts
  const cookiesStage = RENDER_STAGES_BY_DATA_KIND.sessionData
  const headersStage = RENDER_STAGES_BY_DATA_KIND.sessionData
  const paramsStage = RENDER_STAGES_BY_DATA_KIND.runtimeLinkData
  const searchParamsStage = RENDER_STAGES_BY_DATA_KIND.runtimeLinkData

  return {
    cookies: stagedRendering.delayUntilStage(cookiesStage, 'cookies', cookies),
    mutableCookies: stagedRendering.delayUntilStage(
      cookiesStage,
      'cookies',
      mutableCookies as RequestStore['cookies']
    ),
    headers: stagedRendering.delayUntilStage(headersStage, 'headers', headers),

    // These are not used directly, but we chain other `params`/`searchParams` promises off of them.
    sharedParamsParent: stagedRendering.delayUntilStage(
      paramsStage,
      undefined,
      '<internal params>'
    ),
    sharedSearchParamsParent: stagedRendering.delayUntilStage(
      searchParamsStage,
      undefined,
      '<internal searchParams>'
    ),

    connection: stagedRendering.delayUntilStage(
      RenderStage.Dynamic,
      'connection',
      undefined
    ),
    io: stagedRendering.delayUntilStage(RenderStage.Dynamic, 'io', undefined),
  }
}

/**
 * Logs the given messages, and sends the error instances to the browser as an
 * RSC stream, where they can be deserialized and logged (or otherwise presented
 * in the devtools), while leveraging React's capabilities to not only
 * source-map the stack frames (via findSourceMapURL), but also create virtual
 * server modules that allow users to inspect the server source code in the
 * browser.
 */
async function logMessagesAndSendErrorsToBrowser(
  messages: unknown[],
  ctx: AppRenderContext
): Promise<void> {
  const { htmlRequestId, renderOpts } = ctx
  const { sendErrorsToBrowser } = renderOpts

  const errors: Error[] = []
  for (const message of messages) {
    // Log the error to the CLI. Prevent the logs from being dimmed, which we
    // apply for other logs during the spawned validation.
    consoleAsyncStorage.exit(() => {
      console.error(message)
    })

    // Error instances are also sent to the browser. We're currently using a
    // non-Error message only in debug build mode as a message that is only
    // meant for the CLI. FIXME: This is a bit spooky action at a distance. We
    // should maybe have a more explicit way of determining which messages
    // should be sent to the browser. Regardless, only real errors with a proper
    // stack make sense to be "replayed" in the browser.
    if (message instanceof Error) {
      errors.push(message)
    }
  }

  if (errors.length > 0) {
    if (!sendErrorsToBrowser) {
      throw new InvariantError(
        'Expected `sendErrorsToBrowser` to be defined in renderOpts.'
      )
    }

    // Build a Map of error → error code for errors that have one.
    // React doesn't revive __NEXT_ERROR_CODE during RSC deserialization, so we
    // send it as a side-channel Map. RSC preserves object identity, so the
    // deserialized Map keys will reference the same Error objects.
    const errorCodes = new Map<Error, string>()
    for (const err of errors) {
      const code = extractNextErrorCode(err)
      if (code !== undefined) {
        errorCodes.set(err, code)
      }
    }

    const { clientModules } = getClientReferenceManifest()

    let errorsFlightStream: AnyStream
    if (process.env.__NEXT_USE_NODE_STREAMS) {
      errorsFlightStream = renderToNodeFlightStream(
        ctx.componentMod,
        { errors, errorCodes },
        clientModules,
        { filterStackFrame }
      )
    } else {
      errorsFlightStream = renderToWebFlightStream(
        ctx.componentMod,
        { errors, errorCodes },
        clientModules,
        { filterStackFrame }
      )
    }

    sendErrorsToBrowser(errorsFlightStream, htmlRequestId)
  }
}

function logValidationSkipped(ctx: AppRenderContext) {
  if (process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION) {
    const requestId = ctx.requestId
    const url = ctx.url.href
    console.log(
      formatValidationEvent({ type: 'validation_start', requestId, url })
    )
    console.log(
      formatValidationEvent({ type: 'validation_end', requestId, url })
    )
  }
}

function logValidationAborted(ctx: AppRenderContext) {
  if (process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION) {
    const requestId = ctx.requestId
    const url = ctx.url.href
    console.log(
      formatValidationEvent({ type: 'validation_aborted', requestId, url })
    )
  }
}

/**
 * Runs a dev validation `run` callback (the render plus the error delivery),
 * enclosing it in the `validation_start` / `validation_end` /
 * `validation_aborted` lifecycle markers that E2E tests read from the CLI
 * output. The markers must enclose delivery as well as the render, so tests
 * that assert the error between the markers capture it. Also applies the
 * `NEXT_TEST_DEV_VALIDATION_DELAY_MS` hook that keeps validation in flight for
 * scheduler tests. All of this is test-mode only; otherwise `run` is invoked
 * directly.
 */
async function runWithDevValidationLogging(
  ctx: AppRenderContext,
  validationAbortSignal: AbortSignal,
  run: () => Promise<void>
): Promise<void> {
  if (!(process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION)) {
    return run()
  }

  const requestId = ctx.requestId
  const url = ctx.url.href
  const responseFinished =
    !isNodeNextResponse(ctx.res) || ctx.res.originalResponse.writableFinished

  console.log(
    formatValidationEvent({
      type: 'validation_start',
      requestId,
      url,
      responseFinished,
    })
  )

  try {
    // Keep validation in flight for scheduler E2E tests without relying on
    // timing-sensitive user code. Aborts end the delay immediately.
    const validationDelay = Number(
      process.env.NEXT_TEST_DEV_VALIDATION_DELAY_MS
    )

    if (
      Number.isFinite(validationDelay) &&
      validationDelay > 0 &&
      !validationAbortSignal.aborted
    ) {
      await new Promise<void>((resolve) => {
        let timeout: NodeJS.Timeout
        const finishDelay = () => {
          clearTimeout(timeout)
          validationAbortSignal.removeEventListener('abort', finishDelay)
          resolve()
        }
        timeout = setTimeout(finishDelay, validationDelay)
        validationAbortSignal.addEventListener('abort', finishDelay, {
          once: true,
        })
      })
    }

    if (!validationAbortSignal.aborted) {
      await run()
    }
  } finally {
    if (validationAbortSignal.aborted) {
      logValidationAborted(ctx)
    } else {
      console.log(
        formatValidationEvent({ type: 'validation_end', requestId, url })
      )
    }
  }
}

/**
 * The slice of the render context the dev/build validation passes read. Both
 * the in-process callers and the validation worker build one of these, so it
 * names exactly what validation depends on and nothing else: no live
 * request/response objects that can't be rebuilt off the main thread.
 * `isDebugChannelEnabled` is the derived flag validation uses in place of the
 * main render's `setReactDebugChannel` callback (validation only ever read that
 * callback's presence as a boolean).
 */
export type ValidationRenderContext = Pick<
  AppRenderContext,
  | 'componentMod'
  | 'getDynamicParamFromSegment'
  | 'query'
  | 'implicitTags'
  | 'nonce'
  | 'workStore'
> & {
  renderOpts: Pick<RenderOpts, 'images' | 'allowEmptyStaticShell'>
  isDebugChannelEnabled: boolean
}

/**
 * Projects a full app render context down to the slice validation reads. The
 * in-process dev and build callers hold an `AppRenderContext` and use this to
 * hand validation exactly what it needs; the worker builds the same shape from
 * its snapshot instead.
 */
export function toValidationRenderContext(
  ctx: AppRenderContext
): ValidationRenderContext {
  return {
    componentMod: ctx.componentMod,
    getDynamicParamFromSegment: ctx.getDynamicParamFromSegment,
    query: ctx.query,
    implicitTags: ctx.implicitTags,
    nonce: ctx.nonce,
    workStore: ctx.workStore,
    renderOpts: {
      images: ctx.renderOpts.images,
      allowEmptyStaticShell: ctx.renderOpts.allowEmptyStaticShell,
    },
    isDebugChannelEnabled: !!ctx.renderOpts.setReactDebugChannel,
  }
}

/**
 * Rebuilds the `WorkStore` the worker's dev validation runs under from the
 * transported snapshot, carrying only the fields the validation passes read.
 * `after()` callbacks are routed into a throwaway `AfterContext` whose hooks
 * no-op, because the validation render must not repeat those side effects, and
 * `after()` can't affect the rendered output.
 */
function buildDevValidationWorkStore(
  message: DevValidationWorkerMessage
): WorkStore {
  const { AfterContext } =
    require('../after/after-context') as typeof import('../after/after-context')

  const noopAfterContext = new AfterContext({
    waitUntil(promise) {
      promise.catch(() => {})
    },
    onClose() {},
    onTaskError() {},
  })

  return {
    page: message.page,
    route: message.route,
    forceStatic: message.forceStatic,
    isDraftMode: message.request.isDraftMode,
    useCacheTimeout: message.nextConfigSerializable.useCacheTimeout,
    staticPageGenerationTimeout:
      message.nextConfigSerializable.staticPageGenerationTimeout,
    cacheLifeProfiles: message.nextConfigSerializable.cacheLifeProfiles,
    buildId: message.buildId,
    deploymentId: message.deploymentId,
    requestStartTime: message.request.requestStartTime,
    previouslyRevalidatedTags: [],
    refreshTagsByCacheKind: new Map(),
    runInCleanSnapshot: createSnapshot(),
    shouldTrackFetchMetrics: false,
    reactServerErrorsByDigest: new Map(),
    afterContext: noopAfterContext,
    // Dev validation only ever runs under Cache Components.
    cacheComponentsEnabled: true,
    validationLevel: message.validationLevel,
  }
}

/**
 * Revives one serialized validation input into the in-memory shape
 * `runValidationInDev` consumes, binding it to the rebuilt request store.
 */
function toDevValidationInputs(
  serialized: SerializedValidationInputs,
  requestStore: RequestStore
): ResolvedValidationInputs {
  return {
    accumulatedChunks: serialized.accumulatedChunks,
    startTime: serialized.startTime,
    stageEndTimes: serialized.stageEndTimes,
    requestStore,
    debugChannelClient: serialized.debugChunks
      ? createNodeStreamFromChunks(serialized.debugChunks)
      : undefined,
  }
}

/**
 * Worker entry point for Cached Components dev validation, reached from the
 * validation worker via `ComponentMod.routeModule.runValidationInDev`. The
 * worker reloads the route's compiled module and calls this so the entire
 * validation (Flight re-encodes and the client prerenders) runs inside the
 * app-page bundle's single React instance, alongside the user's client
 * components. It rebuilds the render context, work store, and request store
 * from the transported snapshot (the live objects can't cross a thread) and
 * returns the validation errors for the worker to serialize and the main thread
 * to deliver.
 */
export async function runValidationInDevFromSnapshot(
  message: DevValidationWorkerMessage,
  componentMod: AppPageModule,
  abortSignal: AbortSignal
): Promise<Array<unknown> | undefined> {
  // Expose the reloaded route's bundler `require` / `loadChunk` on `globalThis`
  // so `react-server-dom-*` can resolve client references during the validation
  // prerenders, exactly as the main render does after loading its module.
  if (componentMod.__next_app__) {
    installGlobalModuleLoadingHandlers(componentMod, true, false)
  }

  // `requestFallbackRouteParams` reproduces `ctx.getDynamicParamFromSegment`
  // exactly, so the depth-loop segment keys match the seed render's Flight.
  // `fallbackRouteParams` is separate and only marks params unknown in the
  // prerender stores.
  //
  // TODO: Those two fallback params sets are very confusing in the whole code
  // base. We should maybe refactor this to make their different roles clearer.
  const { requestFallbackRouteParams, fallbackRouteParams } = message

  const getDynamicParamFromSegment = makeGetDynamicParamFromSegment(
    message.interpolatedParams,
    requestFallbackRouteParams,
    message.optimisticRouting
  )

  const implicitTags: ImplicitTags = {
    tags: message.implicitTags,
    expirationsByCacheKind: new Map(),
  }

  const workStore = buildDevValidationWorkStore(message)

  const ctx: ValidationRenderContext = {
    componentMod,
    getDynamicParamFromSegment,
    query: message.query,
    implicitTags,
    nonce: message.nonce,
    workStore,
    renderOpts: {
      images: message.renderOpts.images,
      allowEmptyStaticShell: message.renderOpts.allowEmptyStaticShell,
    },
    isDebugChannelEnabled: message.isDebugChannelEnabled,
  }

  const requestStore = createRequestStoreFromInputs({
    phase: 'render',
    headers: new Headers(message.request.headers),
    onUpdateCookies: undefined,
    url: {
      pathname: message.request.urlPathname,
      search: message.request.urlSearch,
    },
    rootParams: message.request.rootParams,
    implicitTags,
    resumeDataCache: null,
    previewProps: undefined,
    isHmrRefresh: message.request.isHmrRefresh,
    hmrRefreshHash: message.request.hmrRefreshHash,
    serverComponentsHmrCache: undefined,
    fallbackParams: requestFallbackRouteParams,
  })

  const staticInputs = toDevValidationInputs(message.staticInputs, requestStore)

  const instantInputs = message.instantInputs
    ? toDevValidationInputs(message.instantInputs, requestStore)
    : null

  return workAsyncStorage.run(
    workStore,
    runValidationInDev,
    message.prefetchMode,
    instantInputs,
    staticInputs,
    ctx,
    fallbackRouteParams,
    message.devRenderDidError,
    abortSignal
  )
}

/**
 * This function is a fork of prerenderToStream cacheComponents branch.
 * While it doesn't return a stream we want it to have identical
 * prerender semantics to prerenderToStream and should update it
 * in conjunction with any changes to that function.
 */
async function runValidationInDev(
  prefetchMode: PrefetchingMode,
  instantInputs: ResolvedValidationInputs | null,
  staticInputs: ResolvedValidationInputs,
  ctx: ValidationRenderContext,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  devRenderDidError: boolean,
  validationAbortSignal: AbortSignal
): Promise<Array<unknown> | undefined> {
  const { componentMod: ComponentMod, getDynamicParamFromSegment } = ctx
  const loaderTree = ComponentMod.routeModule.userland.loaderTree
  const rootParams = getRootParams(loaderTree, getDynamicParamFromSegment)

  const needsInstantValidation =
    await anySegmentNeedsInstantValidationInDev(loaderTree)

  // `samples` from instant config are only used during build
  const validationSamples = null
  const validationSampleTracking = null

  //================================
  // Client module warmup
  //================================
  {
    // For warmup, we have to use the shared inputs if present -- the static inputs
    // may not have a proper dynamic stage.
    const { accumulatedChunks } = instantInputs ?? staticInputs

    // First we warmup SSR with the runtime chunks. This ensures that when we do
    // the full prerender pass with dynamic tracking module loading won't
    // interrupt the prerender and can properly observe the entire content
    await warmupClientModulesForStagedValidation(
      // if we're going to be validating prefetches, we'll be rendering some segments in the dynamic stage.
      // otherwise, for static shell validation, we only need to warm up to the runtime stage.
      // we also need to use a different store type, because instant validation allows more APIs to resolve.
      needsInstantValidation ? 'validation-client' : 'prerender-client',
      needsInstantValidation
        ? accumulatedChunks[RenderStage.Dynamic]
        : accumulatedChunks[RenderStage.Runtime],
      accumulatedChunks[RenderStage.Dynamic],
      rootParams,
      fallbackRouteParams,
      ctx,
      validationSamples,
      validationSampleTracking,
      validationAbortSignal
    )
  }

  // React renders used by validation can occupy an entire event-loop turn.
  // Yield between them so a newer navigation can enter app rendering,
  // supersede this validation, and avoid waiting for all remaining attempts.
  if (!(await yieldToForegroundRequest(validationAbortSignal))) {
    return
  }

  // instantInputs and staticInputs may be the same,
  // so we have to make sure we only consume the debug channel once.
  let cachedDebugChunks = new WeakMap<AnyStream, Uint8Array[]>()
  const getDebugChunksOnce = async (
    channel: AnyStream
  ): Promise<Uint8Array[]> => {
    let chunks = cachedDebugChunks.get(channel)
    if (!chunks) {
      cachedDebugChunks.set(
        channel,
        (chunks = await collectDebugChunksFromClientChannel(channel))
      )
    }
    return chunks
  }

  //================================
  // Static shell validation
  //================================
  {
    // The request may have been aborted during the client module warmup above.
    if (validationAbortSignal.aborted) {
      return
    }

    const inputs = staticInputs

    const debugChunks = inputs.debugChannelClient
      ? await getDebugChunksOnce(inputs.debugChannelClient)
      : null
    const hmrRefreshHash = getHmrRefreshHash(inputs.requestStore)

    const result = await validateStaticShell(
      inputs,
      ctx,
      rootParams,
      fallbackRouteParams,
      debugChunks,
      hmrRefreshHash,
      validationAbortSignal
    )
    // A newer render superseded this validation while its render ran, so its
    // result is stale. Don't surface errors for a page the user left.
    if (validationAbortSignal.aborted) {
      return
    }
    if (result.length > 0) {
      if (!(await yieldToForegroundRequest(validationAbortSignal))) {
        return
      }
      return result
    }
  }

  //================================
  // Instant validation
  //================================
  if (needsInstantValidation && instantInputs) {
    if (!(await yieldToForegroundRequest(validationAbortSignal))) {
      return
    }

    const inputs = instantInputs

    const debugChunks = inputs.debugChannelClient
      ? await getDebugChunksOnce(inputs.debugChannelClient)
      : null
    const hmrRefreshHash = getHmrRefreshHash(inputs.requestStore)

    const result = await validateInstantConfigs(
      prefetchMode,
      inputs.accumulatedChunks,
      debugChunks,
      inputs.startTime,
      inputs.stageEndTimes,
      rootParams,
      fallbackRouteParams,
      ctx,
      hmrRefreshHash,
      validationSamples,
      devRenderDidError,
      validationAbortSignal
    )

    // A newer render superseded this work. Don't surface stale validation
    // errors for a page the user left.
    if (validationAbortSignal.aborted) {
      return
    }
    if (result.length > 0) {
      if (!(await yieldToForegroundRequest(validationAbortSignal))) {
        return
      }
      return result
    }
  }
}

async function collectDebugChunksFromClientChannel(debugChannel: AnyStream) {
  const debugChunks: Uint8Array[] = []
  for await (const c of debugChannel) {
    debugChunks.push(c)
  }
  return debugChunks
}

async function validateStaticShell(
  inputs: ResolvedValidationInputs,
  ctx: ValidationRenderContext,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  debugChunks: Uint8Array[] | null,
  hmrRefreshHash: string | undefined,
  validationAbortSignal: AbortSignal
): Promise<unknown[]> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  debug?.(`Starting static shell validation...`)

  const { componentMod: ComponentMod, renderOpts } = ctx

  const loaderTree = ComponentMod.routeModule.userland.loaderTree

  const { accumulatedChunks, stageEndTimes } = inputs

  const allowEmptyStaticShell =
    (renderOpts.allowEmptyStaticShell ?? false) ||
    (await isPageAllowedToBlock(loaderTree))

  const runtimeResult = await validateStagedShell(
    accumulatedChunks[RenderStage.Runtime],
    accumulatedChunks[RenderStage.Dynamic],
    debugChunks,
    stageEndTimes[RenderStage.Runtime],
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    hmrRefreshHash,
    trackDynamicHoleInRuntimeShell,
    validationAbortSignal
  )

  if (runtimeResult.length > 0) {
    debug?.(`❌ Failed - ${runtimeResult.length} errors from runtime stage`)
    // We have something to report from the runtime validation
    // We can skip the rest
    return runtimeResult
  }

  if (!(await yieldToForegroundRequest(validationAbortSignal))) {
    return []
  }

  const staticResult = await validateStagedShell(
    accumulatedChunks[RenderStage.Static],
    accumulatedChunks[RenderStage.Dynamic],
    debugChunks,
    stageEndTimes[RenderStage.Static],
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    hmrRefreshHash,
    trackDynamicHoleInStaticShell,
    validationAbortSignal
  )

  if (staticResult.length > 0) {
    debug?.(`❌ Failed - ${staticResult.length} errors from static stage`)
    // We have something to report from the static validation
    // We can skip the rest
    return staticResult
  }
  debug?.(`✅ Passed`)
  return []
}

async function warmupClientModulesForStagedValidation(
  storeType: PrerenderStoreModernClient['type'] | ValidationStoreClient['type'],
  partialServerChunks: Array<Uint8Array>,
  allServerChunks: Array<Uint8Array>,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  ctx: ValidationRenderContext,
  validationSamples: ValidationStoreClient['validationSamples'],
  validationSampleTracking: ValidationStoreClient['validationSampleTracking'],
  validationAbortSignal?: AbortSignal
) {
  const { implicitTags, nonce, workStore } = ctx

  // Warmup SSR
  const initialClientPrerenderController = new AbortController()
  const initialClientReactController = new AbortController()
  const initialClientRenderController = new AbortController()
  const initialClientReactSignal =
    validationAbortSignal === undefined
      ? initialClientReactController.signal
      : AbortSignal.any([
          initialClientReactController.signal,
          validationAbortSignal,
        ])

  const preinitScripts = () => {}
  const { ServerInsertedHTMLProvider } = createServerInsertedHTML()

  let initialClientPrerenderStore: PrerenderStore
  if (storeType === 'prerender-client') {
    const store: PrerenderStoreModernClient = {
      type: 'prerender-client',
      phase: 'render',
      rootParams,
      fallbackRouteParams,
      implicitTags,
      renderSignal: initialClientRenderController.signal,
      controller: initialClientPrerenderController,
      // For HTML Generation the only cache tracked activity
      // is module loading, which has it's own cache signal
      cacheSignal: null,
      dynamicTracking: null,
      revalidate: INFINITE_CACHE,
      expire: INFINITE_CACHE,
      stale: INFINITE_CACHE,
      tags: [...implicitTags.tags],
      // TODO should this be removed from client stores?
      resumeDataCache: null,
      hmrRefreshHash: undefined,
      // Client prerenders don't track server param access
      varyParamsAccumulator: null,
    }
    initialClientPrerenderStore = store
  } else {
    const store: ValidationStoreClient = {
      type: 'validation-client',
      phase: 'render',
      rootParams,
      implicitTags,
      renderSignal: initialClientRenderController.signal,
      controller: initialClientPrerenderController,
      // For HTML Generation the only cache tracked activity
      // is module loading, which has it's own cache signal
      cacheSignal: null,
      dynamicTracking: null,
      revalidate: INFINITE_CACHE,
      expire: INFINITE_CACHE,
      stale: INFINITE_CACHE,
      tags: [...implicitTags.tags],
      // TODO should this be removed from client stores?
      resumeDataCache: null,
      hmrRefreshHash: undefined,
      // Client prerenders don't track server param access
      varyParamsAccumulator: null,
      // We're not rendering any validation boundaries yet.
      boundaryState: null,
      validationSamples,
      validationSampleTracking,
      fallbackRouteParams,
    }
    initialClientPrerenderStore = store
  }

  // TODO: maybe conditionally switch between runtime chunks and all chunks?
  // but warming too much should always be fine, just not always necessary
  const serverStream = createNodeStreamWithLateRelease(
    partialServerChunks,
    allServerChunks,
    initialClientReactSignal
  )

  const pendingInitialClientResult = workUnitAsyncStorage.run(
    initialClientPrerenderStore,
    getClientPrerender,
    // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- React Client
    <App
      reactServerStream={serverStream}
      reactDebugStream={undefined}
      debugEndTime={undefined}
      preinitScripts={preinitScripts}
      ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
      nonce={nonce}
      images={ctx.renderOpts.images}
    />,
    {
      signal: initialClientReactSignal,
      onError: (err: unknown) => {
        const digest = getDigestForWellKnownError(err)

        if (digest) {
          return digest
        }

        if (isReactLargeShellError(err)) {
          // TODO: Aggregate
          console.error(err)
          return undefined
        }

        if (initialClientReactSignal.aborted) {
          // These are expected errors that might error the prerender. we ignore them.
        } else if (
          process.env.NEXT_DEBUG_BUILD ||
          process.env.__NEXT_VERBOSE_LOGGING
        ) {
          // We don't normally log these errors because we are going to retry anyway but
          // it can be useful for debugging Next.js itself to get visibility here when needed
          printDebugThrownValueForProspectiveRender(
            err,
            workStore.route,
            Phase.ProspectiveRender
          )
        }
      },
      // We don't need bootstrap scripts in this prerender
      // bootstrapScripts: [bootstrapScript],
    }
  )

  // The listener to abort our own render controller must be added after React
  // has added its listener, to ensure that pending I/O is not
  // aborted/rejected too early.
  initialClientReactSignal.addEventListener(
    'abort',
    () => {
      initialClientRenderController.abort()
    },
    { once: true }
  )

  pendingInitialClientResult.catch((err: unknown) => {
    if (initialClientReactSignal.aborted || isPrerenderInterruptedError(err)) {
      // These are expected errors that might error the prerender. we ignore them.
    } else if (
      process.env.NEXT_DEBUG_BUILD ||
      process.env.__NEXT_VERBOSE_LOGGING
    ) {
      // We don't normally log these errors because we are going to retry anyway but
      // it can be useful for debugging Next.js itself to get visibility here when needed
      printDebugThrownValueForProspectiveRender(
        err,
        workStore.route,
        Phase.ProspectiveRender
      )
    }
  })

  // This is mostly needed for dynamic `import()`s in client components.
  // Promises passed to client were already awaited above (assuming that they came from cached functions)
  const cacheSignal = new CacheSignal()
  trackPendingModules(cacheSignal)
  await cacheSignal.cacheReady()
  workUnitAsyncStorage.run(
    initialClientPrerenderStore,
    initialClientReactController.abort.bind(initialClientReactController)
  )
}

async function validateStagedShell(
  stageChunks: Array<Uint8Array>,
  allServerChunks: Array<Uint8Array>,
  debugChunks: null | Array<Uint8Array>,
  debugEndTime: number | undefined,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  allowEmptyStaticShell: boolean,
  ctx: ValidationRenderContext,
  hmrRefreshHash: string | undefined,
  trackDynamicHole:
    | typeof trackDynamicHoleInStaticShell
    | typeof trackDynamicHoleInRuntimeShell,
  validationAbortSignal: AbortSignal
): Promise<Array<unknown>> {
  const { implicitTags, nonce, workStore } = ctx

  const clientDynamicTracking = createDynamicTrackingState(
    false //isDebugDynamicAccesses
  )
  const clientReactController = new AbortController()
  const clientRenderController = new AbortController()
  const clientReactSignal = AbortSignal.any([
    clientReactController.signal,
    validationAbortSignal,
  ])

  const preinitScripts = () => {}
  const { ServerInsertedHTMLProvider } = createServerInsertedHTML()

  const finalClientPrerenderStore: PrerenderStore = {
    type: 'prerender-client',
    phase: 'render',
    rootParams,
    fallbackRouteParams,
    implicitTags,
    renderSignal: clientRenderController.signal,
    controller: clientReactController,
    // No APIs require a cacheSignal through the workUnitStore during the HTML prerender
    cacheSignal: null,
    dynamicTracking: clientDynamicTracking,
    revalidate: INFINITE_CACHE,
    expire: INFINITE_CACHE,
    stale: INFINITE_CACHE,
    tags: [...implicitTags.tags],
    // TODO should this be removed from client stores?
    resumeDataCache: null,
    hmrRefreshHash,
    // Client prerenders don't track server param access
    varyParamsAccumulator: null,
  }

  const dynamicValidation = createDynamicValidationState()

  const serverStream = createNodeStreamWithLateRelease(
    stageChunks,
    allServerChunks,
    clientReactSignal
  )

  const debugChannelClient = debugChunks
    ? createNodeStreamWithLateRelease(
        debugChunks,
        debugChunks,
        clientReactSignal
      )
    : undefined

  try {
    let { prelude: unprocessedPrelude } = await runInSequentialTasks(
      () => {
        const pendingFinalClientResult = workUnitAsyncStorage.run(
          finalClientPrerenderStore,
          getClientPrerender,
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- React Client
          <App
            reactServerStream={serverStream}
            reactDebugStream={debugChannelClient}
            debugEndTime={debugEndTime}
            preinitScripts={preinitScripts}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />,
          {
            signal: clientReactSignal,
            onError: (err: unknown, errorInfo: ErrorInfo) => {
              if (
                isPrerenderInterruptedError(err) ||
                clientReactSignal.aborted
              ) {
                const componentStack = errorInfo.componentStack
                if (typeof componentStack === 'string') {
                  trackDynamicHole(
                    err,
                    workStore,
                    componentStack,
                    dynamicValidation,
                    clientDynamicTracking
                  )
                }
                return
              }

              if (isReactLargeShellError(err)) {
                // TODO: Aggregate
                console.error(err)
                return undefined
              }

              return getDigestForWellKnownError(err)
            },
            // We don't need bootstrap scripts in this prerender
            // bootstrapScripts: [bootstrapScript],
          }
        )

        // The listener to abort our own render controller must be added after
        // React has added its listener, to ensure that pending I/O is not
        // aborted/rejected too early.
        clientReactSignal.addEventListener(
          'abort',
          () => {
            clientRenderController.abort()
          },
          { once: true }
        )

        return pendingFinalClientResult
      },
      () => {
        workUnitAsyncStorage.run(
          finalClientPrerenderStore,
          clientReactController.abort.bind(clientReactController)
        )
      }
    )

    const { preludeIsEmpty } = await processPreludeOp(unprocessedPrelude)
    return getStaticShellDisallowedDynamicReasons(
      workStore,
      preludeIsEmpty ? PreludeState.Empty : PreludeState.Full,
      dynamicValidation,
      allowEmptyStaticShell
    )
  } catch (thrownValue) {
    // Even if the root errors we still want to report any cache components errors
    // that were discovered before the root errored.
    let errors: Array<unknown> = getStaticShellDisallowedDynamicReasons(
      workStore,
      PreludeState.Errored,
      dynamicValidation,
      allowEmptyStaticShell
    )

    if (process.env.NEXT_DEBUG_BUILD || process.env.__NEXT_VERBOSE_LOGGING) {
      errors.unshift(
        'During dynamic validation the root of the page errored. The next logged error is the thrown value. It may be a duplicate of errors reported during the normal development mode render.',
        thrownValue
      )
    }

    return errors
  }
}

/**
 * Validates instant configs by iterating URL depths from deepest to
 * shallowest. At each depth, builds a combined payload where segments
 * above the boundary use Dynamic stage (already mounted) and segments
 * below use Static/Runtime stage (being prefetched). If the new subtree
 * contains any `instant` configs, the payload is rendered to
 * detect dynamic holes without Suspense.
 */
async function validateInstantConfigs(
  prefetchMode: PrefetchingMode,
  accumulatedChunks: AccumulatedStreamChunks,
  debugChunks: null | Array<Uint8Array>,
  startTime: number,
  stageEndTimes: StageEndTimes,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  ctx: ValidationRenderContext,
  hmrRefreshHash: string | undefined,
  validationSamples: ValidationStoreClient['validationSamples'] | null,
  devRenderDidError: boolean,
  validationAbortSignal?: AbortSignal
): Promise<Array<unknown>> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  const {
    createCombinedPayloadAtDepth,
    createCombinedPayloadStream,
    collectStagedSegmentData,
    discoverValidationDepths,
    ValidationPrefetchKind,
  } = ctx.componentMod.InstantValidation()!

  const { createValidationSampleTracking } =
    require('./instant-validation/instant-samples') as typeof import('./instant-validation/instant-samples')

  debug?.('\nStarting depth-based instant validation...')

  const prefetchKind =
    prefetchMode === PrefetchingMode.Partial
      ? ValidationPrefetchKind.Shell
      : ValidationPrefetchKind.LegacySpeculative

  const loaderTree = ctx.componentMod.routeModule.userland.loaderTree

  const clientReferenceManifest = getClientReferenceManifest()

  const renderFlightStream = process.env.__NEXT_USE_NODE_STREAMS
    ? renderToNodeFlightStream
    : renderToWebFlightStream
  const createDebugChannel = process.env.__NEXT_USE_NODE_STREAMS
    ? createNodeDebugChannel
    : createWebDebugChannel

  const { cache, payload: initialRscPayload } = await collectStagedSegmentData(
    prefetchKind,
    ctx.componentMod,
    renderFlightStream,
    accumulatedChunks,
    debugChunks,
    startTime,
    stageEndTimes,
    clientReferenceManifest,
    createDebugChannel
  )

  const { implicitTags, nonce, workStore, isDebugChannelEnabled } = ctx

  async function validateAtDepth(
    depth: number,
    groupDepthForValidation: number
  ): Promise<null | NavigationValidationResult> {
    return validateAtDepthImpl(depth, groupDepthForValidation, null)
  }

  async function validateAtDepthImpl(
    depth: number,
    groupDepthForValidation: number,
    previousBoundaryState: null | ValidationBoundaryTracking
  ): Promise<null | NavigationValidationResult> {
    if (validationAbortSignal?.aborted) {
      return null
    }

    const extraChunksController = new AbortController()
    const extraChunksSignal =
      validationAbortSignal === undefined
        ? extraChunksController.signal
        : AbortSignal.any([extraChunksController.signal, validationAbortSignal])

    const boundaryState = createValidationBoundaryTracking()
    let useRuntimeStageForPartialSegments = false
    if (previousBoundaryState) {
      // We're doing a followup render to better discriminate error types
      useRuntimeStageForPartialSegments = true
      for (const [id, filePath] of previousBoundaryState.requiredIds) {
        boundaryState.requiredIds.set(id, filePath)
      }
    }

    const payloadResult = await createCombinedPayloadAtDepth(
      prefetchKind,
      initialRscPayload,
      cache,
      loaderTree,
      ctx.getDynamicParamFromSegment,
      ctx.query,
      depth,
      groupDepthForValidation,
      extraChunksSignal,
      boundaryState,
      clientReferenceManifest,
      useRuntimeStageForPartialSegments
    )

    if (payloadResult === null) {
      return null
    }

    const reactController = new AbortController()
    const renderController = new AbortController()
    const reactSignal =
      validationAbortSignal === undefined
        ? reactController.signal
        : AbortSignal.any([reactController.signal, validationAbortSignal])
    const preinitScripts = () => {}
    const { ServerInsertedHTMLProvider } = createServerInsertedHTML()

    const { stream: serverStream, debugStream } =
      await createCombinedPayloadStream(
        ctx.componentMod,
        renderFlightStream,
        payloadResult.payload,
        extraChunksController,
        reactSignal,
        clientReferenceManifest,
        startTime,
        isDebugChannelEnabled,
        createDebugChannel
      )

    const instantValidationState = createInstantValidationState(
      payloadResult.slotStacks
    )

    const validationSampleTracking =
      validationSamples !== null ? createValidationSampleTracking() : null

    const clientDynamicTracking = createDynamicTrackingState(false)

    const prerenderStore: PrerenderStore = {
      type: 'validation-client',
      phase: 'render',
      rootParams,
      implicitTags,
      renderSignal: renderController.signal,
      controller: reactController,
      cacheSignal: null,
      dynamicTracking: clientDynamicTracking,
      revalidate: INFINITE_CACHE,
      expire: INFINITE_CACHE,
      stale: INFINITE_CACHE,
      tags: [...implicitTags.tags],
      resumeDataCache: null,
      hmrRefreshHash,
      varyParamsAccumulator: null,
      boundaryState,
      fallbackRouteParams,
      validationSamples,
      validationSampleTracking,
    }

    let dynamicHoleKind: DynamicHoleKind
    switch (prefetchKind) {
      case ValidationPrefetchKind.Shell: {
        dynamicHoleKind = payloadResult.hasAmbiguousErrors
          ? DynamicHoleKind.Link
          : DynamicHoleKind.Dynamic
        break
      }
      case ValidationPrefetchKind.LegacySpeculative: {
        dynamicHoleKind = payloadResult.hasAmbiguousErrors
          ? DynamicHoleKind.Runtime
          : DynamicHoleKind.Dynamic
        break
      }
    }

    let result: NavigationValidationResult
    try {
      const { prelude: unprocessedPrelude } = await runInSequentialTasks(
        () => {
          const pendingResult = workUnitAsyncStorage.run(
            prerenderStore,
            getClientPrerender,
            // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- React Client
            <App
              reactServerStream={serverStream}
              reactDebugStream={debugStream ?? undefined}
              debugEndTime={undefined}
              preinitScripts={preinitScripts}
              ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
              nonce={nonce}
              images={ctx.renderOpts.images}
            />,
            {
              signal: reactSignal,
              onError: (err: unknown, errorInfo: ErrorInfo) => {
                if (isPrerenderInterruptedError(err) || reactSignal.aborted) {
                  const componentStack = errorInfo.componentStack
                  if (typeof componentStack === 'string') {
                    trackDynamicHoleInNavigation(
                      err,
                      workStore,
                      componentStack,
                      instantValidationState,
                      clientDynamicTracking,
                      dynamicHoleKind,
                      boundaryState
                    )
                  }
                  return
                } else if (!reactSignal.aborted) {
                  const componentStack = errorInfo.componentStack
                  if (typeof componentStack === 'string') {
                    let errorForDisplay = err
                    if (process.env.NODE_ENV === 'production') {
                      // In production (i.e. build validation), Flight omits everything except the digest
                      // when serializing errors, which makes them very unfriendly for debugging.
                      // Map the deserialized errors back to their original error object to make it more useful.
                      if (
                        err &&
                        typeof err === 'object' &&
                        'digest' in err &&
                        typeof err.digest === 'string'
                      ) {
                        const serverError =
                          workStore.reactServerErrorsByDigest.get(err.digest)
                        if (serverError !== undefined) {
                          errorForDisplay = serverError
                        }
                      }
                    }

                    trackThrownErrorInNavigation(
                      workStore,
                      instantValidationState,
                      errorForDisplay,
                      componentStack
                    )
                  }
                }

                if (isReactLargeShellError(err)) {
                  console.error(err)
                  return undefined
                }

                return getDigestForWellKnownError(err)
              },
            }
          )

          reactSignal.addEventListener(
            'abort',
            () => {
              renderController.abort()
            },
            { once: true }
          )

          return pendingResult
        },
        () => {
          workUnitAsyncStorage.run(
            prerenderStore,
            reactController.abort.bind(reactController)
          )
        }
      )

      const { preludeIsEmpty } = await processPreludeOp(unprocessedPrelude)

      result = getNavigationDisallowedDynamicReasons(
        workStore,
        preludeIsEmpty ? PreludeState.Empty : PreludeState.Full,
        instantValidationState,
        validationSampleTracking,
        boundaryState,
        devRenderDidError
      )
    } catch (thrownValue) {
      result = getNavigationDisallowedDynamicReasons(
        workStore,
        PreludeState.Errored,
        instantValidationState,
        validationSampleTracking,
        boundaryState,
        devRenderDidError
      )
    }

    // If the prerender produced no real errors at this depth — either an
    // empty array (clean) or a deferred-only result (Error/AggregateError
    // representing a missing-boundary fallback) — there's nothing to
    // discriminate. Pass it up so the outer loop can hold any deferred
    // fallback back until every depth has been tried.
    if (!Array.isArray(result) || result.length === 0) {
      return result
    }

    if (previousBoundaryState === null && payloadResult.hasAmbiguousErrors) {
      // This is the first validation attempt. we prepared a payload where dynamic holes might be runtime data dependencies
      // or dynamic data dependencies. We do a followup validation using a payload with only Runtime segments to discriminate
      if (
        validationAbortSignal !== undefined &&
        !(await yieldToForegroundRequest(validationAbortSignal))
      ) {
        return []
      }

      const dynamicOnlyResult = await validateAtDepthImpl(
        depth,
        groupDepthForValidation,
        boundaryState
      )

      if (Array.isArray(dynamicOnlyResult) && dynamicOnlyResult.length > 0) {
        // The dynamic errors only validation found errors to report so we favor those
        return dynamicOnlyResult
      }
    }

    // If we didn't return some other errors at this point the only thing to return is this validation's result
    return result
  }

  // Discover validation depth bounds from the LoaderTree. The array
  // length is the max URL depth; each entry is the max group depth
  // (route group segments) between that URL depth and the next.
  const groupDepthsByUrlDepth = discoverValidationDepths(loaderTree)
  const maxDepth = groupDepthsByUrlDepth.length

  let impairedValidation: null | Error | AggregateError = null

  for (let depth = maxDepth - 1; depth >= 0; depth--) {
    const maxGroupDepth = groupDepthsByUrlDepth[depth]

    for (
      let currentGroupDepth = maxGroupDepth;
      currentGroupDepth >= 0;
      currentGroupDepth--
    ) {
      const debugKind = ValidationPrefetchKind[prefetchKind]
      debug?.(
        `Trying ${debugKind} at depth ${depth}` +
          (currentGroupDepth > 0
            ? ` + groupDepth ${currentGroupDepth}...`
            : '...')
      )

      if (
        validationAbortSignal !== undefined &&
        !(await yieldToForegroundRequest(validationAbortSignal))
      ) {
        return []
      }

      const result = await validateAtDepth(depth, currentGroupDepth)

      if (Array.isArray(result)) {
        const errors: Array<Error> = result
        // Validation completed at least partially.
        if (errors.length > 0) {
          // There were issues with producing an instant UI for this attempted navigation
          debug?.(
            `  ${debugKind} at depth ${depth}+${currentGroupDepth}: ❌ Failed (${errors.length} errors)`
          )
          return errors
        } else {
          // There is nothing blocking instant UI for this simluated navigation
          debug?.(
            `  ${debugKind} at depth ${depth}+${currentGroupDepth}: ✅ Passed`
          )
        }
      } else if (result === null) {
        // There was no validation to perform at this level
        debug?.(`  No config at depth ${depth}+${currentGroupDepth}, skipping.`)
      } else {
        // Something prevented this level from fully validating but there
        // were no detected errors. Always overwrite — prefer the
        // shallowest deferred fallback. If a high-level layout drops
        // children, everything below is unreachable; the shallowest
        // unrendered segment is closest to the actual cause.
        impairedValidation = result
      }
    }
  }

  if (impairedValidation) {
    debug?.(
      `⏸ All depths passed without real errors; surfacing deferred missing-boundary fallback`
    )
    if (impairedValidation instanceof AggregateError) {
      // There is at least one potential cause of the validation blocking
      return impairedValidation.errors
    } else {
      // There was no known cause but we report something anyway
      return [impairedValidation]
    }
  }

  debug?.(`✅ All depths passed`)
  return []
}

/**
 * Two-pass render for build-time instant validation.
 * The flow is similar to `renderWithRestartOnCacheMissInDev`: pass 1 warms caches,
 * pass 2 renders with warm caches. If pass 1 has no cache misses,
 * its result is returned directly.
 *
 * Differences from `renderWithRestartOnCacheMissInDev`:
 * - both renders are abortable: if we know that we can't use a stream, we can just
 *   throw it away, we don't have to render a complete result.
 * - We don't need to tee the stream, we only care about accumulating chunks.
 */
async function renderWithRestartOnCacheMissInValidation(
  prefetchMode: PrefetchingMode,
  ctx: AppRenderContext,
  initialRequestStore: RequestStore,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  createOnError: (
    signal: AbortSignal,
    isRestart: boolean
  ) => (error: unknown) => void,
  prefilledDataCache: RenderResumeDataCache | null
): Promise<{
  accumulatedChunksPromise: Promise<AccumulatedStreamChunks>
  startTime: number
  stageController: StagedRenderingController
  requestStore: RequestStore
}> {
  const { componentMod: ComponentMod } = ctx
  const shouldRenderAppShell = prefetchMode === PrefetchingMode.Partial

  const { clientModules } = getClientReferenceManifest()
  const renderFlightStream = process.env.__NEXT_USE_NODE_STREAMS
    ? renderToNodeFlightStream
    : renderToWebFlightStream

  let startTime = -Infinity
  let requestStore: RequestStore = initialRequestStore

  //===============================================
  // Initial render (prospective — may warm caches)
  //===============================================

  const cacheSignal = new CacheSignal()
  trackPendingModules(cacheSignal)

  // The prerender we rean before the validation probably already filled some caches,
  // so we want to save work and re-use them.
  const prerenderResumeDataCache = prefilledDataCache
    ? createPrerenderResumeDataCache(prefilledDataCache)
    : createPrerenderResumeDataCache()

  const initialReactController = new AbortController()
  const initialDataController = new AbortController()

  const initialAbandonController = new AbortController()
  const initialStageController = new StagedRenderingController({
    abortSignal: initialDataController.signal,
    abandonController: initialAbandonController,
    syncIO: getSyncIOMode(prefetchMode),
    finalStage: null,
  })

  requestStore.resumeDataCache = prerenderResumeDataCache
  requestStore.stagedRendering = initialStageController
  requestStore.needsAppShell = shouldRenderAppShell
  requestStore.hasIncompatibleShellContent = false
  requestStore.cacheSignal = cacheSignal
  requestStore.asyncApiPromises = createAsyncApiPromises(
    initialStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )
  // We don't set `requestStore.controller and requestStore.renderSignal here.
  // Right now, we only abort for sync IO, and in the first render, that's just a restart
  // (after waiting for caches)
  requestStore.controller = undefined
  requestStore.renderSignal = undefined

  const initialRscPayload = await getPayload(requestStore)

  const advanceStageIfNoCacheMiss = (
    stage: Parameters<StagedRenderingController['advanceStage']>[0]
  ) => {
    if (initialAbandonController.signal.aborted === true) {
      return
    } else if (cacheSignal.hasPendingReads()) {
      initialAbandonController.abort()
    } else {
      initialStageController.advanceStage(stage)
    }
  }

  const initialResult = await runInSequentialTasks(
    () => {
      initialStageController.advanceStage(RenderStage.ShellStatic)
      startTime = performance.now() + performance.timeOrigin

      const stream = workUnitAsyncStorage.run(
        requestStore,
        renderFlightStream,
        ComponentMod,
        initialRscPayload,
        clientModules,
        {
          onError: createOnError(initialReactController.signal, false),
          startTime,
          filterStackFrame,
          signal: initialReactController.signal,
        }
      )

      initialReactController.signal.addEventListener(
        'abort',
        () => {
          const { reason } = initialReactController.signal
          initialDataController.abort(reason)
        },
        { once: true }
      )

      const accumulatedChunksPromise = accumulateStreamChunks(
        stream,
        initialStageController,
        initialDataController.signal
      )
      accumulatedChunksPromise.catch(() => {})
      return { accumulatedChunksPromise }
    },
    () => {
      advanceStageIfNoCacheMiss(RenderStage.Static)
    },
    () => {
      advanceStageIfNoCacheMiss(RenderStage.ShellRuntime)
    },
    () => {
      advanceStageIfNoCacheMiss(RenderStage.Runtime)
    },
    () => {
      advanceStageIfNoCacheMiss(RenderStage.Dynamic)
    }
  )

  if (initialStageController.currentStage !== RenderStage.Abandoned) {
    // No cache misses. Use the result as-is.
    return {
      accumulatedChunksPromise: initialResult.accumulatedChunksPromise,
      startTime,
      stageController: initialStageController,
      requestStore,
    }
  }

  // Cache miss. Wait for caches to fill, then re-render with warm caches.
  await cacheSignal.cacheReady()
  workUnitAsyncStorage.run(
    requestStore,
    initialReactController.abort.bind(initialReactController)
  )

  //===============================================
  // Final render (restarted, with warm caches)
  //===============================================

  requestStore = createRequestStore()

  // Unlike dev, where we're re-using the render that'll be visible in the browser,
  // we *can* abort the validation render.

  const finalReactController = new AbortController()
  const finalDataController = new AbortController()
  const finalStageController = new StagedRenderingController({
    abortSignal: finalDataController.signal,
    abandonController: null,
    syncIO: getSyncIOMode(prefetchMode),
    finalStage: null,
  })

  requestStore.resumeDataCache = createRenderResumeDataCache(
    prerenderResumeDataCache
  )
  requestStore.stagedRendering = finalStageController
  requestStore.needsAppShell = shouldRenderAppShell
  requestStore.hasIncompatibleShellContent = false
  requestStore.cacheSignal = null
  requestStore.asyncApiPromises = createAsyncApiPromises(
    finalStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )
  // Right now, we only abort for sync IO.
  // If sync IO occurs in a place where it's not allowed, then we have to fail validation,
  // and we can abort the render immediately, without waiting for anything else..
  requestStore.controller = finalReactController
  requestStore.renderSignal = finalDataController.signal

  const finalRscPayload = await getPayload(requestStore)

  const finalResult = await runInSequentialTasks(
    () => {
      finalStageController.advanceStage(RenderStage.ShellStatic)
      startTime = performance.now() + performance.timeOrigin

      const stream = workUnitAsyncStorage.run(
        requestStore,
        renderFlightStream,
        ComponentMod,
        finalRscPayload,
        clientModules,
        {
          onError: createOnError(finalReactController.signal, true),
          startTime,
          filterStackFrame,
          signal: finalReactController.signal,
        }
      )

      finalReactController.signal.addEventListener(
        'abort',
        () => {
          finalDataController.abort(finalReactController.signal.reason)
        },
        { once: true }
      )

      const accumulatedChunksPromise = accumulateStreamChunks(
        stream,
        finalStageController,
        null
      )
      accumulatedChunksPromise.catch(() => {})

      return {
        accumulatedChunksPromise,
      }
    },
    () => finalStageController.advanceStage(RenderStage.Static),
    () => finalStageController.advanceStage(RenderStage.ShellRuntime),
    () => finalStageController.advanceStage(RenderStage.Runtime),
    () => finalStageController.advanceStage(RenderStage.Dynamic)
  )

  return {
    accumulatedChunksPromise: finalResult.accumulatedChunksPromise,
    startTime,
    stageController: finalStageController,
    requestStore,
  }
}

async function validateInstantConfigsInBuild(
  ctx: AppRenderContext,
  prefilledDataCache: RenderResumeDataCache | null
): Promise<void> {
  const run = async () => {
    let success: boolean
    try {
      // The validation renders are separate renders, and use a separate WorkStore.
      // However, we defensively exit the existing workStore to avoid relying on something from there
      // before we shadow it.
      success = await workAsyncStorage.exit(async () =>
        validateInstantConfigsInBuildImpl(ctx, prefilledDataCache)
      )
    } catch (err) {
      console.error(
        new InvariantError(
          'An unexpected error occurred during instant validation',
          { cause: err }
        )
      )
      success = false
    }
    if (!success) {
      console.error('Stopping prerender due to instant validation errors.')
      throw new StaticGenBailoutError()
    }
  }

  if (process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION) {
    // In tests, we use these markers to extract the relevant portion of the CLI logs.
    // We want consistent ordering of these messages and other console.error calls,
    // so we use console.error here as well. Using console.log leads to non-deterministic
    // log order, likely stdout/stderr can interleave in non-deterministic ways.
    const requestId = String(Date.now())
    const route = ctx.workStore.route
    console.error(
      formatValidationEvent({ type: 'validation_start', requestId, url: route })
    )
    try {
      return await run()
    } finally {
      console.error(
        formatValidationEvent({ type: 'validation_end', requestId, url: route })
      )
    }
  } else {
    return await run()
  }
}

/**
 * Runs instant validation at build time using the `samples` from `instant`.
 *
 * For each sample, this creates a staged RSC render with a synthetic `RequestStore`
 * populated from sample data, then feeds the accumulated chunks to
 * `validateInstantConfigs` which handles the actual validation.
 */
async function validateInstantConfigsInBuildImpl(
  ctx: AppRenderContext,
  prefilledDataCache: RenderResumeDataCache | null
): Promise<boolean> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  const { workStore: outerWorkStore } = ctx
  const route = outerWorkStore.route

  const loaderTree = ctx.componentMod.routeModule.userland.loaderTree
  let samples = await resolveInstantConfigSamplesForPage(loaderTree)
  if (!samples || samples.length === 0) {
    // No samples defined; use a single empty sample to still run validation
    samples = [{}]
  }
  debug?.('Resolved samples:', samples)

  const allPossibleFallbackRouteParams = getFallbackRouteParams(
    route,
    ctx.componentMod.routeModule
  )

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const sample = samples[sampleIndex]
    debug?.(`Validating sample (${sampleIndex + 1}/${samples.length}):`, sample)

    let errors: unknown[]
    try {
      errors = await consoleAsyncStorage.run({ dim: true }, () =>
        validateInstantConfigInBuildWithSample(
          ctx,
          sample,
          allPossibleFallbackRouteParams,
          prefilledDataCache
        )
      )
    } catch (err) {
      if (isInstantValidationError(err)) {
        errors = [err]
      } else {
        throw err
      }
    }

    if (errors.length > 0) {
      debug?.(`❌ Sample failed validation (${errors.length} errors)`)
      const sampleDesc =
        samples.length > 1
          ? ` (sample ${sampleIndex + 1} of ${samples.length})`
          : ''
      for (const err of errors) {
        console.error(err)
      }
      console.error(
        `Build-time instant validation failed for route "${route}"${sampleDesc}.`
      )
      logBuildDebugHint(route)
      return false
    } else {
      debug?.('✅ Sample validated successfully')
    }
  }
  return true
}

async function validateInstantConfigInBuildWithSample(
  outerCtx: AppRenderContext,
  sample: InstantSample,
  allPossibleFallbackRouteParams: OpaqueFallbackRouteParams | null,
  prefilledDataCache: RenderResumeDataCache | null
): Promise<unknown[]> {
  // The flow for build mirrors what we do when validating in dev.
  // We have to perform a full dynamic render to get the RSC chunks for each stage.
  // In order to do that, we have to set up a mock AppRenderContext, workStore, and requestStore
  // based on the `sample` we're using.

  const { workStore: outerWorkStore } = outerCtx
  const loaderTree = outerCtx.componentMod.routeModule.userland.loaderTree
  const prefetchMode = await getPrefetchingModeForPage(
    outerCtx.renderOpts,
    loaderTree
  )

  const route = outerWorkStore.route

  const {
    createCookiesFromSample,
    createHeadersFromSample,
    createDraftModeForValidation,
    createRelativeURLFromSamples,
    createValidationSampleTracking,
  } =
    require('./instant-validation/instant-samples') as typeof import('./instant-validation/instant-samples')

  // TODO(instant-validation-build): it feels like this should happen higher up
  // and go through existing URL parsing/generation logic?
  const sampleUrl = createRelativeURLFromSamples(
    route,
    sample.params,
    sample.searchParams
  )

  const sampleParams = sample.params ?? {}
  let fallbackRouteParams: OpaqueFallbackRouteParams | null = null
  if (allPossibleFallbackRouteParams) {
    const fallbackRouteParamsMut = new Map()
    for (const [paramKey, value] of allPossibleFallbackRouteParams) {
      if (!(paramKey in sampleParams)) {
        fallbackRouteParamsMut.set(paramKey, value)
      }
    }
    fallbackRouteParams = fallbackRouteParamsMut
  }

  const getDynamicParamFromSegment = makeGetDynamicParamFromSegment(
    sampleParams,
    fallbackRouteParams,
    false
  )

  const sampleRootParams = getRootParams(loaderTree, getDynamicParamFromSegment)

  let sampleUrlWithoutQuery: Omit<ParsedRelativeUrl, 'query'>
  let sampleQuery: ParsedRelativeUrl['query']
  ;({ query: sampleQuery, ...sampleUrlWithoutQuery } = sampleUrl)

  const { AfterContext } =
    require('../after/after-context') as typeof import('../after/after-context')

  // NOTE: Matching the field order in `createWorkStore` to avoid deopting.
  const workStore: WorkStore = {
    page: outerWorkStore.page,
    route: outerWorkStore.route,
    requestStartTime: outerWorkStore.requestStartTime,
    incrementalCache: outerWorkStore.incrementalCache,
    cacheLifeProfiles: outerWorkStore.cacheLifeProfiles,
    useCacheTimeout: outerWorkStore.useCacheTimeout,
    staticPageGenerationTimeout: outerWorkStore.staticPageGenerationTimeout,
    isBuildTimePrerendering: false,
    fetchCache: outerWorkStore.fetchCache,
    isOnDemandRevalidate: false,
    requestId: outerWorkStore.requestId,
    htmlRequestId: outerWorkStore.htmlRequestId,

    isDraftMode: false,

    isPrefetchRequest: false,
    buildId: outerWorkStore.buildId,
    deploymentId: outerWorkStore.deploymentId,
    reactLoadableManifest: outerWorkStore.reactLoadableManifest,
    assetPrefix: outerWorkStore.assetPrefix,
    nonce: outerWorkStore.nonce,

    // Never run `after()` for this validation render. by definition, `after` can't affect the rendered output.
    afterContext: new AfterContext({
      waitUntil(promise) {
        promise.catch(() => {})
      },
      onClose() {},
      onTaskError() {},
    }),

    cacheComponentsEnabled: outerWorkStore.cacheComponentsEnabled,
    validationLevel: outerWorkStore.validationLevel,
    previouslyRevalidatedTags: [],
    refreshTagsByCacheKind: new Map(),
    runInCleanSnapshot: outerWorkStore.runInCleanSnapshot,
    shouldTrackFetchMetrics: false,
    reactServerErrorsByDigest: new Map(),
  }

  return workAsyncStorage.run(workStore, async () => {
    // NOTE: match field order in renderToHTMLOrFlightImpl to avoid deopts
    const validationCtx: AppRenderContext = {
      componentMod: outerCtx.componentMod,
      url: sampleUrlWithoutQuery,
      renderOpts: outerCtx.renderOpts,
      workStore,
      missingPrefetchHintPolicy: getMissingPrefetchHintPolicy(
        outerCtx.renderOpts.isBuildTimePrerendering ?? false,
        false,
        outerCtx.renderOpts.cacheComponents
      ),
      renderCapabilities: {
        isPossiblyPartialResponse: false,
        supportsPerSegmentPrefetching:
          outerCtx.renderCapabilities.supportsPerSegmentPrefetching,
      },
      parsedRequestHeaders: outerCtx.parsedRequestHeaders,
      getDynamicParamFromSegment,
      interpolatedParams: sampleParams,
      fallbackRouteParams,
      query: sampleQuery,
      isPrefetch: false,
      isPossibleServerAction: false,
      requestTimestamp: outerCtx.requestTimestamp,
      appUsingSizeAdjustment: outerCtx.appUsingSizeAdjustment,
      flightRouterState: undefined,
      requestId: outerCtx.requestId,
      htmlRequestId: outerCtx.htmlRequestId,
      pagePath: outerCtx.pagePath,
      assetPrefix: outerCtx.assetPrefix,
      isNotFoundPath: outerCtx.isNotFoundPath,
      nonce: outerCtx.nonce,
      res: outerCtx.res,
      sharedContext: outerCtx.sharedContext,
      implicitTags: outerCtx.implicitTags,
    }

    const validationSamples: InstantValidationSamples = {
      params: sample.params,
      searchParams: sample.searchParams,
    }

    const createRequestStore = (): RequestStore => {
      // Create exhaustive request data from sample
      const sampleCookies = createCookiesFromSample(sample.cookies, route)

      // We don't have to bother initializing these, pages can't access them anyway,
      // we just need them because RequestStore requires them.
      const unusedMutableCookies = new ResponseCookies(new Headers())

      // Create headers.
      const sampleHeaders = createHeadersFromSample(
        sample.headers,
        sample.cookies,
        route
      )

      const draftMode = createDraftModeForValidation()

      return {
        type: 'request',
        phase: 'render',
        implicitTags: outerCtx.implicitTags,
        url: {
          pathname: sampleUrl.pathname,
          search: sampleUrl.search,
        },
        headers: sampleHeaders,
        cookies: sampleCookies,
        mutableCookies: unusedMutableCookies,
        userspaceMutableCookies: unusedMutableCookies,
        draftMode,
        rootParams: sampleRootParams,
        validationSamples,
        validationSampleTracking: createValidationSampleTracking(),
        // This will be set when rendering
        resumeDataCache: null,
        stagedRendering: null,
        asyncApiPromises: undefined,
      }
    }

    // Track server errors. If one of them surfaces during the client render
    // in the deserialized form (with no message/stack) we'll use this to map it
    // back to the original.
    const onServerError = createReactServerErrorHandler(
      true, // shouldFormatError
      true, // isBuildTimePrerendering - disables tracing
      workStore.reactServerErrorsByDigest,
      () => {} // Don't report anything here. If needed, it will be reported in the client render.
    )

    const {
      accumulatedChunksPromise,
      startTime,
      stageController,
      requestStore: finalServerStore,
    } = await renderWithRestartOnCacheMissInValidation(
      prefetchMode,
      validationCtx,
      createRequestStore(),
      createRequestStore,
      (requestStore) =>
        workUnitAsyncStorage.run(
          requestStore,
          getRSCPayload,
          loaderTree,
          validationCtx,
          { is404: false, isPrerendering: true }
        ),
      (signal) =>
        function onError(err) {
          const digest = getDigestForWellKnownError(err)
          if (digest) {
            return digest
          }
          if (signal.aborted) {
            return
          }
          return onServerError(err)
        },
      prefilledDataCache
    )

    const accumulatedChunks = await accumulatedChunksPromise
    const endTimes = getStageEndTimes(stageController)
    const debugChunks = null // TODO(instant-validation-build): support debugChannel

    // Missing sample errors take priority over everything else,
    // because they prevent us from rendering everything we need to validate.
    const serverValidationSampleTracking =
      finalServerStore.validationSampleTracking!
    if (serverValidationSampleTracking.missingSampleErrors.length > 0) {
      return serverValidationSampleTracking.missingSampleErrors
    }

    // We also error for sync IO. This runs after the prerender,
    // so if we get sync IO errors here, they're likely from the runtime stage --
    // the prerender probably discovered sync IO in the static stage
    if (
      stageController.currentStage === RenderStage.Abandoned &&
      stageController.syncInterruptReason
    ) {
      return [stageController.syncInterruptReason]
    }

    // Now we the chunks of a fully rendered page, just like in dev.
    // We can use them to validate all the navigations required by `instant` configs.
    // Note that we're not performing static shell validation here -- that happens
    // implicitly as part of the static prerender.

    // The static prerender has warmed some client modules already,
    // but we'll be reaching Runtime/Dynamic stages and thus rendering more content,
    // so we need to warm again.
    // TODO(instant-validation-build): This might warm too much, possibly hitting errors on code that didn't expect
    // to run at build time. For example, we generally don't need to render leaf segments (e.g. __PAGE__) in
    // the Dynamic stage, they're Runtime at best.

    const warmupValidationSamplesTracking = createValidationSampleTracking()
    const validationRenderCtx = toValidationRenderContext(validationCtx)
    await warmupClientModulesForStagedValidation(
      'validation-client',
      accumulatedChunks[RenderStage.Dynamic],
      accumulatedChunks[RenderStage.Dynamic],
      sampleRootParams,
      fallbackRouteParams,
      validationRenderCtx,
      validationSamples,
      warmupValidationSamplesTracking
    )
    if (warmupValidationSamplesTracking.missingSampleErrors.length > 0) {
      return warmupValidationSamplesTracking.missingSampleErrors
    }

    return await validateInstantConfigs(
      prefetchMode,
      accumulatedChunks,
      debugChunks,
      startTime,
      endTimes,
      sampleRootParams,
      fallbackRouteParams,
      validationRenderCtx,
      undefined, // hmrRefreshHash,
      validationSamples,
      false // build has no shared dev render that would surface errors
    )
  })
}

type PrerenderToStreamResult = {
  stream: AnyStream
  digestErrorsMap: Map<string, DigestedError>
  ssrErrors: Array<unknown>
  dynamicAccess?: null | Array<DynamicAccess>
  collectedRevalidate: number
  collectedExpire: number
  collectedStale: number
  collectedTags: null | string[]
  renderResumeDataCache?: RenderResumeDataCache
}

async function continueStaticPrerenderWithInlinedData(
  htmlStream: AnyStream,
  reactServerResult: ReactServerPrerenderResult,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  createInlinedDataStream: typeof createWebInlinedDataStream,
  formState: unknown | null,
  nonce: string | undefined,
  getServerInsertedHTML: () => Promise<string>,
  getServerInsertedMetadata: () => Promise<string>,
  deploymentId: string | undefined,
  ComponentMod: AppPageModule,
  renderFlightStream: typeof renderToWebFlightStream,
  clientModules: Parameters<typeof renderToWebFlightStream>[2],
  filterStackFrameForError: typeof filterStackFrame,
  serverComponentsErrorHandler: (err: unknown) => string | undefined
): Promise<AnyStream> {
  const hasFallbackRouteParams =
    fallbackRouteParams && fallbackRouteParams.size > 0
  if (hasFallbackRouteParams) {
    // This is a "static fallback" prerender: although the page didn't
    // access any runtime params in a Server Component, it may have
    // accessed a runtime param in a client segment.
    //
    // TODO: If there were no client segments, we can use the fully static
    // path instead.
    //
    // Rather than use a dynamic server resume to fill in the params,
    // we can rely on the client to parse the params from the URL and use
    // that to hydrate the page.
    //
    // Send an empty InitialRSCPayload to the server component renderer
    // The data will be fetched by the client instead.
    // TODO: In the future, rather than defer the entire hydration payload
    // to be fetched by the client, we should only defer the client
    // segments, since those are the only ones whose data is not complete.
    const emptyReactServerResult =
      await createReactServerPrerenderResultFromRender(
        renderFlightStream(ComponentMod, [], clientModules, {
          filterStackFrame: filterStackFrameForError,
          onError: serverComponentsErrorHandler,
        })
      )
    const inlinedDataStream = createInlinedDataStream(
      emptyReactServerResult.consumeAsStream(),
      nonce,
      formState
    )
    return continueStaticFallbackPrerender(htmlStream, {
      inlinedDataStream,
      getServerInsertedHTML,
      getServerInsertedMetadata,
      deploymentId,
    })
  }

  const inlinedDataStream = createInlinedDataStream(
    reactServerResult.consumeAsStream(),
    nonce,
    formState
  )
  return continueStaticPrerender(htmlStream, {
    inlinedDataStream,
    getServerInsertedHTML,
    getServerInsertedMetadata,
    deploymentId,
  })
}

async function prerenderToStream(
  req: BaseNextRequest,
  res: BaseNextResponse,
  ctx: AppRenderContext,
  metadata: AppPageRenderResultMetadata,
  tree: LoaderTree,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
): Promise<PrerenderToStreamResult> {
  // When prerendering formState is always null. We still include it
  // because some shared APIs expect a formState value and this is slightly
  // more explicit than making it an optional function argument
  const formState = null

  const {
    assetPrefix,
    getDynamicParamFromSegment,
    implicitTags,
    nonce,
    pagePath,
    renderOpts,
    workStore,
  } = ctx

  const {
    basePath,
    buildManifest,
    ComponentMod,
    crossOrigin,
    experimental,
    isDebugDynamicAccesses,
    isBuildTimePrerendering = false,
    onInstrumentationRequestError,
    page,
    reactMaxHeadersLength,
    subresourceIntegrityManifest,
    cacheComponents,
  } = renderOpts

  const { cachedNavigations } = renderOpts.experimental

  const renderFlightStream = process.env.__NEXT_USE_NODE_STREAMS
    ? renderToNodeFlightStream
    : renderToWebFlightStream
  const renderFizzStream = process.env.__NEXT_USE_NODE_STREAMS
    ? renderToNodeFizzStream
    : renderToWebFizzStream
  const createInlinedDataStream = process.env.__NEXT_USE_NODE_STREAMS
    ? createNodeInlinedDataStream
    : createWebInlinedDataStream

  const allowEmptyStaticShell =
    (renderOpts.allowEmptyStaticShell ?? false) ||
    (await isPageAllowedToBlock(tree))

  const rootParams = getRootParams(tree, getDynamicParamFromSegment)

  const { ServerInsertedHTMLProvider, renderServerInsertedHTML } =
    createServerInsertedHTML()
  const getServerInsertedMetadata = createServerInsertedMetadata(nonce)

  const tracingMetadata = getTracedMetadata(
    getTracer().getTracePropagationData(),
    experimental.clientTraceMetadata
  )

  const polyfills: JSX.IntrinsicElements['script'][] =
    buildManifest.polyfillFiles
      .filter(
        (polyfill) =>
          polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
      )
      .map((polyfill) => ({
        src: `${assetPrefix}/_next/${polyfill}${getAssetQueryString(
          ctx,
          false
        )}`,
        integrity: subresourceIntegrityManifest?.[polyfill],
        crossOrigin,
        noModule: true,
        nonce,
      }))

  const [preinitScripts, bootstrapScript] = getRequiredScripts(
    buildManifest,
    // Why is assetPrefix optional on renderOpts?
    // @TODO make it default empty string on renderOpts and get rid of it from ctx
    assetPrefix,
    crossOrigin,
    subresourceIntegrityManifest,
    getAssetQueryString(ctx, true),
    nonce,
    page
  )

  let bootstrapScriptContent =
    buildManifest.pagesChunkGroupBootstrapParams &&
    buildManifest.chunkLoadingGlobal
      ? getTurbopackChunkGroupBootstrap(
          buildManifest.pagesChunkGroupBootstrapParams,
          buildManifest.chunkLoadingGlobal,
          [page]
        )
      : undefined

  // Instant Navigation Testing API: when exposed, embed the cookie-guarded
  // bootstrap into the prerendered prelude so the cached static shell carries
  // it and it runs before the client bootstrap module reads
  // self.__next_instant_test.
  if (renderOpts.experimental.exposeTestingApi) {
    bootstrapScriptContent =
      (bootstrapScriptContent ? `${bootstrapScriptContent};` : '') +
      (await getInstantTestBootstrapScriptContent())
  }

  // In development the static shell is served without a dynamic resume, so it
  // must carry the debug-channel request id (self.__next_r) itself for
  // app-index to initialize the HMR/debug channel. renderToStream provides this
  // for dynamic renders; prepend it here so it runs before the bootstrap
  // module.
  if (process.env.__NEXT_DEV_SERVER && bootstrapScriptContent) {
    bootstrapScriptContent =
      `self.__next_r=${JSON.stringify(ctx.requestId ?? crypto.randomUUID())};` +
      bootstrapScriptContent
  }

  const { reactServerErrorsByDigest } = workStore
  // We don't report errors during prerendering through our instrumentation hooks
  const reportErrors = !experimental.isRoutePPREnabled
  function onHTMLRenderRSCError(err: DigestedError, silenceLog: boolean) {
    if (reportErrors) {
      return onInstrumentationRequestError?.(
        err,
        req,
        createPrerenderErrorContext(ctx, 'react-server-components'),
        silenceLog
      )
    }
  }
  const serverComponentsErrorHandler = createReactServerErrorHandler(
    process.env.NODE_ENV === 'development',
    isBuildTimePrerendering,
    reactServerErrorsByDigest,
    onHTMLRenderRSCError
  )

  function onHTMLRenderSSRError(err: DigestedError) {
    if (reportErrors) {
      // We don't need to silence logs here. onHTMLRenderSSRError won't be
      // called at all if the error was logged before in the RSC error handler.
      const silenceLog = false
      return onInstrumentationRequestError?.(
        err,
        req,
        createPrerenderErrorContext(ctx, 'server-rendering'),
        silenceLog
      )
    }
  }
  const allCapturedErrors: Array<unknown> = []
  const htmlRendererErrorHandler = createHTMLErrorHandler(
    process.env.NODE_ENV === 'development',
    isBuildTimePrerendering,
    reactServerErrorsByDigest,
    allCapturedErrors,
    onHTMLRenderSSRError
  )

  let reactServerPrerenderResult: null | ReactServerPrerenderResult = null
  let reactServerPrerenderResultIsDynamic: null | boolean = null
  let reactServerResumeDataCache: ResumeDataCache | null = null
  let reactServerPrerenderStore: null | PrerenderStore = null
  const setMetadataHeader = (name: string) => {
    metadata.headers ??= {}
    metadata.headers[name] = res.getHeader(name)
  }
  const setHeader = (name: string, value: string | string[]) => {
    res.setHeader(name, value)
    setMetadataHeader(name)
    return res
  }
  const appendHeader = (name: string, value: string | string[]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        res.appendHeader(name, item)
      })
    } else {
      res.appendHeader(name, value)
    }
    setMetadataHeader(name)
  }

  const selectStaleTime = createSelectStaleTime(experimental)
  const { clientModules } = getClientReferenceManifest()

  let prerenderStore: PrerenderStore | null = null

  try {
    if (cacheComponents) {
      /**
       * cacheComponents with PPR
       *
       * The general approach is to render the RSC stream first allowing any cache reads to resolve.
       * Once we have settled all cache reads we restart the render and abort after a single Task.
       *
       * Unlike with the non PPR case we can't synchronously abort the render when a dynamic API is used
       * during the initial render because we need to ensure all caches can be filled as part of the initial Task
       * and a synchronous abort might prevent us from filling all caches.
       *
       * Once the render is complete we allow the SSR render to finish and use a combination of the postponed state
       * and the reactServerIsDynamic value to determine how to treat the resulting render
       */

      // The prerender controller represents the lifetime of the prerender. It
      // will be aborted when a task is complete or a synchronously aborting API
      // is called. Notably, during prospective prerenders, this does not
      // actually terminate the prerender itself, which will continue until all
      // caches are filled.
      const initialServerPrerenderController = new AbortController()

      // This controller is used to abort the React prerender.
      const initialServerReactController = new AbortController()

      // This controller represents the lifetime of the React prerender. Its
      // signal can be used for any I/O operation to abort the I/O and/or to
      // reject, when prerendering aborts. This includes our own hanging
      // promises for accessing request data, and for fetch calls. It might be
      // replaced in the future by React.cacheSignal(). It's aborted after the
      // React controller, so that no pending I/O can register abort listeners
      // that are called before React's abort listener is called. This ensures
      // that pending I/O is not rejected too early when aborting the prerender.
      // Notably, during the prospective prerender, it is different from the
      // prerender controller because we don't want to end the React prerender
      // until all caches are filled.
      const initialServerRenderController = new AbortController()

      // The cacheSignal helps us track whether caches are still filling or we are ready
      // to cut the render off.
      const cacheSignal = new CacheSignal()

      // If a prefilled immutable render resume data cache is provided, e.g.
      // when prerendering an optional fallback shell after having prerendered
      // pages with defined params, we use this instead of a mutable prerender
      // resume data cache.
      const resumeDataCache: ResumeDataCache =
        renderOpts.renderResumeDataCache ?? createPrerenderResumeDataCache()
      reactServerPrerenderResultIsDynamic = null
      reactServerResumeDataCache = resumeDataCache
      reactServerPrerenderStore = null

      const initialServerPayloadPrerenderStore: PrerenderStore = {
        type: 'prerender',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        // While this render signal isn't going to be used to abort a React render while getting the RSC payload
        // various request data APIs bind to this controller to reject after completion.
        renderSignal: initialServerRenderController.signal,
        // When we generate the RSC payload we might abort this controller due to sync IO
        // but we don't actually care about sync IO in this phase so we use a throw away controller
        // that isn't connected to anything
        controller: new AbortController(),
        stagedRendering: null, // We don't need staging in the initial render
        // During the initial prerender we need to track all cache reads to ensure
        // we render long enough to fill every cache it is possible to visit during
        // the final prerender.
        cacheSignal,
        dynamicTracking: null,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        resumeDataCache,
        hmrRefreshHash: undefined,
        // We don't track vary params during initial prerender, only the final one
        varyParamsAccumulator: null,
        runtimeDataAccessed: null,
        shouldAttemptStaticPrefetch: null,
        isFallbackUpgradeable: renderOpts.isFallbackUpgradeable === true,
      }

      // We're not going to use the result of this render because the only time it could be used
      // is if it completes in a microtask and that's likely very rare for any non-trivial app
      const initialServerPayload = await workUnitAsyncStorage.run(
        initialServerPayloadPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        { is404: res.statusCode === 404, isPrerendering: true }
      )

      const initialServerPrerenderStore: PrerenderStore = (prerenderStore = {
        type: 'prerender',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        renderSignal: initialServerRenderController.signal,
        controller: initialServerPrerenderController,
        stagedRendering: null, // We don't need staging in the initial render
        // During the initial prerender we need to track all cache reads to ensure
        // we render long enough to fill every cache it is possible to visit during
        // the final prerender.
        cacheSignal,
        dynamicTracking: null,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        resumeDataCache,
        hmrRefreshHash: undefined,
        // We don't track vary params during initial prerender, only the final one
        varyParamsAccumulator: null,
        runtimeDataAccessed: null,
        shouldAttemptStaticPrefetch: null,
        isFallbackUpgradeable: renderOpts.isFallbackUpgradeable === true,
      })

      const initialPrerenderOptions = {
        filterStackFrame,
        onError: (err: unknown) => {
          const digest = getDigestForWellKnownError(err)

          if (digest) {
            return digest
          }

          if (isReactLargeShellError(err)) {
            // TODO: Aggregate
            console.error(err)
            return undefined
          }

          if (initialServerPrerenderController.signal.aborted) {
            // The render aborted before this error was handled which indicates
            // the error is caused by unfinished components within the render
            return
          } else if (
            process.env.NEXT_DEBUG_BUILD ||
            process.env.__NEXT_VERBOSE_LOGGING
          ) {
            printDebugThrownValueForProspectiveRender(
              err,
              workStore.route,
              Phase.ProspectiveRender
            )
          }
        },
        // We don't want to stop rendering until the cacheSignal is complete so we pass
        // a different signal to this render call than is used by dynamic APIs to signify
        // transitioning out of the prerender environment
        signal: initialServerReactController.signal,
      }

      const pendingInitialServerResult = workUnitAsyncStorage.run(
        initialServerPrerenderStore,
        getServerPrerender(ComponentMod),
        initialServerPayload,
        clientModules,
        initialPrerenderOptions
      )

      // The listener to abort our own render controller must be added after
      // React has added its listener, to ensure that pending I/O is not
      // aborted/rejected too early.
      initialServerReactController.signal.addEventListener(
        'abort',
        () => {
          initialServerRenderController.abort()
          initialServerPrerenderController.abort()
        },
        { once: true }
      )

      // Wait for all caches to be finished filling and for async imports to resolve
      trackPendingModules(cacheSignal)
      await cacheSignal.cacheReady()

      initialServerReactController.abort()

      // We don't need to continue the prerender process if we already
      // detected invalid dynamic usage in the initial prerender phase.
      if (workStore.invalidDynamicUsageError) {
        logDisallowedDynamicError(workStore, workStore.invalidDynamicUsageError)
        throw new StaticGenBailoutError()
      }

      let initialServerResult
      try {
        initialServerResult = await createReactServerPrerenderResult(
          pendingInitialServerResult
        )
      } catch (err) {
        if (
          initialServerReactController.signal.aborted ||
          initialServerPrerenderController.signal.aborted
        ) {
          // These are expected errors that might error the prerender. we ignore them.
        } else if (
          process.env.NEXT_DEBUG_BUILD ||
          process.env.__NEXT_VERBOSE_LOGGING
        ) {
          // We don't normally log these errors because we are going to retry anyway but
          // it can be useful for debugging Next.js itself to get visibility here when needed
          printDebugThrownValueForProspectiveRender(
            err,
            workStore.route,
            Phase.ProspectiveRender
          )
        }
      }

      if (initialServerResult) {
        const initialClientPrerenderController = new AbortController()
        const initialClientReactController = new AbortController()
        const initialClientRenderController = new AbortController()

        const initialClientPrerenderStore: PrerenderStore = {
          type: 'prerender-client',
          phase: 'render',
          rootParams,
          fallbackRouteParams,
          implicitTags,
          renderSignal: initialClientRenderController.signal,
          controller: initialClientPrerenderController,
          // For HTML Generation the only cache tracked activity
          // is module loading, which has it's own cache signal
          cacheSignal: null,
          dynamicTracking: null,
          revalidate: INFINITE_CACHE,
          expire: INFINITE_CACHE,
          stale: INFINITE_CACHE,
          tags: [...implicitTags.tags],
          resumeDataCache,
          hmrRefreshHash: undefined,
          // Client prerenders don't track server param access
          varyParamsAccumulator: null,
        }

        const pendingInitialClientResult = workUnitAsyncStorage.run(
          initialClientPrerenderStore,
          getClientPrerender,
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx
          <App
            reactServerStream={initialServerResult.asUnclosingStream()}
            reactDebugStream={undefined}
            debugEndTime={undefined}
            preinitScripts={preinitScripts}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />,
          {
            signal: initialClientReactController.signal,
            onError: (err: unknown) => {
              const digest = getDigestForWellKnownError(err)

              if (digest) {
                return digest
              }

              if (isReactLargeShellError(err)) {
                // TODO: Aggregate
                console.error(err)
                return undefined
              }

              if (initialClientReactController.signal.aborted) {
                // These are expected errors that might error the prerender. we ignore them.
              } else if (
                process.env.NEXT_DEBUG_BUILD ||
                process.env.__NEXT_VERBOSE_LOGGING
              ) {
                // We don't normally log these errors because we are going to retry anyway but
                // it can be useful for debugging Next.js itself to get visibility here when needed
                printDebugThrownValueForProspectiveRender(
                  err,
                  workStore.route,
                  Phase.ProspectiveRender
                )
              }
            },
            bootstrapScriptContent,
            bootstrapScripts: [bootstrapScript],
          }
        )

        // The listener to abort our own render controller must be added after
        // React has added its listener, to ensure that pending I/O is not
        // aborted/rejected too early.
        initialClientReactController.signal.addEventListener(
          'abort',
          () => {
            initialClientRenderController.abort()
          },
          { once: true }
        )

        pendingInitialClientResult.catch((err: unknown) => {
          if (
            initialClientReactController.signal.aborted ||
            isPrerenderInterruptedError(err)
          ) {
            // These are expected errors that might error the prerender. we ignore them.
          } else if (
            process.env.NEXT_DEBUG_BUILD ||
            process.env.__NEXT_VERBOSE_LOGGING
          ) {
            // We don't normally log these errors because we are going to retry anyway but
            // it can be useful for debugging Next.js itself to get visibility here when needed
            printDebugThrownValueForProspectiveRender(
              err,
              workStore.route,
              Phase.ProspectiveRender
            )
          }
        })

        // This is mostly needed for dynamic `import()`s in client components.
        // Promises passed to client were already awaited above (assuming that they came from cached functions)
        trackPendingModules(cacheSignal)
        await cacheSignal.cacheReady()
        workUnitAsyncStorage.run(
          initialClientPrerenderStore,
          initialClientReactController.abort.bind(initialClientReactController)
        )
      }

      const finalServerReactController = new AbortController()
      const finalServerRenderController = new AbortController()

      const varyParamsAccumulator = createResponseVaryParamsAccumulator()

      const finalStageController = new StagedRenderingController({
        abortSignal: finalServerRenderController.signal,
        abandonController: null,
        syncIO: SyncIOMode.AllowedInDynamic,
        finalStage: RenderStage.Static,
      })

      // Records runtime data accesses from the payload and render stores
      // below into the RSC payload (as `u`), resolved `true` at the moment
      // of first access so the fulfillment row is serialized at the stream
      // position where it happened. Used when generating per-segment
      // prefetch responses. Request data props (params, searchParams) are
      // created while the RSC payload is constructed, under the payload
      // store; both stores share the same promise so it observes accesses
      // from both.
      const runtimeDataAccessed = createPromiseWithResolvers<boolean>()

      // Companion cell holding this prerender's static-prefetch measurement
      // directly — the value that becomes the route's build-constant hint:
      // starts true, and a disqualifying runtime-data access flips it false
      // — fallback-param accesses on an upgradeable route don't (see
      // trackRuntimeDataAccessed, which applies the rule at access time).
      // Read after the prerender settles by
      // collectSegmentData below. Shared between both stores for the same
      // reason as the promise.
      const shouldAttemptStaticPrefetch = { current: true }

      const finalServerPayloadPrerenderStore: PrerenderStoreModernServer = {
        type: 'prerender',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        // While this render signal isn't going to be used to abort a React render while getting the RSC payload
        // various request data APIs bind to this controller to reject after completion.
        renderSignal: finalServerRenderController.signal,
        // When we generate the RSC payload we might abort this controller due to sync IO
        // but we don't actually care about sync IO in this phase so we use a throw away controller
        // that isn't connected to anything
        controller: new AbortController(),
        // NOTE: we're not using the stage controller for sync IO tracking,
        // so this doesn't break the "throwaway abort controller" trick above.
        stagedRendering: finalStageController,
        // All caches we could read must already be filled so no tracking is necessary
        cacheSignal: null,
        dynamicTracking: null,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        resumeDataCache,
        hmrRefreshHash: undefined,
        varyParamsAccumulator,
        runtimeDataAccessed,
        shouldAttemptStaticPrefetch,
        isFallbackUpgradeable: renderOpts.isFallbackUpgradeable === true,
      }

      const shellByteLengthDeferred = createPromiseWithResolvers<
        number | null
      >()

      const finalServerPayload = await workUnitAsyncStorage.run(
        finalServerPayloadPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        {
          is404: res.statusCode === 404,
          isPrerendering: true,
          shellByteLengthPromise: shellByteLengthDeferred.promise,
        }
      )

      let staleTimeIterable: StaleTimeIterable | undefined
      if (cachedNavigations) {
        staleTimeIterable = new StaleTimeIterable()
        finalServerPayload.s = staleTimeIterable
      }

      // Embed the runtime data access tracking in the payload so
      // collectSegmentData can replay it per stage. Only needed when the
      // Flight data will be decomposed into segment prefetches below.
      finalServerPayload.u = runtimeDataAccessed.promise

      const serverDynamicTracking = createDynamicTrackingState(
        isDebugDynamicAccesses
      )
      let resultIsPartial = false

      const finalServerPrerenderStore: PrerenderStore = (prerenderStore = {
        type: 'prerender',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        renderSignal: finalServerRenderController.signal,
        controller: finalServerReactController,
        stagedRendering: finalStageController,
        // All caches we could read must already be filled so no tracking is necessary
        cacheSignal: null,
        dynamicTracking: serverDynamicTracking,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        resumeDataCache,
        hmrRefreshHash: undefined,
        varyParamsAccumulator,
        runtimeDataAccessed,
        shouldAttemptStaticPrefetch,
        isFallbackUpgradeable: renderOpts.isFallbackUpgradeable === true,
      })

      if (staleTimeIterable !== undefined) {
        trackStaleTime(
          finalServerPrerenderStore,
          staleTimeIterable,
          selectStaleTime
        )
      }

      const streamState = createStreamPendingState()
      const collectedChunks = createPrerenderChunksAccumulator()
      const collectedChunksByStage = createStageChunksAccumulator()
      const collectChunk = (chunk: Uint8Array) => {
        collectPrerenderChunk(
          collectedChunks,
          finalServerReactController.signal,
          chunk
        )
        collectStageChunk(
          collectedChunksByStage,
          finalStageController.currentStage,
          chunk
        )
      }

      let didHandleUnexpectedAbort = false
      /**
       * @returns - whether or not the task should be skipped
       * because the render was already aborted.
       * */
      const checkUnexpectedAbort = (): boolean => {
        if (finalServerReactController.signal.aborted) {
          // If the server controller is already aborted, then we must have encountered sync IO
          if (!didHandleUnexpectedAbort) {
            didHandleUnexpectedAbort = true
            onUnexpectedAbort()
          }
          return true
        }

        // Not aborted.
        return false
      }

      const onUnexpectedAbort = () => {
        resultIsPartial = true

        // FIXME(NAR-810): If we're already aborted due to Sync IO, there should be no need to
        // finish the accumulators. However, it seems like in `--debug-prerender`
        // the stream will stay open if we don't settle these here.
        if (process.env.NODE_ENV === 'development') {
          if (staleTimeIterable !== undefined) {
            staleTimeIterable.close()
          }
          runtimeDataAccessed.resolve(false)
          finishAccumulatingVaryParams(varyParamsAccumulator)
        }
      }

      let debugEndTime: number | undefined = undefined
      let didLinkDataUnblockNewContent = false

      await runInSequentialTasks(
        async () => {
          if (process.env.NODE_ENV === 'development') {
            // The end time should be tracked whenever we abort.
            // We defensively do this before React runs its abort listener,
            // although in practice this shouldn't matter.
            finalServerReactController.signal.addEventListener(
              'abort',
              () => {
                debugEndTime = performance.timeOrigin + performance.now()
              },
              { once: true }
            )
          }

          finalStageController.advanceStage(RenderStage.ShellStatic)

          let stream = workUnitAsyncStorage.run(
            finalServerPrerenderStore,
            ComponentMod.renderToReadableStream,
            finalServerPayload,
            clientModules,
            {
              filterStackFrame,
              onError: (err: unknown) => {
                return serverComponentsErrorHandler(err)
              },
              signal: finalServerReactController.signal,
            }
          )

          // The listener to abort our own render controller must be added
          // after React has added its listener, to ensure that pending I/O
          // is not aborted/rejected too early.
          finalServerReactController.signal.addEventListener(
            'abort',
            () => {
              finalServerRenderController.abort()
            },
            { once: true }
          )

          // Note: this await will only resolve after the last task (unless sync IO aborts the render earlier)
          // We await it here so that if the stream errors, it's not an unhandled rejection.
          await iterateStreamingPrerenderChunks(
            stream,
            finalServerReactController.signal,
            collectChunk,
            streamState
          )
        },
        () => {
          if (checkUnexpectedAbort()) return
          finalStageController.advanceStage(RenderStage.Static)
        },
        () => {
          if (checkUnexpectedAbort()) return

          // Finish the accumulators. We need to wait for Flight to flush the result into the stream,
          // which is scheduled in a (fast) immediate, so we do this in a separate task
          // (fast immediates will be drained at the end of the task, so in the next task we know we're done flushing)

          // If new chunks were emitted in the static stage
          // (after unblocking link data, i.e. static params)
          // then the prerender uses link data.
          // NOTE: we must capture this *before* resolving staleTime/varyParams,
          // which always emit new static chunks.
          didLinkDataUnblockNewContent =
            collectedChunksByStage[RenderStage.Static].length >
            collectedChunksByStage[RenderStage.ShellStatic].length

          // Now that the prerendering is complete, we know the final stale
          // time and vary params. Close the stale time iterable and resolve
          // the vary params thenable so Flight can serialize their values
          // into the stream. The timing here is important: both were
          // included in the Flight payload, but they can only be serialized
          // at the very end, after all the components have finished.
          if (staleTimeIterable !== undefined) {
            staleTimeIterable.close()
          }
          // Idempotent: a no-op if a runtime data access already resolved it
          // `true`. The `false` row lands here, after all stage content.
          runtimeDataAccessed.resolve(false)
          finishAccumulatingVaryParams(varyParamsAccumulator)

          shellByteLengthDeferred.resolve(
            didLinkDataUnblockNewContent
              ? collectedChunksByStage[RenderStage.ShellStatic].reduce(
                  (acc, chunk) => acc + chunk.byteLength,
                  0
                )
              : null
          )
        },
        () => {
          if (checkUnexpectedAbort()) return

          if (streamState.isPending) {
            // If prerenderIsPending then we have blocked for longer than a Task and we assume
            // there is something unfinished.
            resultIsPartial = true
          }

          workUnitAsyncStorage.run(
            finalServerPrerenderStore,
            finalServerReactController.abort.bind(finalServerReactController)
          )
        }
      )

      // If a sync IO error occurred, there's no point continuing.
      // NOTE: this early exit is load-bearing. The way we simulate a halt
      // in a render (ignoring all chunks emitted after an abort)
      // can lead to a blocked root chunk (if it didn't flush before the abort).
      // This means that deserializing the RSC payload can hang in unexpected places --
      // normally, we can at least get the outer object with hanging promises inside.
      throwIfSyncIOUsed(workStore, serverDynamicTracking)

      const reactServerResult = (reactServerPrerenderResult =
        new ReactServerPrerenderResult(collectedChunks.prerenderChunks))
      reactServerPrerenderResultIsDynamic = resultIsPartial
      reactServerPrerenderStore = finalServerPrerenderStore

      metadata.flightData = Buffer.concat(
        cachedNavigations
          ? prependIsPartialByteToChunks(
              reactServerResult.asChunks(),
              resultIsPartial
            )
          : reactServerResult.asChunks()
      )

      // collectSegmentData needs the raw flight data without the marker byte.
      const flightData = cachedNavigations
        ? metadata.flightData.subarray(1)
        : metadata.flightData

      await collectSegmentData(
        flightData,
        finalServerPrerenderStore,
        ComponentMod,
        renderOpts,
        ctx.pagePath,
        metadata
      )

      const clientDynamicTracking = createDynamicTrackingState(
        isDebugDynamicAccesses
      )

      const finalClientReactController = new AbortController()
      const finalClientRenderController = new AbortController()

      const finalClientPrerenderStore: PrerenderStore = {
        type: 'prerender-client',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        renderSignal: finalClientRenderController.signal,
        controller: finalClientReactController,
        // No APIs require a cacheSignal through the workUnitStore during the HTML prerender
        cacheSignal: null,
        dynamicTracking: clientDynamicTracking,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        resumeDataCache,
        hmrRefreshHash: undefined,
        // Client prerenders don't track server param access
        varyParamsAccumulator: null,
      }

      let dynamicValidation = createDynamicValidationState()

      const finalClientOnHeaders = createOnHeadersCallback(appendHeader)

      let { prelude: unprocessedPrelude, postponed } =
        await runInSequentialTasks(
          () => {
            const stream =
              process.env.NODE_ENV === 'development' &&
              collectedChunks.allChunks
                ? createNodeStreamWithLateRelease(
                    collectedChunks.prerenderChunks,
                    collectedChunks.allChunks,
                    finalClientReactController.signal
                  )
                : reactServerResult.asUnclosingStream()

            const pendingFinalClientResult = workUnitAsyncStorage.run(
              finalClientPrerenderStore,
              getClientPrerender,
              // eslint-disable-next-line @next/internal/no-ambiguous-jsx
              <App
                reactServerStream={stream}
                reactDebugStream={undefined}
                debugEndTime={debugEndTime}
                preinitScripts={preinitScripts}
                ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
                nonce={nonce}
                images={ctx.renderOpts.images}
              />,
              {
                signal: finalClientReactController.signal,
                onError: (err: unknown, errorInfo: ErrorInfo) => {
                  if (
                    isPrerenderInterruptedError(err) ||
                    finalClientReactController.signal.aborted
                  ) {
                    const componentStack: string | undefined = (
                      errorInfo as any
                    ).componentStack
                    if (typeof componentStack === 'string') {
                      trackAllowedDynamicAccess(
                        err,
                        workStore,
                        componentStack,
                        dynamicValidation,
                        clientDynamicTracking
                      )
                    }
                    return
                  }

                  return htmlRendererErrorHandler(err, errorInfo)
                },
                onHeaders: finalClientOnHeaders,
                maxHeadersLength: reactMaxHeadersLength,
                bootstrapScriptContent,
                bootstrapScripts: [bootstrapScript],
              }
            )

            // The listener to abort our own render controller must be added
            // after React has added its listener, to ensure that pending I/O is
            // not aborted/rejected too early.
            finalClientReactController.signal.addEventListener(
              'abort',
              () => {
                finalClientRenderController.abort()
              },
              { once: true }
            )

            return pendingFinalClientResult
          },
          () => {
            workUnitAsyncStorage.run(
              finalClientPrerenderStore,
              finalClientReactController.abort.bind(finalClientReactController)
            )
          }
        )

      metadata.hasPendingUi = postponed != null

      const { prelude, preludeIsEmpty } =
        await processPreludeOp(unprocessedPrelude)

      throwIfDisallowedDynamic(
        workStore,
        preludeIsEmpty ? PreludeState.Empty : PreludeState.Full,
        dynamicValidation,
        serverDynamicTracking,
        allowEmptyStaticShell
      )

      const getServerInsertedHTML = makeGetServerInsertedHTML({
        polyfills,
        renderServerInsertedHTML,
        serverCapturedErrors: allCapturedErrors,
        basePath,
        tracingMetadata: tracingMetadata,
      })

      let htmlStream: AnyStream = prelude
      if (resultIsPartial) {
        if (postponed != null) {
          metadata.postponed = await getDynamicHTMLPostponedState(
            postponed,
            preludeIsEmpty
              ? DynamicHTMLPreludeState.Empty
              : DynamicHTMLPreludeState.Full,
            fallbackRouteParams,
            resumeDataCache,
            cacheComponents,
            renderOpts.experimental.maxPostponedStateSizeBytes,
            renderOpts.experimental.disableResumeDataCacheCompression
          )
        } else {
          metadata.postponed = await getDynamicDataPostponedState(
            resumeDataCache,
            cacheComponents,
            renderOpts.experimental.maxPostponedStateSizeBytes,
            renderOpts.experimental.disableResumeDataCacheCompression
          )
        }
        reactServerResult.consume()
        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueDynamicPrerender(htmlStream, {
            getServerInsertedHTML,
            getServerInsertedMetadata,
            deploymentId: ctx.sharedContext.deploymentId,
          }),
          dynamicAccess: consumeDynamicAccess(
            serverDynamicTracking,
            clientDynamicTracking
          ),
          // TODO: Should this include the SSR pass?
          collectedRevalidate: finalServerPrerenderStore.revalidate,
          collectedExpire: finalServerPrerenderStore.expire,
          collectedStale: selectStaleTime(finalServerPrerenderStore.stale),
          collectedTags: finalServerPrerenderStore.tags,
          renderResumeDataCache: createRenderResumeDataCache(resumeDataCache),
        }
      } else if (postponed != null) {
        // We postponed but nothing dynamic was used. We resume the render now and immediately abort it
        // so we can set all the postponed boundaries to client render mode before we store the HTML response
        const foreverStream = createPendingStream()
        const resumePrelude = await workUnitAsyncStorage.run(
          finalServerPrerenderStore,
          resumeAndAbort,
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx
          <App
            reactServerStream={foreverStream}
            reactDebugStream={undefined}
            debugEndTime={undefined}
            preinitScripts={() => {}}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />,
          JSON.parse(JSON.stringify(postponed)),
          {
            signal: createRenderInBrowserAbortSignal(),
            onError: htmlRendererErrorHandler,
            nonce,
          }
        )
        // First we write everything from the prerender, then we write everything from the aborted resume render
        htmlStream = chainStreams(prelude, resumePrelude)
      }

      if (workStore.forceDynamic) {
        throw new StaticGenBailoutError(
          'Invariant: a Page with `dynamic = "force-dynamic"` did not trigger the dynamic pathway. This is a bug in Next.js'
        )
      }

      const stream = await continueStaticPrerenderWithInlinedData(
        htmlStream,
        reactServerResult,
        fallbackRouteParams,
        createInlinedDataStream,
        formState,
        nonce,
        getServerInsertedHTML,
        getServerInsertedMetadata,
        ctx.sharedContext.deploymentId,
        ComponentMod,
        renderFlightStream,
        clientModules,
        filterStackFrame,
        serverComponentsErrorHandler
      )

      return {
        digestErrorsMap: reactServerErrorsByDigest,
        ssrErrors: allCapturedErrors,
        stream,
        dynamicAccess: consumeDynamicAccess(
          serverDynamicTracking,
          clientDynamicTracking
        ),
        collectedRevalidate: finalServerPrerenderStore.revalidate,
        collectedExpire: finalServerPrerenderStore.expire,
        collectedStale: selectStaleTime(finalServerPrerenderStore.stale),
        collectedTags: finalServerPrerenderStore.tags,
        renderResumeDataCache: createRenderResumeDataCache(resumeDataCache),
      }
    } else {
      const prerenderLegacyStore: PrerenderStore = (prerenderStore = {
        type: 'prerender-legacy',
        phase: 'render',
        rootParams,
        implicitTags,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
      })
      // This is a regular static generation. We don't do dynamic tracking because we rely on
      // the old-school dynamic error handling to bail out of static generation
      const RSCPayload = await workUnitAsyncStorage.run(
        prerenderLegacyStore,
        getRSCPayload,
        tree,
        ctx,
        { is404: res.statusCode === 404, isPrerendering: true }
      )

      let reactServerResult: ReactServerPrerenderResult
      reactServerResult = reactServerPrerenderResult =
        await createReactServerPrerenderResultFromRender(
          workUnitAsyncStorage.run(
            prerenderLegacyStore,
            renderFlightStream,
            ComponentMod,
            RSCPayload,
            clientModules,
            {
              filterStackFrame,
              onError: serverComponentsErrorHandler,
            }
          )
        )

      const { stream: htmlStream } = await workUnitAsyncStorage.run(
        prerenderLegacyStore,
        renderFizzStream,
        // eslint-disable-next-line @next/internal/no-ambiguous-jsx
        <App
          reactServerStream={reactServerResult.asUnclosingStream()}
          reactDebugStream={undefined}
          debugEndTime={undefined}
          preinitScripts={preinitScripts}
          ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
          nonce={nonce}
          images={ctx.renderOpts.images}
        />,
        {
          onError: htmlRendererErrorHandler,
          nonce,
          bootstrapScriptContent,
          bootstrapScripts: [bootstrapScript],
        },
        { waitForAllReady: true }
      )

      const flightData = await streamToBuffer(reactServerResult.asStream())
      metadata.flightData = flightData
      await collectSegmentData(
        flightData,
        prerenderLegacyStore,
        ComponentMod,
        renderOpts,
        ctx.pagePath,
        metadata
      )

      const getServerInsertedHTML = makeGetServerInsertedHTML({
        polyfills,
        renderServerInsertedHTML,
        serverCapturedErrors: allCapturedErrors,
        basePath,
        tracingMetadata: tracingMetadata,
      })
      return {
        digestErrorsMap: reactServerErrorsByDigest,
        ssrErrors: allCapturedErrors,
        stream: await continueFizzStream(htmlStream, {
          inlinedDataStream: createInlinedDataStream(
            reactServerResult.consumeAsStream(),
            nonce,
            formState
          ),
          waitForAllReady: true,
          getServerInsertedHTML,
          getServerInsertedMetadata,
          deploymentId: ctx.sharedContext.deploymentId,
        }),
        // TODO: Should this include the SSR pass?
        collectedRevalidate: prerenderLegacyStore.revalidate,
        collectedExpire: prerenderLegacyStore.expire,
        collectedStale: selectStaleTime(prerenderLegacyStore.stale),
        collectedTags: prerenderLegacyStore.tags,
      }
    }
  } catch (err) {
    if (
      isStaticGenBailoutError(err) ||
      (typeof err === 'object' &&
        err !== null &&
        'message' in err &&
        typeof err.message === 'string' &&
        err.message.includes(
          'https://nextjs.org/docs/advanced-features/static-html-export'
        ))
    ) {
      // Ensure that "next dev" prints the red error overlay
      throw err
    }

    // If this is a static generation error, we need to throw it so that it
    // can be handled by the caller if we're in static generation mode.
    if (isDynamicServerError(err)) {
      throw err
    }

    // If a bailout made it to this point, it means it wasn't wrapped inside
    // a suspense boundary.
    const shouldBailoutToCSR = isBailoutToCSRError(err)
    if (shouldBailoutToCSR) {
      const stack = getStackWithoutErrorMessage(err)
      error(
        `${err.reason} should be wrapped in a suspense boundary at page "${pagePath}". Read more: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout\n${stack}`
      )

      throw err
    }

    // If we errored when we did not have an RSC stream to read from. This is
    // not just a render error, we need to throw early.
    if (reactServerPrerenderResult === null) {
      throw err
    }
    let errorType: MetadataErrorType | 'redirect' | undefined
    const isHTTPAccessFallback = isHTTPAccessFallbackError(err)
    const isRedirect = isRedirectError(err)

    if (isHTTPAccessFallback) {
      res.statusCode = getAccessFallbackHTTPStatus(err)
      metadata.statusCode = res.statusCode
      errorType = getAccessFallbackErrorTypeByStatus(res.statusCode)
    } else if (isRedirect) {
      errorType = 'redirect'
      res.statusCode = getRedirectStatusCodeFromError(err)
      metadata.statusCode = res.statusCode

      const redirectUrl = addPathPrefix(getURLFromRedirectError(err), basePath)

      setHeader('location', redirectUrl)
    } else {
      res.statusCode = 500
      metadata.statusCode = res.statusCode
    }

    if (cacheComponents && !isHTTPAccessFallback && !isRedirect) {
      throw reactServerErrorsByDigest.get((err as any).digest) ?? err
    }

    const [errorPreinitScripts, errorBootstrapScript] = getRequiredScripts(
      buildManifest,
      assetPrefix,
      crossOrigin,
      subresourceIntegrityManifest,
      getAssetQueryString(ctx, false),
      nonce,
      UNDERSCORE_NOT_FOUND_ROUTE_ENTRY
    )

    const errorBootstrapScriptContent =
      buildManifest.pagesChunkGroupBootstrapParams &&
      buildManifest.chunkLoadingGlobal
        ? getTurbopackChunkGroupBootstrap(
            buildManifest.pagesChunkGroupBootstrapParams,
            buildManifest.chunkLoadingGlobal,
            [UNDERSCORE_NOT_FOUND_ROUTE_ENTRY]
          )
        : undefined

    if (cacheComponents) {
      const originalFlightPrerenderResult = reactServerPrerenderResult
      const originalFlightPrerenderResultIsDynamic =
        reactServerPrerenderResultIsDynamic
      const originalResumeDataCache = reactServerResumeDataCache
      const originalPrerenderStore =
        reactServerPrerenderStore as PrerenderStore | null

      if (originalFlightPrerenderResult === null) {
        throw new InvariantError(
          'Cache Components error recovery expected an original Flight prerender result'
        )
      }
      if (originalFlightPrerenderResultIsDynamic === null) {
        throw new InvariantError(
          'Cache Components error recovery expected to know whether the original Flight prerender result was dynamic'
        )
      }
      if (originalResumeDataCache === null) {
        throw new InvariantError(
          'Cache Components error recovery expected an original resume data cache'
        )
      }
      if (originalPrerenderStore === null) {
        throw new InvariantError(
          'Cache Components error recovery expected an original prerender store'
        )
      }
      const originalCollectedStale = selectStaleTime(
        originalPrerenderStore.stale
      )

      // The final recovery still belongs to Cache Components. Render the error
      // payload with the same prerender APIs as the normal path so not-found
      // metadata can participate in static, dynamic-data, and dynamic-HTML
      // outcomes instead of being dropped from the recovery shell.
      const errorServerReactController = new AbortController()
      const errorServerRenderController = new AbortController()
      const errorServerDynamicTracking = createDynamicTrackingState(
        isDebugDynamicAccesses
      )
      const errorPrerenderStore: PrerenderStore = {
        type: 'prerender',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        renderSignal: errorServerRenderController.signal,
        controller: errorServerReactController,
        stagedRendering: null,
        cacheSignal: null,
        dynamicTracking: errorServerDynamicTracking,
        revalidate:
          typeof prerenderStore?.revalidate !== 'undefined'
            ? prerenderStore.revalidate
            : INFINITE_CACHE,
        expire:
          typeof prerenderStore?.expire !== 'undefined'
            ? prerenderStore.expire
            : INFINITE_CACHE,
        stale:
          typeof prerenderStore?.stale !== 'undefined'
            ? prerenderStore.stale
            : INFINITE_CACHE,
        tags: [...(prerenderStore?.tags || implicitTags.tags)],
        resumeDataCache: originalResumeDataCache,
        hmrRefreshHash: undefined,
        varyParamsAccumulator: null,
        runtimeDataAccessed: null,
        shouldAttemptStaticPrefetch: null,
        isFallbackUpgradeable: renderOpts.isFallbackUpgradeable === true,
      }

      const errorRSCPayload = await workUnitAsyncStorage.run(
        errorPrerenderStore,
        getErrorRSCPayload,
        tree,
        ctx,
        reactServerErrorsByDigest.has((err as any).digest) ? undefined : err,
        errorType,
        // The recovery shell only bootstraps the original Flight data. Avoid
        // blocking that shell on error-page metadata or viewport.
        false
      )

      const errorServerResult = await createReactServerPrerenderResult(
        runInSequentialTasks(
          async () => {
            const pendingErrorServerResult = workUnitAsyncStorage.run(
              errorPrerenderStore,
              getServerPrerender(ComponentMod),
              errorRSCPayload,
              clientModules,
              {
                filterStackFrame,
                signal: errorServerReactController.signal,
                onError: (rscError: unknown) => {
                  return serverComponentsErrorHandler(rscError)
                },
              }
            )

            // The listener to abort our own render controller must be added
            // after React has added its listener, to ensure that pending I/O
            // is not aborted/rejected too early.
            errorServerReactController.signal.addEventListener(
              'abort',
              () => {
                errorServerRenderController.abort()
              },
              { once: true }
            )

            const prerenderResult = await pendingErrorServerResult
            return prerenderResult
          },
          () => {
            if (!errorServerReactController.signal.aborted) {
              workUnitAsyncStorage.run(
                errorPrerenderStore,
                errorServerReactController.abort.bind(
                  errorServerReactController
                )
              )
            }
          }
        )
      )

      try {
        const errorClientReactController = new AbortController()
        const errorClientRenderController = new AbortController()
        const errorClientDynamicTracking = createDynamicTrackingState(
          isDebugDynamicAccesses
        )
        const errorDynamicValidation = createDynamicValidationState()
        const errorClientPrerenderStore: PrerenderStore = {
          type: 'prerender-client',
          phase: 'render',
          rootParams,
          fallbackRouteParams,
          implicitTags,
          renderSignal: errorClientRenderController.signal,
          controller: errorClientReactController,
          cacheSignal: null,
          dynamicTracking: errorClientDynamicTracking,
          revalidate: errorPrerenderStore.revalidate,
          expire: errorPrerenderStore.expire,
          stale: errorPrerenderStore.stale,
          tags: [...(errorPrerenderStore.tags || implicitTags.tags)],
          resumeDataCache: originalResumeDataCache,
          hmrRefreshHash: undefined,
          varyParamsAccumulator: null,
        }

        const {
          prelude: unprocessedErrorHtmlStream,
          postponed: errorPostponed,
        } = await runInSequentialTasks(
          () => {
            const pendingErrorHtmlResult = workUnitAsyncStorage.run(
              errorClientPrerenderStore,
              getClientPrerender,
              // eslint-disable-next-line @next/internal/no-ambiguous-jsx
              <ErrorApp
                reactServerStream={errorServerResult.asUnclosingStream()}
                ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
                preinitScripts={errorPreinitScripts}
                nonce={nonce}
                images={ctx.renderOpts.images}
              />,
              {
                nonce,
                bootstrapScriptContent: errorBootstrapScriptContent,
                bootstrapScripts: [errorBootstrapScript],
                formState,
                signal: errorClientReactController.signal,
                onError: (clientError: unknown, errorInfo: ErrorInfo) => {
                  if (
                    isPrerenderInterruptedError(clientError) ||
                    errorClientReactController.signal.aborted
                  ) {
                    const componentStack: string | undefined = (
                      errorInfo as any
                    ).componentStack
                    if (typeof componentStack === 'string') {
                      trackAllowedDynamicAccess(
                        clientError,
                        workStore,
                        componentStack,
                        errorDynamicValidation,
                        errorClientDynamicTracking
                      )
                    }
                    return
                  }

                  return htmlRendererErrorHandler(clientError, errorInfo)
                },
              }
            )

            // The listener to abort our own render controller must be added
            // after React has added its listener, to ensure that pending I/O
            // is not aborted/rejected too early.
            errorClientReactController.signal.addEventListener(
              'abort',
              () => {
                errorClientRenderController.abort()
              },
              { once: true }
            )

            return pendingErrorHtmlResult
          },
          () => {
            workUnitAsyncStorage.run(
              errorClientPrerenderStore,
              errorClientReactController.abort.bind(errorClientReactController)
            )
          }
        )

        metadata.hasPendingUi = errorPostponed != null

        const { prelude, preludeIsEmpty } = await processPreludeOp(
          unprocessedErrorHtmlStream
        )

        if (preludeIsEmpty) {
          console.error(
            `Route "${workStore.route}" did not produce a static shell while rendering its error page.`
          )
          throwIfDisallowedDynamic(
            workStore,
            PreludeState.Empty,
            errorDynamicValidation,
            errorServerDynamicTracking,
            false
          )
          throw new StaticGenBailoutError()
        }

        const getServerInsertedHTML = makeGetServerInsertedHTML({
          polyfills,
          renderServerInsertedHTML,
          serverCapturedErrors: [],
          basePath,
          tracingMetadata: tracingMetadata,
        })

        let errorHtmlStream: AnyStream = prelude
        if (originalFlightPrerenderResultIsDynamic) {
          metadata.postponed = await getDynamicDataPostponedState(
            originalResumeDataCache,
            cacheComponents,
            renderOpts.experimental.maxPostponedStateSizeBytes,
            renderOpts.experimental.disableResumeDataCacheCompression
          )
          originalFlightPrerenderResult.consume()
          errorServerResult.consume()
          return {
            digestErrorsMap: reactServerErrorsByDigest,
            ssrErrors: allCapturedErrors,
            stream: await continueDynamicPrerender(errorHtmlStream, {
              getServerInsertedHTML,
              getServerInsertedMetadata,
              deploymentId: ctx.sharedContext.deploymentId,
            }),
            dynamicAccess: consumeDynamicAccess(
              errorServerDynamicTracking,
              errorClientDynamicTracking
            ),
            collectedRevalidate: originalPrerenderStore.revalidate,
            collectedExpire: originalPrerenderStore.expire,
            collectedStale: originalCollectedStale,
            collectedTags: originalPrerenderStore.tags,
            renderResumeDataCache: createRenderResumeDataCache(
              originalResumeDataCache
            ),
          }
        } else if (errorPostponed != null) {
          // We postponed but nothing dynamic was used. Resume the error shell
          // and immediately abort it so postponed client boundaries are marked
          // for browser rendering before the static response is stored.
          const foreverStream = createPendingStream()
          const resumePrelude = await workUnitAsyncStorage.run(
            errorPrerenderStore,
            resumeAndAbort,
            // eslint-disable-next-line @next/internal/no-ambiguous-jsx
            <ErrorApp
              reactServerStream={foreverStream}
              ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
              preinitScripts={() => {}}
              nonce={nonce}
              images={ctx.renderOpts.images}
            />,
            JSON.parse(JSON.stringify(errorPostponed)),
            {
              signal: createRenderInBrowserAbortSignal(),
              onError: htmlRendererErrorHandler,
              nonce,
            }
          )
          errorHtmlStream = chainStreams(prelude, resumePrelude)
        }

        if (workStore.forceDynamic) {
          throw new StaticGenBailoutError(
            'Invariant: a Page with `dynamic = "force-dynamic"` did not trigger the dynamic pathway. This is a bug in Next.js'
          )
        }

        const stream = await continueStaticPrerenderWithInlinedData(
          errorHtmlStream,
          originalFlightPrerenderResult,
          fallbackRouteParams,
          createInlinedDataStream,
          formState,
          nonce,
          getServerInsertedHTML,
          getServerInsertedMetadata,
          ctx.sharedContext.deploymentId,
          ComponentMod,
          renderFlightStream,
          clientModules,
          filterStackFrame,
          serverComponentsErrorHandler
        )

        errorServerResult.consume()
        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream,
          dynamicAccess: consumeDynamicAccess(
            errorServerDynamicTracking,
            errorClientDynamicTracking
          ),
          collectedRevalidate: originalPrerenderStore.revalidate,
          collectedExpire: originalPrerenderStore.expire,
          collectedStale: originalCollectedStale,
          collectedTags: originalPrerenderStore.tags,
          renderResumeDataCache: createRenderResumeDataCache(
            originalResumeDataCache
          ),
        }
      } catch (finalErr: any) {
        if (
          process.env.__NEXT_DEV_SERVER &&
          isHTTPAccessFallbackError(finalErr)
        ) {
          const { bailOnRootNotFound } =
            require('../../client/components/dev-root-http-access-fallback-boundary') as typeof import('../../client/components/dev-root-http-access-fallback-boundary')
          bailOnRootNotFound()
        }
        throw finalErr
      }
    }

    const prerenderLegacyStore: PrerenderStore = {
      type: 'prerender-legacy',
      phase: 'render',
      rootParams,
      implicitTags: implicitTags,
      revalidate:
        typeof prerenderStore?.revalidate !== 'undefined'
          ? prerenderStore.revalidate
          : INFINITE_CACHE,
      expire:
        typeof prerenderStore?.expire !== 'undefined'
          ? prerenderStore.expire
          : INFINITE_CACHE,
      stale:
        typeof prerenderStore?.stale !== 'undefined'
          ? prerenderStore.stale
          : INFINITE_CACHE,
      tags: [...(prerenderStore?.tags || implicitTags.tags)],
    }

    const errorRSCPayload = await workUnitAsyncStorage.run(
      prerenderLegacyStore,
      getErrorRSCPayload,
      tree,
      ctx,
      reactServerErrorsByDigest.has((err as any).digest) ? undefined : err,
      errorType,
      // Legacy prerender recovery should include the error payload head.
      true
    )

    const errorServerStream = workUnitAsyncStorage.run(
      prerenderLegacyStore,
      renderFlightStream,
      ComponentMod,
      errorRSCPayload,
      clientModules,
      {
        filterStackFrame,
        onError: serverComponentsErrorHandler,
      }
    )

    try {
      const { stream: errorHtmlStream } = await workUnitAsyncStorage.run(
        prerenderLegacyStore,
        renderFizzStream,
        // eslint-disable-next-line @next/internal/no-ambiguous-jsx
        <ErrorApp
          reactServerStream={errorServerStream}
          ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
          preinitScripts={errorPreinitScripts}
          nonce={nonce}
          images={ctx.renderOpts.images}
        />,
        {
          nonce,
          bootstrapScriptContent: errorBootstrapScriptContent,
          bootstrapScripts: [errorBootstrapScript],
          formState,
        },
        { waitForAllReady: true }
      )

      const flightData = await streamToBuffer(
        reactServerPrerenderResult.asStream()
      )
      metadata.flightData = flightData
      await collectSegmentData(
        flightData,
        prerenderLegacyStore,
        ComponentMod,
        renderOpts,
        ctx.pagePath,
        metadata
      )

      return {
        digestErrorsMap: reactServerErrorsByDigest,
        ssrErrors: allCapturedErrors,
        stream: await continueFizzStream(errorHtmlStream, {
          inlinedDataStream: createInlinedDataStream(
            reactServerPrerenderResult.consumeAsStream(),
            nonce,
            formState
          ),
          waitForAllReady: true,
          getServerInsertedHTML: makeGetServerInsertedHTML({
            polyfills,
            renderServerInsertedHTML,
            serverCapturedErrors: [],
            basePath,
            tracingMetadata: tracingMetadata,
          }),
          getServerInsertedMetadata,
          validateRootLayout: !!process.env.__NEXT_DEV_SERVER,
          deploymentId: ctx.sharedContext.deploymentId,
        }),
        dynamicAccess: null,
        collectedRevalidate: prerenderLegacyStore.revalidate,
        collectedExpire: prerenderLegacyStore.expire,
        collectedStale: selectStaleTime(prerenderLegacyStore.stale),
        collectedTags: prerenderLegacyStore.tags,
      }
    } catch (finalErr: any) {
      if (
        process.env.__NEXT_DEV_SERVER &&
        isHTTPAccessFallbackError(finalErr)
      ) {
        const { bailOnRootNotFound } =
          require('../../client/components/dev-root-http-access-fallback-boundary') as typeof import('../../client/components/dev-root-http-access-fallback-boundary')
        bailOnRootNotFound()
      }
      throw finalErr
    }
  }
}

type StreamPendingState = { isPending: boolean }

function createStreamPendingState(): StreamPendingState {
  // This state essentially acts as a mutable out-parameter that should be set
  // by something that consumes the stream.
  // As a sanity check, we require it to be set at least once.
  let _isPending: boolean | undefined
  return {
    get isPending() {
      if (_isPending === undefined) {
        throw new InvariantError(
          'Expected stream state to be initialized before reading'
        )
      }
      return _isPending
    },
    set isPending(value) {
      _isPending = value
    },
  }
}

function createPrerenderChunksAccumulator(): PrerenderChunksAccumulator {
  return {
    // Chunks emitted before aborting the render.
    prerenderChunks: [],
    // In dev, we also collect chunks that the render emits after aborting,
    // because they can contain debug info for chunks that did not
    // resolve during the prerender. However, unlike a prerender, a render
    // will also error all the pending chunks (instead of halting),
    // so have to use something like `createNodeStreamWithLateRelease`
    // to make the errors unobservable.
    allChunks: process.env.NODE_ENV === 'development' ? [] : null,
  }
}

type PrerenderChunksAccumulator = {
  prerenderChunks: Uint8Array[]
  allChunks: Uint8Array[] | null
}

function collectPrerenderChunk(
  chunks: PrerenderChunksAccumulator,
  signal: AbortSignal,
  chunk: Uint8Array
) {
  // The chunks emitted after an abort are not part of the prerender...
  if (!signal.aborted) {
    chunks.prerenderChunks.push(chunk)
  }
  // ...but if they contain debug info, we still want to collect them
  // to improve error messages.
  chunks.allChunks?.push(chunk)
}

async function iterateStreamingPrerenderChunks(
  stream: AnyStream,
  signal: AbortSignal,
  onChunk: (chunk: Uint8Array) => void,
  streamState?: StreamPendingState
): Promise<void> {
  if (stream instanceof ReadableStream) {
    const reader = stream.getReader()
    if (streamState) {
      streamState.isPending = true
    }

    // In production, there's no debug info, so we don't need to capture
    // anything emitted after the abort and can cancel immediately.
    if (process.env.NODE_ENV !== 'development') {
      signal.addEventListener(
        'abort',
        () => {
          reader.cancel(signal.reason)
        },
        { once: true }
      )
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      onChunk(value)
    }
    if (streamState) {
      streamState.isPending = false
    }
  } else {
    const nodeStream = stream as Readable
    if (streamState) {
      streamState.isPending = true
    }

    let cancelled = false

    // In production, there's no debug info, so we don't need to capture
    // anything emitted after the abort and can cancel immediately.
    if (process.env.NODE_ENV !== 'development') {
      signal.addEventListener(
        'abort',
        () => {
          if (!cancelled) {
            cancelled = true
            nodeStream.destroy()
          }
        },
        { once: true }
      )
    }

    try {
      for await (const value of nodeStream) {
        if (cancelled) break
        onChunk(value)
      }
    } catch (err) {
      if (!cancelled) {
        throw err
      }
    }
    if (streamState) {
      streamState.isPending = false
    }
  }
}

const getGlobalErrorStyles = async (
  tree: LoaderTree,
  ctx: AppRenderContext
): Promise<{
  GlobalError: GlobalErrorComponent
  styles: ReactNode | undefined
}> => {
  const globalErrorModule = parseLoaderTree(tree).modules['global-error']

  if (!globalErrorModule) {
    throw new Error(
      'Invariant: global-error module is required but not found in loader tree'
    )
  }

  const {
    componentMod: { createElement },
  } = ctx

  // Get the GlobalError component and styles from the loader tree
  const [GlobalErrorComponent, styles] = await createComponentStylesAndScripts({
    ctx,
    filePath: globalErrorModule[1],
    getComponent: globalErrorModule[0],
    injectedCSS: new Set(),
    injectedJS: new Set(),
  })

  let globalErrorStyles: ReactNode = styles

  if (process.env.__NEXT_DEV_SERVER) {
    const dir =
      (process.env.NEXT_RUNTIME === 'edge'
        ? process.env.__NEXT_EDGE_PROJECT_DIR
        : ctx.renderOpts.dir) || ''

    const globalErrorModulePath = normalizeConventionFilePath(
      dir,
      globalErrorModule[1]
    )
    if (globalErrorModulePath) {
      const SegmentViewNode = ctx.componentMod.SegmentViewNode
      globalErrorStyles =
        // This will be rendered next to GlobalError component under ErrorBoundary,
        // it requires a key to avoid React warning about duplicate keys.
        createElement(
          SegmentViewNode,
          {
            key: 'ge-svn',
            type: 'global-error',
            pagePath: globalErrorModulePath,
          },
          globalErrorStyles
        )
    }
  }

  return {
    GlobalError: GlobalErrorComponent,
    styles: globalErrorStyles,
  }
}

async function collectSegmentData(
  fullPageDataBuffer: Buffer,
  prerenderStore: PrerenderStore,
  ComponentMod: AppPageModule,
  renderOpts: RenderOpts,
  pagePath: string,
  metadata: AppPageRenderResultMetadata
): Promise<void> {
  // Per-segment prefetch data
  //
  // All of the segments for a page are generated simultaneously, including
  // during revalidations. This is to ensure consistency, because it's
  // possible for a mismatch between a layout and page segment can cause the
  // client to error during rendering. We want to preserve the ability of the
  // client to recover from such a mismatch by re-requesting all the segments
  // to get a consistent view of the page.
  //
  // For performance, we reuse the Flight output that was created when
  // generating the initial page HTML. The Flight stream for the whole page is
  // decomposed into a separate stream per segment.

  const { clientModules, edgeRscModuleMapping, rscModuleMapping } =
    getClientReferenceManifest()

  // Manifest passed to the Flight client for reading the full-page Flight
  // stream. Based off similar code in use-cache-wrapper.ts.
  const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'
  const serverConsumerManifest = {
    // moduleLoading must be null because we don't want to trigger preloads of ClientReferences
    // to be added to the consumer. Instead, we'll wait for any ClientReference to be emitted
    // which themselves will handle the preloading.
    moduleLoading: null,
    moduleMap: isEdgeRuntime ? edgeRscModuleMapping : rscModuleMapping,
    serverModuleMap: getServerModuleMap(),
  }

  const selectStaleTime = createSelectStaleTime(renderOpts.experimental)
  const staleTime = selectStaleTime(prerenderStore.stale)

  // Resolve prefetch hints. At runtime (next start / ISR), the precomputed
  // hints are already loaded from the prefetch-hints.json manifest. During
  // build, compute them and write them to metadata so the build pipeline
  // can persist them to the manifest. Like every other hint bit, the
  // static-prefetch-attempt hint is computed once here and stays constant
  // for the entire build — it must reach every response that carries
  // prefetch hints (dynamic navigations included), which only the manifest
  // flow can guarantee.
  //
  // The manifest isn't just a cache of this work — for some responses it's
  // the only possible source. A response's FlightRouterState is built early
  // in its render, before the runtime-data tracking has settled, so it can't
  // read a finished measurement even when one is coming; and a dynamic
  // navigation has no prerender to measure in the first place. Recomputing
  // per render would therefore leave those responses with no hint at all,
  // which is worse than an occasionally-stale one: the client would deopt
  // straight to runtime prefetches instead of attempting static.
  let hints: PrefetchHints | null
  const prefetchInlining = renderOpts.experimental.prefetchInlining
  if (renderOpts.isBuildTimePrerendering) {
    // Whether the client should attempt a static prefetch for this route
    // (PrefetchHint.ShouldAttemptStaticPrefetch): the prerender store's
    // cell holds the hint value directly — true iff the build-time
    // prerender accessed no runtime data that disqualifies a static
    // attempt. The fallback-param upgradeability rule is applied at access
    // time — see trackRuntimeDataAccessed — so only the settled value is
    // read here. Only the modern (cacheComponents) prerender tracks
    // accesses; legacy prerenders conservatively never set the hint.
    const hintCell =
      prerenderStore.type === 'prerender'
        ? prerenderStore.shouldAttemptStaticPrefetch
        : null
    const shouldAttemptStaticPrefetch = hintCell !== null && hintCell.current
    if (prefetchInlining || shouldAttemptStaticPrefetch) {
      // Build time: compute fresh hints and store in metadata for the
      // manifest. When prefetch inlining is disabled there are no sizes to
      // measure, but the static-prefetch hint still rides the manifest —
      // collectPrefetchHints then only builds the tree shape carrying it.
      hints = await ComponentMod.collectPrefetchHints(
        renderOpts.cacheComponents,
        fullPageDataBuffer,
        staleTime,
        clientModules,
        serverConsumerManifest,
        prefetchInlining,
        shouldAttemptStaticPrefetch
      )
      metadata.prefetchHints = hints
    } else {
      // Inlining is disabled and the hint didn't qualify — there's nothing
      // to record, so don't write a manifest entry for this route.
      hints = null
    }
  } else {
    // Runtime: use hints from the manifest. Never compute fresh hints
    // during ISR/revalidation.
    const manifestHints = renderOpts.prefetchHints?.[pagePath]
    if (manifestHints === undefined) {
      if (!prefetchInlining || !renderOpts.cacheComponents) {
        // Without cacheComponents, dynamic pages have no static shell
        // and therefore no prerender pass to compute hints; and with
        // inlining disabled, a missing entry just means the route didn't
        // qualify for the static-prefetch hint at build. Either way this
        // is expected — skip the hint system for this route and let
        // prefetching proceed normally without inlining decisions (the
        // client goes straight to runtime prefetches where it matters).
        hints = null
      } else {
        // TODO(#91407): No hints found for this route. This currently
        // happens for routes with `instant = false` at the root segment,
        // which causes the prerender to run per-request and the hints
        // manifest to be unavailable at runtime.
        //
        // Fall back to a hint tree that marks everything as
        // unprefetchable. This also swallows the static-prefetch-attempt
        // hint — such routes never carry it, so the client goes straight
        // to a runtime prefetch, which is safe (just less cacheable).
        // Once the instant:false bug is fixed, this should become an
        // error — the manifest should always have an entry for every
        // route that reaches collectSegmentData.
        hints = {
          hints: PrefetchHint.PrefetchDisabled,
          slots: null,
        }
      }
    } else {
      hints = manifestHints
    }
  }

  // Whether this render is a fallback shell, i.e. it was prerendered with
  // unknown (opaque) route params rather than concrete ones. The per-segment
  // responses generated below are stamped with this so the client knows to
  // retry the prefetch — a more complete version may become available once
  // the server's background regeneration finishes.
  //
  // Only flag the shell when it could actually be upgraded
  // (`isFallbackUpgradeable`): at least one fallback param is a candidate
  // enumerated by `generateStaticParams`. A route with no `generateStaticParams`
  // never upgrades, so flagging it would trigger pointless client retries.
  const fallbackRouteParams =
    'fallbackRouteParams' in prerenderStore
      ? prerenderStore.fallbackRouteParams
      : null
  const isUpgradeableISRFallback =
    fallbackRouteParams != null &&
    fallbackRouteParams.size > 0 &&
    renderOpts.isFallbackUpgradeable === true

  // Pass the resolved hints so collectSegmentData can union them into
  // the /_tree response. During the initial build the transport tree in
  // the buffer doesn't have inlining hints yet (they were just computed
  // above), so we need to merge them in here. At runtime/ISR the hints
  // are already embedded in the buffer's tree, so this is null.
  metadata.segmentData = await ComponentMod.collectSegmentData(
    renderOpts.cacheComponents,
    fullPageDataBuffer,
    staleTime,
    clientModules,
    serverConsumerManifest,
    Boolean(renderOpts.experimental.prefetchInlining),
    hints,
    isUpgradeableISRFallback
  )
}

function isBypassingCachesInDev(
  requestStore: RequestStore,
  workStore: WorkStore
): boolean {
  return (
    !!process.env.__NEXT_DEV_SERVER &&
    (requestStore.headers.get('cache-control') === 'no-cache' ||
      requestStore.draftMode.isEnabled ||
      workStore.isDraftMode === true)
  )
}

function WarnForBypassCachesInDev({ route }: { route: string }) {
  warnOnce(
    `Route ${route} is rendering with server caches disabled. For this navigation, Component Metadata in React DevTools will not accurately reflect what is statically prerenderable and runtime prefetchable. See more info here: https://nextjs.org/docs/messages/cache-bypass-in-dev`
  )
  return null
}
