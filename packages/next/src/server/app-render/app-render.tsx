import type { ComponentType, ErrorInfo, JSX, ReactNode } from 'react'
import type { RenderOpts, PreloadCallbacks } from './types'
import type {
  ActionResult,
  DynamicParamTypesShort,
  DynamicSegmentTuple,
  FlightRouterState,
  CacheNodeSeedData,
  RSCPayload,
  NavigationFlightResponse,
  FlightData,
  InitialRSCPayload,
  FlightDataPath,
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
  RequestStore,
  ValidationStoreClient,
} from '../app-render/work-unit-async-storage.external'
import type { NextParsedUrlQuery } from '../request-meta'
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
import { createRequestStoreForRender } from '../async-storage/request-store'
import { isRSCRequestHeader } from '../lib/is-rsc-request'
import { createWorkStore } from '../async-storage/work-store'
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
import { getTracer, SpanStatusCode } from '../lib/trace/tracer'
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
import { createFlightRouterStateFromLoaderTree } from './create-flight-router-state-from-loader-tree'
import { handleAction } from './action-handler'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { warn, error } from '../../build/output/log'
import { appendMutableCookies } from '../web/spec-extension/adapters/request-cookies'
import { createServerInsertedHTML } from './server-inserted-html'
import { getRequiredScripts } from './required-scripts'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'
import { makeGetServerInsertedHTML } from './make-get-server-inserted-html'
import {
  walkTreeWithFlightRouterState,
  createFullTreeFlightDataForNavigation,
} from './walk-tree-with-flight-router-state'
import { createComponentTree, getRootParams } from './create-component-tree'
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
} from './postponed-state'
import {
  getDynamicDataPostponedState,
  getDynamicHTMLPostponedState,
  getPostponedFromState,
} from './postponed-state'
import { isDynamicServerError } from '../../client/components/hooks-server-context'
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
} from './dynamic-rendering'
import { logBuildDebugHint } from './blocking-route-messages'
import {
  getClientComponentLoaderMetrics,
  wrapClientComponentLoader,
} from '../client-component-renderer-logger'
import { isNodeNextRequest } from '../base-http/helpers'
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
  createReactServerPrerenderResult,
  type ReactServerPrerenderResult,
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
  getMetadataVaryParamsThenable,
} from './vary-params'
import { getTracedMetadata } from '../lib/trace/utils'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  StaleTimeIterable,
  createSelectStaleTime,
  trackStaleTime,
  finishStaleTimeTracking,
} from './stale-time'

import { HTML_CONTENT_TYPE_HEADER, INFINITE_CACHE } from '../../lib/constants'
import { createComponentStylesAndScripts } from './create-component-styles-and-scripts'
import { parseLoaderTree } from '../../shared/lib/router/utils/parse-loader-tree'
import {
  createPrerenderResumeDataCache,
  createRenderResumeDataCache,
  type PrerenderResumeDataCache,
  type RenderResumeDataCache,
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
import { RenderStage, StagedRenderingController } from './staged-rendering'
import {
  anySegmentHasRuntimePrefetchEnabled,
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
} from './debug-channel-server'
import { createNodeStreamWithLateRelease } from './instant-validation/stream-utils'

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

export type AppRenderContext = {
  sharedContext: AppSharedContext
  workStore: WorkStore
  url: ReturnType<typeof parseRelativeUrl>
  componentMod: AppPageModule
  renderOpts: RenderOpts
  parsedRequestHeaders: ParsedRequestHeaders
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  interpolatedParams: Params
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
  // runtime prefetch requests are *not* treated as prefetch requests
  // (TODO: this is confusing, we should refactor this to express this better)
  const isPrefetchRequest = headers[NEXT_ROUTER_PREFETCH_HEADER] === '1'

  const isAppShellPrefetchRequest = headers[NEXT_ROUTER_PREFETCH_HEADER] === '3'

  // App Shell prefetches are a subtype of runtime prefetch — same code path,
  // with `forceOmitParams` set on the prerender store.
  const isRuntimePrefetchRequest =
    headers[NEXT_ROUTER_PREFETCH_HEADER] === '2' || isAppShellPrefetchRequest

  const isHmrRefresh = headers[NEXT_HMR_REFRESH_HEADER] !== undefined

  const isRSCRequest = isRSCRequestHeader(headers[RSC_HEADER])

  const shouldProvideFlightRouterState =
    isRSCRequest && (!isPrefetchRequest || !options.isRoutePPREnabled)

  const flightRouterState = shouldProvideFlightRouterState
    ? parseAndValidateFlightRouterState(headers[NEXT_ROUTER_STATE_TREE_HEADER])
    : undefined

  // Checks if this is a prefetch of the Route Tree by the Segment Cache
  const isRouteTreePrefetchRequest =
    headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] === '/_tree'

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
    runtimePrefetchStream?: ReadableStream<Uint8Array>
  }
): Promise<RSCPayload> {
  // Flight data that is going to be passed to the browser.
  // Currently a single item array but in the future multiple patches might be combined in a single request.

  // We initialize `flightData` to an empty string because the client router knows how to tolerate
  // it (treating it as an MPA navigation). The only time this function wouldn't generate flight data
  // is for server actions, if the server action handler instructs this function to skip it. When the server
  // action reducer sees a falsy value, it'll simply resolve the action with no data.
  let flightData: FlightData = ''

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

    const metadataIsRuntimePrefetchable =
      await anySegmentHasRuntimePrefetchEnabled(loaderTree)
    const { Viewport, Metadata, MetadataOutlet } = createMetadataComponents({
      tree: loaderTree,
      parsedQuery: query,
      pathname: url.pathname,
      metadataContext: createMetadataContext(ctx.renderOpts),
      interpolatedParams: ctx.interpolatedParams,
      serveStreamingMetadata,
      isRuntimePrefetchable: metadataIsRuntimePrefetchable,
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

    flightData = (
      needsFullTree
        ? await createFullTreeFlightDataForNavigation({
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
    ).map((path) => path.slice(1)) // remove the '' (root) segment
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
    return maybeAppendBuildIdToRSCPayload(ctx, {
      a: options.actionResult,
      f: flightData,
      q: getRenderedSearch(query),
      i: !!couldBeIntercepted,
    })
  }

  // Otherwise, it's a regular RSC response.
  const baseResponse: NavigationFlightResponse = maybeAppendBuildIdToRSCPayload(
    ctx,
    {
      f: flightData,
      q: getRenderedSearch(query),
      i: !!couldBeIntercepted,
      S: workStore.isStaticGeneration,
      h: getMetadataVaryParamsThenable(),
    }
  )

  if (options?.staleTimeIterable !== undefined) {
    baseResponse.s = options.staleTimeIterable
  }

  if (options?.staticStageByteLengthPromise !== undefined) {
    baseResponse.l = options.staticStageByteLengthPromise
  }

  if (options?.runtimePrefetchStream !== undefined) {
    baseResponse.p = options.runtimePrefetchStream
  }

  // Include the per-page dynamic stale time from unstable_dynamicStaleTime, but only
  // for dynamic renders (not prerenders/static generation). The client treats
  // its presence as authoritative.
  // TODO: Move this to the prefetch hints file so we don't have to walk the
  // tree on every render.
  if (!workStore.isStaticGeneration) {
    const dynamicStaleTime = await getDynamicStaleTime(
      ctx.componentMod.routeModule.userland.loaderTree
    )
    if (dynamicStaleTime !== null) {
      baseResponse.d = dynamicStaleTime
    }
  }

  return baseResponse
}

function createErrorContext(
  ctx: AppRenderContext,
  renderSource: RequestErrorContext['renderSource']
): RequestErrorContext {
  return {
    routerKind: 'App Router',
    routePath: ctx.pagePath,
    // TODO: is this correct if `isPossibleServerAction` is a false positive?
    routeType: ctx.isPossibleServerAction ? 'action' : 'render',
    renderSource,
    revalidateReason: getRevalidateReason(ctx.workStore),
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
    componentTree?: CacheNodeSeedData
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
      createErrorContext(ctx, 'react-server-components-payload'),
      silenceLog
    )
  }

  const onError = createReactServerErrorHandler(
    process.env.NODE_ENV === 'development',
    isBuildTimePrerendering,
    workStore.reactServerErrorsByDigest,
    onFlightDataRenderError
  )

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
 * Production-only staged dynamic flight render for cache components. Uses
 * staged rendering to separate static (RDC-backed) from runtime/dynamic
 * content.
 */
async function generateStagedDynamicFlightRenderResultWeb(
  req: BaseNextRequest,
  ctx: AppRenderContext,
  requestStore: RequestStore
): Promise<RenderResult> {
  const { componentMod, workStore, renderOpts } = ctx
  const { renderToReadableStream, routeModule } = componentMod
  const { loaderTree } = routeModule.userland
  const { onInstrumentationRequestError, experimental } = renderOpts

  function onFlightDataRenderError(err: DigestedError, silenceLog: boolean) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'react-server-components-payload'),
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

  // TODO(cached-navs): this assumes that we checked during build that there's no sync IO.
  // but it can happen e.g. after a revalidation or conditionally for a param that wasn't prerendered.
  // we should change this to track sync IO, log an error and advance to dynamic.
  const shouldTrackSyncIO = false
  const stageController = new StagedRenderingController(
    null, // no aborting
    null, // no abandoning
    shouldTrackSyncIO
  )

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

  // Deferred promise for the static stage byte length. Flight serializes the
  // resolved value into the stream so the client knows where the static
  // prefix ends.
  let resolveStaticStageByteLength: (count: number) => void
  const staticStageByteLengthPromise = new Promise<number>((resolve) => {
    resolveStaticStageByteLength = resolve
  })

  // Check if this route has opted into runtime prefetching via
  // unstable_instant. If so, we piggyback on the dynamic render to fill caches
  // and then spawn a final runtime prerender whose result stream is embedded in
  // the RSC payload. This is gated on the explicit opt-in because it adds extra
  // server processing, increases the response payload size, and the runtime
  // prefetch output should have been validated first.
  const hasRuntimePrefetch =
    await anySegmentHasRuntimePrefetchEnabled(loaderTree)

  let runtimePrefetchStream: ReadableStream<Uint8Array> | undefined

  if (hasRuntimePrefetch) {
    // Create a mutable cache that gets filled during the dynamic render.
    const prerenderResumeDataCache = createPrerenderResumeDataCache()
    requestStore.prerenderResumeDataCache = prerenderResumeDataCache

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
    { staleTimeIterable, staticStageByteLengthPromise, runtimePrefetchStream }
  )

  const { clientModules } = getClientReferenceManifest()

  const flightReadableStream = await runInSequentialTasks(
    () => {
      stageController.advanceStage(RenderStage.Static)

      const stream = workUnitAsyncStorage.run(
        requestStore,
        renderToReadableStream,
        rscPayload,
        clientModules,
        { onError, filterStackFrame }
      )

      const [dynamicStream, staticStream] = stream.tee()

      countStaticStageBytes(staticStream, stageController).then(
        resolveStaticStageByteLength
      )

      return dynamicStream
    },
    () => {
      // This is a separate task that doesn't advance a stage. It forces
      // draining the microtask queue so that the stale time iterable and vary
      // params accumulators are closed before we advance to the dynamic stage.
      void finishStaleTimeTracking(staleTimeIterable)
      if (requestStore.varyParamsAccumulator) {
        void finishAccumulatingVaryParams(requestStore.varyParamsAccumulator)
      }
    },
    () => {
      stageController.advanceStage(RenderStage.Dynamic)
    }
  )

  return new FlightRenderResult(flightReadableStream, {
    fetchMetrics: workStore.fetchMetrics,
  })
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
      createErrorContext(ctx, 'react-server-components-payload'),
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

  // TODO(cached-navs): this assumes that we checked during build that there's no sync IO.
  // but it can happen e.g. after a revalidation or conditionally for a param that wasn't prerendered.
  // we should change this to track sync IO, log an error and advance to dynamic.
  const shouldTrackSyncIO = false
  const stageController = new StagedRenderingController(
    null, // no aborting
    null, // no abandoning
    shouldTrackSyncIO
  )

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

  // Deferred promise for the static stage byte length. Flight serializes the
  // resolved value into the stream so the client knows where the static
  // prefix ends.
  let resolveStaticStageByteLength: (count: number) => void
  const staticStageByteLengthPromise = new Promise<number>((resolve) => {
    resolveStaticStageByteLength = resolve
  })

  // Check if this route has opted into runtime prefetching via
  // unstable_instant. If so, we piggyback on the dynamic render to fill caches
  // and then spawn a final runtime prerender whose result stream is embedded in
  // the RSC payload. This is gated on the explicit opt-in because it adds extra
  // server processing, increases the response payload size, and the runtime
  // prefetch output should have been validated first.
  const hasRuntimePrefetch =
    await anySegmentHasRuntimePrefetchEnabled(loaderTree)

  let runtimePrefetchStream: ReadableStream<Uint8Array> | undefined

  if (hasRuntimePrefetch) {
    // Create a mutable cache that gets filled during the dynamic render.
    const prerenderResumeDataCache = createPrerenderResumeDataCache()
    requestStore.prerenderResumeDataCache = prerenderResumeDataCache

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
    { staleTimeIterable, staticStageByteLengthPromise, runtimePrefetchStream }
  )

  const { clientModules } = getClientReferenceManifest()

  const flightStream = await runInSequentialTasks(
    () => {
      stageController.advanceStage(RenderStage.Static)

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

      countStaticStageBytesNode(staticStream, stageController).then(
        resolveStaticStageByteLength
      )

      return dynamicStream
    },
    () => {
      // This is a separate task that doesn't advance a stage. It forces
      // draining the microtask queue so that the stale time iterable and vary
      // params accumulators are closed before we advance to the dynamic stage.
      void finishStaleTimeTracking(staleTimeIterable)
      if (requestStore.varyParamsAccumulator) {
        void finishAccumulatingVaryParams(requestStore.varyParamsAccumulator)
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

    const { result } = await finalRuntimeServerPrerender(
      ctx,
      generateDynamicRSCPayload.bind(null, ctx, { staleTimeIterable }),
      prerenderResumeDataCache,
      null, // renderResumeDataCache
      rootParams,
      requestStore.headers,
      requestStore.cookies,
      requestStore.draftMode,
      onError,
      staleTimeIterable,
      false // forceOmitParams — server-initiated background prefetch, not a shell request
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

async function stagedRenderWithoutCachesInDevWeb(
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
  const stageController = new StagedRenderingController(
    null, // no aborting
    null, // no abandoning
    false // do not track sync IO (we don't have reliable stages)
  )

  const environmentName = () => {
    const currentStage = stageController.currentStage
    switch (currentStage) {
      case RenderStage.Before:
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
        return 'Prerender'
      case RenderStage.EarlyRuntime:
      case RenderStage.Runtime:
      case RenderStage.Dynamic:
      case RenderStage.Abandoned:
        return 'Server'
      default:
        currentStage satisfies never
        throw new InvariantError(`Invalid render stage: ${currentStage}`)
    }
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
      stageController.advanceStage(RenderStage.Static)
      return workUnitAsyncStorage.run(
        requestStore,
        renderToWebFlightStream,
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
      stageController.advanceStage(RenderStage.Dynamic)
    }
  )
}

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
  const stageController = new StagedRenderingController(
    null, // no aborting
    null, // no abandoning
    false // do not track sync IO (we don't have reliable stages)
  )

  const environmentName = () => {
    const currentStage = stageController.currentStage
    switch (currentStage) {
      case RenderStage.Before:
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
        return 'Prerender'
      case RenderStage.EarlyRuntime:
      case RenderStage.Runtime:
      case RenderStage.Dynamic:
      case RenderStage.Abandoned:
        return 'Server'
      default:
        currentStage satisfies never
        throw new InvariantError(`Invalid render stage: ${currentStage}`)
    }
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
      stageController.advanceStage(RenderStage.Static)
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
      stageController.advanceStage(RenderStage.Dynamic)
    }
  )
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
      createErrorContext(ctx, 'react-server-components-payload'),
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

    const {
      stream: serverStream,
      accumulatedChunksPromise,
      syncInterruptReason,
      startTime,
      staticStageEndTime,
      runtimeStageEndTime,
      debugChannel: returnedDebugChannel,
      requestStore: finalRequestStore,
    } = await (process.env.__NEXT_USE_NODE_STREAMS
      ? renderWithRestartOnCacheMissInDevNode(
          ctx,
          initialRequestStore,
          createRequestStore,
          getPayload,
          onError
        )
      : renderWithRestartOnCacheMissInDevWeb(
          ctx,
          initialRequestStore,
          createRequestStore,
          getPayload,
          onError
        ))

    if (shouldValidate) {
      let validationDebugChannelClient: AnyStream | undefined = undefined
      if (returnedDebugChannel) {
        const [t1, t2] = teeStream(returnedDebugChannel.clientSide.readable)
        returnedDebugChannel.clientSide.readable = t1
        validationDebugChannelClient = t2
      }
      consoleAsyncStorage.run(
        { dim: true },
        spawnStaticShellValidationInDev,
        accumulatedChunksPromise,
        syncInterruptReason,
        startTime,
        staticStageEndTime,
        runtimeStageEndTime,
        ctx,
        finalRequestStore,
        fallbackParams,
        validationDebugChannelClient,
        didErrorObservably
      )
    } else {
      logValidationSkipped(ctx)

      // The main render may record an invalid dynamic usage error on the work
      // store, e.g. a `'use cache'` fill timeout, or a request API like
      // `cookies()` being called inside a `'use cache'` scope. Even when we
      // don't spawn the static shell validation, surface any recorded error
      // through the dev overlay so client-side navigations see the same error
      // as initial HTML loads, where the spawned validation forwards it. Wait
      // for the full stream to finish accumulating so we also catch errors from
      // the dynamic stage.
      void accumulatedChunksPromise.then(() => {
        const { invalidDynamicUsageError } = workStore
        // Forward only if userland caught the rejection. If userland didn't
        // catch, the rejection propagated into the React render and React's
        // `serverComponentsErrorHandler` already stamped a digest on the error
        // and emitted it as a Flight error chunk — surfacing it again here
        // would duplicate the entry in the dev overlay.
        if (
          invalidDynamicUsageError &&
          !(invalidDynamicUsageError as { digest?: unknown }).digest
        ) {
          logMessagesAndSendErrorsToBrowser([invalidDynamicUsageError], ctx)
        }
      })
    }

    debugChannel = returnedDebugChannel
    stream = serverStream
  } else {
    // We're either bypassing caches or we can't restart the render.
    // Do a dynamic render, but with (basic) environment labels.

    // Set cache status to bypass when specifically bypassing caches in dev
    if (setCacheStatus) {
      setCacheStatus('bypass', htmlRequestId)
    }

    if (process.env.__NEXT_USE_NODE_STREAMS) {
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
    } else {
      debugChannel = setReactDebugChannel && createWebDebugChannel()

      stream = await stagedRenderWithoutCachesInDevWeb(
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
  forceOmitParams: boolean
): Promise<RenderResult> {
  const { workStore, renderOpts } = ctx
  const { isBuildTimePrerendering = false, onInstrumentationRequestError } =
    renderOpts

  function onFlightDataRenderError(err: DigestedError, silenceLog: boolean) {
    return onInstrumentationRequestError?.(
      err,
      req,
      // TODO(runtime-ppr): should we use a different value?
      createErrorContext(ctx, 'react-server-components-payload'),
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
  // We're not resuming an existing render.
  const renderResumeDataCache = null

  await prospectiveRuntimeServerPrerender(
    ctx,
    generateDynamicRSCPayload.bind(null, ctx),
    prerenderResumeDataCache,
    renderResumeDataCache,
    rootParams,
    requestStore.headers,
    requestStore.cookies,
    requestStore.draftMode,
    forceOmitParams
  )

  const response = await finalRuntimeServerPrerender(
    ctx,
    generateDynamicRSCPayload.bind(null, ctx, { staleTimeIterable }),
    prerenderResumeDataCache,
    renderResumeDataCache,
    rootParams,
    requestStore.headers,
    requestStore.cookies,
    requestStore.draftMode,
    onError,
    staleTimeIterable,
    forceOmitParams
  )

  applyMetadataFromPrerenderResult(response, metadata, workStore)
  metadata.fetchMetrics = ctx.workStore.fetchMetrics

  return new FlightRenderResult(response.result.prelude, metadata)
}

async function prospectiveRuntimeServerPrerender(
  ctx: AppRenderContext,
  getPayload: () => any,
  prerenderResumeDataCache: PrerenderResumeDataCache | null,
  renderResumeDataCache: RenderResumeDataCache | null,
  rootParams: Params,
  headers: PrerenderStoreModernRuntime['headers'],
  cookies: PrerenderStoreModernRuntime['cookies'],
  draftMode: PrerenderStoreModernRuntime['draftMode'],
  forceOmitParams: boolean
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
    renderResumeDataCache,
    prerenderResumeDataCache,
    hmrRefreshHash: undefined,
    // We don't track vary params during initial prerender, only the final one
    varyParamsAccumulator: null,
    // No stage sequencing needed for prospective renders.
    stagedRendering: null,
    // These are not present in regular prerenders, but allowed in a runtime prerender.
    headers,
    cookies,
    draftMode,
    forceOmitParams,
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
 * Prepends a single ASCII byte to the stream indicating whether the response
 * is partial (contains dynamic holes): '~' (0x7e) for partial, '#' (0x23)
 * for complete.
 */
function prependIsPartialByte(
  stream: ReadableStream<Uint8Array>,
  isPartial: boolean
): ReadableStream<Uint8Array> {
  const byte = new Uint8Array([isPartial ? 0x7e : 0x23])
  return stream.pipeThrough(
    new TransformStream({
      start(controller) {
        controller.enqueue(byte)
      },
    })
  )
}

async function finalRuntimeServerPrerender(
  ctx: AppRenderContext,
  getPayload: () => any,
  prerenderResumeDataCache: PrerenderResumeDataCache | null,
  renderResumeDataCache: RenderResumeDataCache | null,
  rootParams: Params,
  headers: PrerenderStoreModernRuntime['headers'],
  cookies: PrerenderStoreModernRuntime['cookies'],
  draftMode: PrerenderStoreModernRuntime['draftMode'],
  onError: (err: unknown) => string | undefined,
  staleTimeIterable: StaleTimeIterable,
  forceOmitParams: boolean
) {
  const { implicitTags, renderOpts } = ctx
  const { ComponentMod, experimental, isDebugDynamicAccesses } = renderOpts
  const selectStaleTime = createSelectStaleTime(experimental)

  let serverIsDynamic = false
  const finalServerController = new AbortController()

  const serverDynamicTracking = createDynamicTrackingState(
    isDebugDynamicAccesses
  )

  const finalStageController = new StagedRenderingController(
    finalServerController.signal,
    null, // no abandoning
    true // track sync IO
  )

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
    prerenderResumeDataCache,
    renderResumeDataCache,
    hmrRefreshHash: undefined,
    varyParamsAccumulator,
    // Used to separate the stages in the 5-task pipeline.
    stagedRendering: finalStageController,
    // These are not present in regular prerenders, but allowed in a runtime prerender.
    headers,
    cookies,
    draftMode,
    forceOmitParams,
  }

  trackStaleTime(finalServerPrerenderStore, staleTimeIterable, selectStaleTime)

  const { clientModules } = getClientReferenceManifest()

  const finalRSCPayload = await workUnitAsyncStorage.run(
    finalServerPrerenderStore,
    getPayload
  )

  let prerenderIsPending = true
  const result = await runInSequentialTasks(
    async () => {
      // EarlyStatic stage: render begins.
      // Runtime-prefetchable segments render immediately.
      // Non-prefetchable segments are gated until the Static stage.
      finalStageController.advanceStage(RenderStage.EarlyStatic)
      const prerenderResult = await workUnitAsyncStorage.run(
        finalServerPrerenderStore,
        getServerPrerender(ComponentMod),
        finalRSCPayload,
        clientModules,
        {
          filterStackFrame,
          onError,
          signal: finalServerController.signal,
        }
      )
      prerenderIsPending = false
      return prerenderResult
    },
    () => {
      // Advance to Static stage: resolve promise holding back
      // non-prefetchable segments so they can begin rendering.
      finalStageController.advanceStage(RenderStage.Static)
    },
    () => {
      // Advance to EarlyRuntime stage: resolve cookies/headers for
      // runtime-prefetchable segments. Sync IO is checked here.
      finalStageController.advanceStage(RenderStage.EarlyRuntime)
    },
    () => {
      // Advance to Runtime stage: resolve cookies/headers for
      // non-prefetchable segments. Sync IO is allowed here.
      finalStageController.advanceStage(RenderStage.Runtime)
    },
    () => {
      Promise.all([
        finishStaleTimeTracking(staleTimeIterable),
        finishAccumulatingVaryParams(varyParamsAccumulator),
      ]).then(() => {
        // Abort. This runs as a microtask after Flight has flushed the
        // staleTime and varyParams closing chunks, but before the next
        // macrotask resolves the overall result.
        if (finalServerController.signal.aborted) {
          // If the server controller is already aborted we must have called
          // something that required aborting the prerender synchronously such
          // as with new Date()
          serverIsDynamic = true
          return
        }

        if (prerenderIsPending) {
          // If prerenderIsPending then we have blocked for longer than a Task
          // and we assume there is something unfinished.
          serverIsDynamic = true
        }
        finalServerController.abort()
      })
    }
  )

  result.prelude = prependIsPartialByte(result.prelude, serverIsDynamic)

  return {
    result,
    // TODO(runtime-ppr): do we need to produce a digest map here?
    // digestErrorsMap: ...,
    dynamicAccess: serverDynamicTracking,
    isPartial: serverIsDynamic,
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
    staleTimeIterable?: AsyncIterable<number>
    staticStageByteLengthPromise?: Promise<number>
    runtimePrefetchStream?: ReadableStream<Uint8Array>
  }
): Promise<InitialRSCPayload & { P: ReactNode }> {
  const {
    is404,
    staleTimeIterable,
    staticStageByteLengthPromise,
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
    getDynamicParamFromSegment,
    query,
    appUsingSizeAdjustment,
    componentMod: { createMetadataComponents, createElement, Fragment },
    url,
    workStore,
  } = ctx

  const hints = ctx.renderOpts.prefetchHints?.[ctx.pagePath] ?? null
  const prefetchInliningEnabled = Boolean(
    ctx.renderOpts.experimental.prefetchInlining
  )
  const initialTree = await createFlightRouterStateFromLoaderTree(
    tree,
    hints,
    prefetchInliningEnabled,
    ctx.renderOpts.cacheComponents,
    workStore.isStaticGeneration,
    ctx.renderOpts.isBuildTimePrerendering ?? false,
    getDynamicParamFromSegment,
    query
  )
  const serveStreamingMetadata = !!ctx.renderOpts.serveStreamingMetadata
  const hasGlobalNotFound = !!tree[2]['global-not-found']

  const metadataIsRuntimePrefetchable =
    await anySegmentHasRuntimePrefetchEnabled(tree)
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
    isRuntimePrefetchable: metadataIsRuntimePrefetchable,
  })

  const preloadCallbacks: PreloadCallbacks = []

  const seedData = await createComponentTree({
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
  // See similar comment in create-component-tree.tsx for more context.
  const isPossiblyPartialHead =
    workStore.isStaticGeneration &&
    ctx.renderOpts.experimental.isRoutePPREnabled === true

  return maybeAppendBuildIdToRSCPayload(ctx, {
    // See the comment above the `Preloads` component (below) for why this is part of the payload
    P: createElement(Preloads, {
      preloadCallbacks: preloadCallbacks,
    }),
    c: prepareInitialCanonicalUrl(url),
    q: getRenderedSearch(query),
    i: !!couldBeIntercepted,
    f: [
      [
        initialTree,
        seedData,
        initialHead,
        isPossiblyPartialHead,
      ] as FlightDataPath,
    ],
    m: missingSlots,
    G: [GlobalError, globalErrorStyles],
    // Tells the client whether this route supports per-segment prefetching.
    // With Cache Components, all routes support it. Without it, only fully
    // static pages do, because their per-segment prefetch responses are
    // generated during static generation (build or ISR).
    S: workStore.isStaticGeneration || ctx.renderOpts.cacheComponents,
    h: getMetadataVaryParamsThenable(),
    s: staleTimeIterable,
    l: staticStageByteLengthPromise,
    p: runtimePrefetchStream,
    // Include the per-page dynamic stale time from unstable_dynamicStaleTime, but
    // only for dynamic renders. The client treats its presence as
    // authoritative.
    // TODO: Move this to the prefetch hints file so we don't have to walk
    // the tree on every render.
    d: !workStore.isStaticGeneration
      ? ((await getDynamicStaleTime(tree)) ?? undefined)
      : undefined,
  })
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
  errorType: MetadataErrorType | 'redirect' | undefined
) {
  const {
    getDynamicParamFromSegment,
    query,
    componentMod: { createMetadataComponents, createElement, Fragment },
    url,
    workStore,
  } = ctx

  const serveStreamingMetadata = !!ctx.renderOpts.serveStreamingMetadata
  const metadataIsRuntimePrefetchable =
    await anySegmentHasRuntimePrefetchEnabled(tree)
  const { Viewport, Metadata } = createMetadataComponents({
    tree,
    parsedQuery: query,
    pathname: url.pathname,
    metadataContext: createMetadataContext(ctx.renderOpts),
    errorType,
    interpolatedParams: ctx.interpolatedParams,
    serveStreamingMetadata: serveStreamingMetadata,
    isRuntimePrefetchable: metadataIsRuntimePrefetchable,
  })

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
    process.env.__NEXT_DEV_SERVER &&
      createElement('meta', {
        name: 'next-error',
        content: 'not-found',
      }),
    createElement(Metadata, null)
  )

  const errorHints = ctx.renderOpts.prefetchHints?.[ctx.pagePath] ?? null
  const errorPrefetchInliningEnabled = Boolean(
    ctx.renderOpts.experimental.prefetchInlining
  )
  const initialTree = await createFlightRouterStateFromLoaderTree(
    tree,
    errorHints,
    errorPrefetchInliningEnabled,
    ctx.renderOpts.cacheComponents,
    workStore.isStaticGeneration,
    ctx.renderOpts.isBuildTimePrerendering ?? false,
    getDynamicParamFromSegment,
    query
  )

  let err: Error | undefined = undefined
  if (ssrError) {
    err = isError(ssrError) ? ssrError : new Error(ssrError + '')
  }

  // For metadata notFound error there's no global not found boundary on top
  // so we create a not found page with AppRouter
  const seedData: CacheNodeSeedData = [
    createElement(
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
    ),
    {},
    null,
    false,
    null, // varyParams - not tracked for error pages
  ]

  const { GlobalError, styles: globalErrorStyles } = await getGlobalErrorStyles(
    tree,
    ctx
  )

  const isPossiblyPartialHead =
    workStore.isStaticGeneration &&
    ctx.renderOpts.experimental.isRoutePPREnabled === true

  return maybeAppendBuildIdToRSCPayload(ctx, {
    c: prepareInitialCanonicalUrl(url),
    q: getRenderedSearch(query),
    m: undefined,
    i: false,
    f: [
      [
        initialTree,
        seedData,
        initialHead,
        isPossiblyPartialHead,
      ] as FlightDataPath,
    ],
    G: [GlobalError, globalErrorStyles],
    // Tells the client whether this route supports per-segment prefetching.
    // With Cache Components, all routes support it. Without it, only fully
    // static pages do, because their per-segment prefetch responses are
    // generated during static generation (build or ISR).
    S: workStore.isStaticGeneration || ctx.renderOpts.cacheComponents,
    h: getMetadataVaryParamsThenable(),
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

  const actionQueue = createMutableActionQueue(initialState, null)

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

  const actionQueue = createMutableActionQueue(initialState, null)

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
 * `renderToHTMLOrFlightImpl` closure scope through globalThis.__next_require__.
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
      case 'prerender-ppr':
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
    serverActions,
    assetPrefix = '',
    enableTainting,
    cacheComponents,
    setIsrStatus,
  } = renderOpts

  const { cachedNavigations } = renderOpts.experimental

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
        if (metrics) {
          getTracer()
            .startSpan(NextNodeServerSpan.clientComponentLoading, {
              startTime: metrics.clientComponentLoadStart,
              attributes: {
                'next.clientComponentLoadCount':
                  metrics.clientComponentLoadCount,
                'next.span_type': NextNodeServerSpan.clientComponentLoading,
              },
            })
            .end(
              metrics.clientComponentLoadStart +
                metrics.clientComponentLoadTimes
            )
        }
      }
    })
  }

  const metadata: AppPageRenderResultMetadata = {
    statusCode: isNotFoundPath ? 404 : undefined,
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

  const { isStaticGeneration } = workStore

  let requestId: string
  let htmlRequestId: string

  const {
    flightRouterState,
    isPrefetchRequest,
    isRuntimePrefetchRequest,
    isAppShellPrefetchRequest,
    isRSCRequest,
    isHmrRefresh,
    nonce,
  } = parsedRequestHeaders

  if (parsedRequestHeaders.requestId) {
    // If the client has provided a request ID (in development mode), we use it.
    requestId = parsedRequestHeaders.requestId
  } else {
    // Otherwise we generate a new request ID.
    if (isStaticGeneration) {
      requestId = Buffer.from(
        await crypto.subtle.digest('SHA-1', Buffer.from(req.url))
      ).toString('hex')
    } else if (process.env.NEXT_RUNTIME === 'edge') {
      requestId = crypto.randomUUID()
    } else {
      requestId = (
        require('next/dist/compiled/nanoid') as typeof import('next/dist/compiled/nanoid')
      ).nanoid()
    }
  }

  // If the client has provided an HTML request ID, we use it to associate the
  // request with the HTML document from which it originated, which is used to
  // send debug information to the associated WebSocket client. Otherwise, this
  // is the request for the HTML document, so we use the request ID also as the
  // HTML request ID.
  htmlRequestId = parsedRequestHeaders.htmlRequestId || requestId

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
    parsedRequestHeaders,
    getDynamicParamFromSegment,
    interpolatedParams,
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

  if (isStaticGeneration) {
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
  } else {
    // We're rendering dynamically
    const renderResumeDataCache =
      renderOpts.renderResumeDataCache ??
      postponedState?.renderResumeDataCache ??
      null

    const rootParams = getRootParams(loaderTree, ctx.getDynamicParamFromSegment)
    const fallbackParams = getRequestMeta(req, 'fallbackParams') || null

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
      fallbackParams
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
          if (process.env.__NEXT_USE_NODE_STREAMS) {
            return generateStagedDynamicFlightRenderResultNode(
              req,
              ctx,
              requestStore
            )
          } else {
            return generateStagedDynamicFlightRenderResultWeb(
              req,
              ctx,
              requestStore
            )
          }
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
    // `spawnStaticShellValidationInDev` and the validation-skipped fallback in
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

  const { isPrefetchRequest, previouslyRevalidatedTags, nonce } =
    parsedRequestHeaders

  let interpolatedParams: Params
  let postponedState: PostponedState | null = null

  // If provided, the postpone state should be parsed so it can be provided to
  // React.
  if (typeof renderOpts.postponed === 'string') {
    if (fallbackRouteParams) {
      throw new InvariantError(
        'postponed state should not be provided when fallback params are provided'
      )
    }

    interpolatedParams = interpolateParallelRouteParams(
      renderOpts.ComponentMod.routeModule.userland.loaderTree,
      renderOpts.params ?? {},
      pagePath,
      fallbackRouteParams
    )

    postponedState = parsePostponedState(
      renderOpts.postponed,
      interpolatedParams,
      renderOpts.experimental.maxPostponedStateSizeBytes
    )
  } else {
    interpolatedParams = interpolateParallelRouteParams(
      renderOpts.ComponentMod.routeModule.userland.loaderTree,
      renderOpts.params ?? {},
      pagePath,
      fallbackRouteParams
    )
  }

  if (
    postponedState?.renderResumeDataCache &&
    renderOpts.renderResumeDataCache
  ) {
    throw new InvariantError(
      'postponed state and dev warmup immutable resume data cache should not be provided together'
    )
  }

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
    // The function to run
    renderToHTMLOrFlightImpl,
    // all of it's args
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
    shouldWaitOnAllReady,
    subresourceIntegrityManifest,
    supportsDynamicResponse,
    cacheComponents,
  } = renderOpts

  const { cachedNavigations } = renderOpts.experimental

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
  const bootstrapScriptContent = process.env.__NEXT_DEV_SERVER
    ? `self.__next_r=${JSON.stringify(requestId ?? crypto.randomUUID())}`
    : undefined

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
        createErrorContext(ctx, 'react-server-components'),
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
        createErrorContext(ctx, 'server-rendering'),
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
        if (process.env.__NEXT_USE_NODE_STREAMS) {
          // MARK: nodeStreams dev CacheComponents RSC
          let debugChannel: DebugChannelPair | undefined

          // eslint-disable-next-line @typescript-eslint/no-shadow
          const getPayload = async (requestStore: RequestStore) => {
            const payload: InitialRSCPayload & RSCPayloadDevProperties =
              await workUnitAsyncStorage.run(
                requestStore,
                getRSCPayload,
                tree,
                ctx,
                { is404: res.statusCode === 404 }
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
            const {
              stream: serverStream,
              accumulatedChunksPromise,
              syncInterruptReason,
              startTime,
              staticStageEndTime,
              runtimeStageEndTime,
              debugChannel: returnedDebugChannel,
              requestStore: finalRequestStore,
            } = await renderWithRestartOnCacheMissInDevNode(
              ctx,
              requestStore,
              createRequestStore,
              getPayload,
              serverComponentsErrorHandler
            )

            let validationDebugChannelClient: AnyStream | undefined = undefined
            if (returnedDebugChannel) {
              const [t1, t2] = teeStream(
                returnedDebugChannel.clientSide.readable
              )
              returnedDebugChannel.clientSide.readable = t1
              validationDebugChannelClient = t2
            }

            consoleAsyncStorage.run(
              { dim: true },
              spawnStaticShellValidationInDev,
              accumulatedChunksPromise,
              syncInterruptReason,
              startTime,
              staticStageEndTime,
              runtimeStageEndTime,
              ctx,
              finalRequestStore,
              fallbackParams,
              validationDebugChannelClient,
              didErrorObservably
            )

            reactServerResult = new ReactServerResult(serverStream)
            requestStore = finalRequestStore
            debugChannel = returnedDebugChannel
          } else {
            logValidationSkipped(ctx)

            // We're either bypassing caches or we can't restart the render.
            // Do a dynamic render, but with (basic) environment labels.

            debugChannel = setReactDebugChannel && createNodeDebugChannel()

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
          }

          if (debugChannel && setReactDebugChannel) {
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
        } else {
          // MARK: webstreams dev CacheComponents RSC
          let debugChannel: DebugChannelPair | undefined

          // eslint-disable-next-line @typescript-eslint/no-shadow
          const getPayload = async (requestStore: RequestStore) => {
            const payload: InitialRSCPayload & RSCPayloadDevProperties =
              await workUnitAsyncStorage.run(
                requestStore,
                getRSCPayload,
                tree,
                ctx,
                { is404: res.statusCode === 404 }
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
            const {
              stream: serverStream,
              accumulatedChunksPromise,
              syncInterruptReason,
              startTime,
              staticStageEndTime,
              runtimeStageEndTime,
              debugChannel: returnedDebugChannel,
              requestStore: finalRequestStore,
            } = await renderWithRestartOnCacheMissInDevWeb(
              ctx,
              requestStore,
              createRequestStore,
              getPayload,
              serverComponentsErrorHandler
            )

            let validationDebugChannelClient: AnyStream | undefined = undefined
            if (returnedDebugChannel) {
              const [t1, t2] = teeStream(
                returnedDebugChannel.clientSide.readable
              )
              returnedDebugChannel.clientSide.readable = t1
              validationDebugChannelClient = t2
            }

            consoleAsyncStorage.run(
              { dim: true },
              spawnStaticShellValidationInDev,
              accumulatedChunksPromise,
              syncInterruptReason,
              startTime,
              staticStageEndTime,
              runtimeStageEndTime,
              ctx,
              finalRequestStore,
              fallbackParams,
              validationDebugChannelClient,
              didErrorObservably
            )

            reactServerResult = new ReactServerResult(serverStream)
            requestStore = finalRequestStore
            debugChannel = returnedDebugChannel
          } else {
            logValidationSkipped(ctx)

            // We're either bypassing caches or we can't restart the render.
            // Do a dynamic render, but with (basic) environment labels.

            debugChannel = setReactDebugChannel && createWebDebugChannel()

            const serverStream = await stagedRenderWithoutCachesInDevWeb(
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
          }

          if (debugChannel && setReactDebugChannel) {
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
        }
      } else if (cacheComponents && cachedNavigations) {
        if (process.env.__NEXT_USE_NODE_STREAMS) {
          // MARK: nodeStreams cacheComponents RSC
          // Production Cache Components + Cached Navigations: use staged
          // rendering so the RSC payload includes the static stage byte length
          // (`l` field), enabling the client to cache the static subset during
          // hydration.

          const selectStaleTime = createSelectStaleTime(experimental)
          const staleTimeIterable = new StaleTimeIterable()

          // TODO(cached-navs): this assumes that we checked during build that there's no sync IO.
          // but it can happen e.g. after a revalidation or conditionally for a param that wasn't prerendered.
          // we should change this to track sync IO, log an error and advance to dynamic.
          const shouldTrackSyncIO = false
          const stageController = new StagedRenderingController(
            null, // no aborting
            null, // no abandoning
            shouldTrackSyncIO
          )

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

          let resolveStaticStageByteLength: (count: number) => void
          const staticStageByteLengthPromise = new Promise<number>(
            (resolve) => {
              resolveStaticStageByteLength = resolve
            }
          )

          // If the route has runtime prefetching enabled, spawn a runtime
          // prerender after the resume render fills caches. The result is
          // embedded in the initial RSC payload so the client can cache
          // runtime-prefetchable content during hydration.
          const hasRuntimePrefetch =
            await anySegmentHasRuntimePrefetchEnabled(tree)

          let runtimePrefetchStream: ReadableStream<Uint8Array> | undefined

          if (hasRuntimePrefetch) {
            const prerenderResumeDataCache = createPrerenderResumeDataCache()
            requestStore.prerenderResumeDataCache = prerenderResumeDataCache

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
              staleTimeIterable,
              staticStageByteLengthPromise,
              runtimePrefetchStream,
            }
          )

          const flightStream = await runInSequentialTasks(
            () => {
              stageController.advanceStage(RenderStage.Static)

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

              countStaticStageBytesNode(staticStream, stageController).then(
                resolveStaticStageByteLength!
              )

              return dynamicStream
            },
            () => {
              // This is a separate task that doesn't advance a stage. It forces
              // draining the microtask queue so that the stale time iterable and
              // vary params accumulators are closed before we advance to the
              // dynamic stage.
              void finishStaleTimeTracking(staleTimeIterable)
              if (requestStore.varyParamsAccumulator) {
                void finishAccumulatingVaryParams(
                  requestStore.varyParamsAccumulator
                )
              }
            },
            () => {
              stageController.advanceStage(RenderStage.Dynamic)
            }
          )

          reactServerResult = new ReactServerResult(flightStream)
        } else {
          // MARK: webstreams cacheComponents RSC
          // Production Cache Components + Cached Navigations: use staged
          // rendering so the RSC payload includes the static stage byte length
          // (`l` field), enabling the client to cache the static subset during
          // hydration.
          const { renderToReadableStream } = ctx.componentMod

          const selectStaleTime = createSelectStaleTime(experimental)
          const staleTimeIterable = new StaleTimeIterable()

          // TODO(cached-navs): this assumes that we checked during build that there's no sync IO.
          // but it can happen e.g. after a revalidation or conditionally for a param that wasn't prerendered.
          // we should change this to track sync IO, log an error and advance to dynamic.
          const shouldTrackSyncIO = false
          const stageController = new StagedRenderingController(
            null, // no aborting
            null, // no abandoning
            shouldTrackSyncIO
          )

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

          let resolveStaticStageByteLength: (count: number) => void
          const staticStageByteLengthPromise = new Promise<number>(
            (resolve) => {
              resolveStaticStageByteLength = resolve
            }
          )

          // If the route has runtime prefetching enabled, spawn a runtime
          // prerender after the resume render fills caches. The result is
          // embedded in the initial RSC payload so the client can cache
          // runtime-prefetchable content during hydration.
          const hasRuntimePrefetch =
            await anySegmentHasRuntimePrefetchEnabled(tree)

          let runtimePrefetchStream: ReadableStream<Uint8Array> | undefined

          if (hasRuntimePrefetch) {
            const prerenderResumeDataCache = createPrerenderResumeDataCache()
            requestStore.prerenderResumeDataCache = prerenderResumeDataCache

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
              staleTimeIterable,
              staticStageByteLengthPromise,
              runtimePrefetchStream,
            }
          )

          const flightStream = await runInSequentialTasks(
            () => {
              stageController.advanceStage(RenderStage.Static)

              const stream = workUnitAsyncStorage.run(
                requestStore,
                renderToReadableStream,
                RSCPayload,
                clientModules,
                {
                  onError: serverComponentsErrorHandler,
                  filterStackFrame,
                }
              )

              const [dynamicStream, staticStream] = stream.tee()

              countStaticStageBytes(staticStream, stageController).then(
                resolveStaticStageByteLength!
              )

              return dynamicStream
            },
            () => {
              // This is a separate task that doesn't advance a stage. It forces
              // draining the microtask queue so that the stale time iterable and
              // vary params accumulators are closed before we advance to the
              // dynamic stage.
              void finishStaleTimeTracking(staleTimeIterable)
              if (requestStore.varyParamsAccumulator) {
                void finishAccumulatingVaryParams(
                  requestStore.varyParamsAccumulator
                )
              }
            },
            () => {
              stageController.advanceStage(RenderStage.Dynamic)
            }
          )

          reactServerResult = new ReactServerResult(flightStream)
        }
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
              { is404: res.statusCode === 404 }
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
              { is404: res.statusCode === 404 }
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

        const generateStaticHTML =
          supportsDynamicResponse !== true || !!shouldWaitOnAllReady

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

        const { stream: htmlStream, allReady } = await workUnitAsyncStorage.run(
          requestStore,
          renderToNodeFizzStream,
          appElement,
          fizzOptions,
          { waitForAllReady: generateStaticHTML }
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
          isStaticGeneration: generateStaticHTML,
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

        const generateStaticHTML =
          supportsDynamicResponse !== true || !!shouldWaitOnAllReady

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
          isStaticGeneration: generateStaticHTML,
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
        '/_not-found/page'
      )

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
            errorType
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
          const generateStaticHTML =
            supportsDynamicResponse !== true || !!shouldWaitOnAllReady

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
                bootstrapScriptContent,
                bootstrapScripts: [errorBootstrapScript],
                formState,
              },
              { waitForAllReady: generateStaticHTML }
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
            isStaticGeneration: generateStaticHTML,
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
            errorType
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
          const generateStaticHTML =
            supportsDynamicResponse !== true || !!shouldWaitOnAllReady

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
                bootstrapScriptContent,
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
            isStaticGeneration: generateStaticHTML,
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

async function renderWithRestartOnCacheMissInDevWeb(
  ctx: AppRenderContext,
  initialRequestStore: RequestStore,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void
) {
  const { htmlRequestId, renderOpts } = ctx

  const { ComponentMod, setCacheStatus, setReactDebugChannel } = renderOpts

  let startTime = -Infinity

  // If the render is restarted, we'll recreate a fresh request store
  let requestStore: RequestStore = initialRequestStore

  const environmentName = () => {
    const currentStage = requestStore.stagedRendering!.currentStage
    switch (currentStage) {
      case RenderStage.Before:
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
        return 'Prerender'
      case RenderStage.EarlyRuntime:
        return 'Prefetch'
      case RenderStage.Runtime:
        return 'Prefetchable'
      case RenderStage.Dynamic:
      case RenderStage.Abandoned:
        return 'Server'
      default:
        currentStage satisfies never
        throw new InvariantError(`Invalid render stage: ${currentStage}`)
    }
  }

  //===============================================
  // Initial render
  //===============================================

  // Try to render the page and see if there's any cache misses.
  // If there are, wait for caches to finish and restart the render.

  // This render might end up being used as a prospective render (if there's cache misses),
  // so we need to set it up for filling caches.
  const cacheSignal = new CacheSignal()

  // If we encounter async modules that delay rendering, we'll also need to restart.
  // TODO(restart-on-cache-miss): technically, we only need to wait for pending *server* modules here,
  // but `trackPendingModules` doesn't distinguish between client and server.
  trackPendingModules(cacheSignal)

  const prerenderResumeDataCache = createPrerenderResumeDataCache()

  const initialReactController = new AbortController()
  const initialDataController = new AbortController() // Controls hanging promises we create
  const initialAbandonController = new AbortController() // Controls whether this render is abandoned
  const initialStageController = new StagedRenderingController(
    initialDataController.signal,
    initialAbandonController,
    true // track sync IO
  )

  requestStore.prerenderResumeDataCache = prerenderResumeDataCache
  // `getRenderResumeDataCache` will fall back to using `prerenderResumeDataCache` as `renderResumeDataCache`,
  // so not having a resume data cache won't break any expectations in case we don't need to restart.
  requestStore.renderResumeDataCache = null
  requestStore.stagedRendering = initialStageController
  requestStore.asyncApiPromises = createAsyncApiPromises(
    initialStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )
  requestStore.cacheSignal = cacheSignal

  let debugChannel = setReactDebugChannel && createWebDebugChannel()
  const { clientModules } = getClientReferenceManifest()

  // Note: The stage controller starts out in the `Before` stage,
  // where sync IO does not cause aborts, so it's okay if it happens before render.
  const initialRscPayload = await getPayload(requestStore)

  const initialStreamResult = await runInSequentialTasks(
    () => {
      initialStageController.advanceStage(RenderStage.EarlyStatic)
      startTime = performance.now() + performance.timeOrigin

      const streamPair = teeStream(
        workUnitAsyncStorage.run(
          requestStore,
          renderToWebFlightStream,
          ComponentMod,
          initialRscPayload,
          clientModules,
          {
            onError,
            environmentName,
            startTime,
            filterStackFrame,
            debugChannel: debugChannel?.serverSide,
            signal: initialReactController.signal,
          }
        )
      )

      // If we abort the render, we want to reject the stage-dependent promises as well.
      // Note that we want to install this listener after the render is started
      // so that it runs after react is finished running its abort code.
      initialReactController.signal.addEventListener(
        'abort',
        () => {
          const { reason } = initialReactController.signal
          initialDataController.abort(reason)
        },
        { once: true }
      )

      const stream = streamPair[0]
      const accumulatedChunksPromise = accumulateStreamChunks(
        streamPair[1],
        initialStageController,
        initialDataController.signal
      )

      initialDataController.signal.addEventListener(
        'abort',
        () => {
          accumulatedChunksPromise.catch(() => {})
          if (stream instanceof ReadableStream) {
            stream.cancel()
          } else {
            stream.destroy()
          }
        },
        { once: true }
      )

      return {
        stream,
        accumulatedChunksPromise,
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.Static)
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.EarlyRuntime)
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.Runtime)
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.Dynamic)
      }
    }
  )

  if (initialStageController.currentStage !== RenderStage.Abandoned) {
    // No cache misses. We can use the result as-is.
    return {
      stream: initialStreamResult.stream,
      accumulatedChunksPromise: initialStreamResult.accumulatedChunksPromise,
      syncInterruptReason: initialStageController.getSyncInterruptReason(),
      startTime,
      staticStageEndTime: initialStageController.getStaticStageEndTime(),
      runtimeStageEndTime: initialStageController.getRuntimeStageEndTime(),
      debugChannel,
      requestStore,
    }
  }

  if (process.env.__NEXT_DEV_SERVER && setCacheStatus) {
    setCacheStatus('filling', htmlRequestId)
  }

  // Cache miss. We will use the initial render to fill caches, and discard its result.
  // Then, we can render again with warm caches.

  // TODO(restart-on-cache-miss):
  // This might end up waiting for more caches than strictly necessary,
  // because we can't abort the render yet, and we'll let runtime/dynamic APIs resolve.
  // Ideally we'd only wait for caches that are needed in the static stage.
  // This will be optimized in the future by not allowing runtime/dynamic APIs to resolve.

  await cacheSignal.cacheReady()
  initialReactController.abort()

  //===============================================
  // Final render (restarted)
  //===============================================

  // The initial render acted as a prospective render to warm the caches.
  requestStore = createRequestStore()

  // We are going to render this pass all the way through because we've already
  // filled any caches so we won't be aborting this time.
  const abortSignal = null
  const finalStageController = new StagedRenderingController(
    abortSignal,
    null, // no abandoning
    true // track sync IO
  )

  // We've filled the caches, so now we can render as usual,
  // without any cache-filling mechanics.
  requestStore.prerenderResumeDataCache = null
  requestStore.renderResumeDataCache = createRenderResumeDataCache(
    prerenderResumeDataCache
  )
  requestStore.stagedRendering = finalStageController
  requestStore.cacheSignal = null
  requestStore.asyncApiPromises = createAsyncApiPromises(
    finalStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  // The initial render already wrote to its debug channel.
  // We're not using it, so we need to create a new one.
  debugChannel = setReactDebugChannel && createWebDebugChannel()

  // Note: The stage controller starts out in the `Before` stage,
  // where sync IO does not cause aborts, so it's okay if it happens before render.
  const finalRscPayload = await getPayload(requestStore)

  const finalStreamResult = await runInSequentialTasks(
    () => {
      finalStageController.advanceStage(RenderStage.EarlyStatic)
      startTime = performance.now() + performance.timeOrigin

      const streamPair = teeStream(
        workUnitAsyncStorage.run(
          requestStore,
          renderToWebFlightStream,
          ComponentMod,
          finalRscPayload,
          clientModules,
          {
            onError,
            environmentName,
            startTime,
            filterStackFrame,
            debugChannel: debugChannel?.serverSide,
          }
        )
      )

      return {
        stream: streamPair[0],
        accumulatedChunksPromise: accumulateStreamChunks(
          streamPair[1],
          finalStageController,
          null
        ),
      }
    },
    () => {
      // Static stage
      finalStageController.advanceStage(RenderStage.Static)
    },
    () => {
      // EarlyRuntime stage
      finalStageController.advanceStage(RenderStage.EarlyRuntime)
    },
    () => {
      // Runtime stage
      finalStageController.advanceStage(RenderStage.Runtime)
    },
    () => {
      // Dynamic stage
      finalStageController.advanceStage(RenderStage.Dynamic)
    }
  )

  if (process.env.__NEXT_DEV_SERVER && setCacheStatus) {
    setCacheStatus('filled', htmlRequestId)
  }

  return {
    stream: finalStreamResult.stream,
    accumulatedChunksPromise: finalStreamResult.accumulatedChunksPromise,
    syncInterruptReason: finalStageController.getSyncInterruptReason(),
    startTime,
    staticStageEndTime: finalStageController.getStaticStageEndTime(),
    runtimeStageEndTime: finalStageController.getRuntimeStageEndTime(),
    debugChannel,
    requestStore,
  }
}

async function renderWithRestartOnCacheMissInDevNode(
  ctx: AppRenderContext,
  initialRequestStore: RequestStore,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void
) {
  const { htmlRequestId, renderOpts } = ctx

  const { ComponentMod, setCacheStatus, setReactDebugChannel } = renderOpts

  let startTime = -Infinity

  // If the render is restarted, we'll recreate a fresh request store
  let requestStore: RequestStore = initialRequestStore

  const environmentName = () => {
    const currentStage = requestStore.stagedRendering!.currentStage
    switch (currentStage) {
      case RenderStage.Before:
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
        return 'Prerender'
      case RenderStage.EarlyRuntime:
        return 'Prefetch'
      case RenderStage.Runtime:
        return 'Prefetchable'
      case RenderStage.Dynamic:
      case RenderStage.Abandoned:
        return 'Server'
      default:
        currentStage satisfies never
        throw new InvariantError(`Invalid render stage: ${currentStage}`)
    }
  }

  //===============================================
  // Initial render
  //===============================================

  // Try to render the page and see if there's any cache misses.
  // If there are, wait for caches to finish and restart the render.

  // This render might end up being used as a prospective render (if there's cache misses),
  // so we need to set it up for filling caches.
  const cacheSignal = new CacheSignal()

  // If we encounter async modules that delay rendering, we'll also need to restart.
  // TODO(restart-on-cache-miss): technically, we only need to wait for pending *server* modules here,
  // but `trackPendingModules` doesn't distinguish between client and server.
  trackPendingModules(cacheSignal)

  const prerenderResumeDataCache = createPrerenderResumeDataCache()

  const initialReactController = new AbortController()
  const initialDataController = new AbortController() // Controls hanging promises we create
  const initialAbandonController = new AbortController() // Controls whether this render is abandoned
  const initialStageController = new StagedRenderingController(
    initialDataController.signal,
    initialAbandonController,
    true // track sync IO
  )

  requestStore.prerenderResumeDataCache = prerenderResumeDataCache
  // `getRenderResumeDataCache` will fall back to using `prerenderResumeDataCache` as `renderResumeDataCache`,
  // so not having a resume data cache won't break any expectations in case we don't need to restart.
  requestStore.renderResumeDataCache = null
  requestStore.stagedRendering = initialStageController
  requestStore.asyncApiPromises = createAsyncApiPromises(
    initialStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )
  requestStore.cacheSignal = cacheSignal

  let debugChannel = setReactDebugChannel && createNodeDebugChannel()
  const { clientModules } = getClientReferenceManifest()

  // Note: The stage controller starts out in the `Before` stage,
  // where sync IO does not cause aborts, so it's okay if it happens before render.
  const initialRscPayload = await getPayload(requestStore)

  const initialStreamResult = await runInSequentialTasks(
    () => {
      initialStageController.advanceStage(RenderStage.EarlyStatic)
      startTime = performance.now() + performance.timeOrigin

      const sourceStream = workUnitAsyncStorage.run(
        requestStore,
        renderToNodeFlightStream,
        ComponentMod,
        initialRscPayload,
        clientModules,
        {
          onError,
          environmentName,
          startTime,
          filterStackFrame,
          debugChannel: debugChannel?.serverSide,
          signal: initialReactController.signal,
        }
      ) as Readable
      const replayable = new ReplayableNodeStream(sourceStream)

      // If we abort the render, we want to reject the stage-dependent promises as well.
      // Note that we want to install this listener after the render is started
      // so that it runs after react is finished running its abort code.
      initialReactController.signal.addEventListener(
        'abort',
        () => {
          const { reason } = initialReactController.signal
          initialDataController.abort(reason)
        },
        { once: true }
      )

      const stream = replayable.createReplayStream()
      const accumulatedChunksPromise = accumulateStreamChunks(
        replayable.createReplayStream(),
        initialStageController,
        initialDataController.signal
      )

      initialDataController.signal.addEventListener(
        'abort',
        () => {
          accumulatedChunksPromise.catch(() => {})
          stream.destroy()
        },
        { once: true }
      )

      return {
        stream,
        accumulatedChunksPromise,
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.Static)
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.EarlyRuntime)
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.Runtime)
      }
    },
    () => {
      if (initialAbandonController.signal.aborted === true) {
        return
      } else if (cacheSignal.hasPendingReads()) {
        initialAbandonController.abort()
      } else {
        initialStageController.advanceStage(RenderStage.Dynamic)
      }
    }
  )

  if (initialStageController.currentStage !== RenderStage.Abandoned) {
    // No cache misses. We can use the result as-is.
    return {
      stream: initialStreamResult.stream,
      accumulatedChunksPromise: initialStreamResult.accumulatedChunksPromise,
      syncInterruptReason: initialStageController.getSyncInterruptReason(),
      startTime,
      staticStageEndTime: initialStageController.getStaticStageEndTime(),
      runtimeStageEndTime: initialStageController.getRuntimeStageEndTime(),
      debugChannel,
      requestStore,
    }
  }

  if (process.env.__NEXT_DEV_SERVER && setCacheStatus) {
    setCacheStatus('filling', htmlRequestId)
  }

  // Cache miss. We will use the initial render to fill caches, and discard its result.
  // Then, we can render again with warm caches.

  // TODO(restart-on-cache-miss):
  // This might end up waiting for more caches than strictly necessary,
  // because we can't abort the render yet, and we'll let runtime/dynamic APIs resolve.
  // Ideally we'd only wait for caches that are needed in the static stage.
  // This will be optimized in the future by not allowing runtime/dynamic APIs to resolve.

  await cacheSignal.cacheReady()
  initialReactController.abort()

  //===============================================
  // Final render (restarted)
  //===============================================

  // The initial render acted as a prospective render to warm the caches.
  requestStore = createRequestStore()

  // We are going to render this pass all the way through because we've already
  // filled any caches so we won't be aborting this time.
  const abortSignal = null
  const finalStageController = new StagedRenderingController(
    abortSignal,
    null, // no abandoning
    true // track sync IO
  )

  // We've filled the caches, so now we can render as usual,
  // without any cache-filling mechanics.
  requestStore.prerenderResumeDataCache = null
  requestStore.renderResumeDataCache = createRenderResumeDataCache(
    prerenderResumeDataCache
  )
  requestStore.stagedRendering = finalStageController
  requestStore.cacheSignal = null
  requestStore.asyncApiPromises = createAsyncApiPromises(
    finalStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  // The initial render already wrote to its debug channel.
  // We're not using it, so we need to create a new one.
  debugChannel = setReactDebugChannel && createNodeDebugChannel()

  // Note: The stage controller starts out in the `Before` stage,
  // where sync IO does not cause aborts, so it's okay if it happens before render.
  const finalRscPayload = await getPayload(requestStore)

  const finalStreamResult = await runInSequentialTasks(
    () => {
      finalStageController.advanceStage(RenderStage.EarlyStatic)
      startTime = performance.now() + performance.timeOrigin

      const finalSourceStream = workUnitAsyncStorage.run(
        requestStore,
        renderToNodeFlightStream,
        ComponentMod,
        finalRscPayload,
        clientModules,
        {
          onError,
          environmentName,
          startTime,
          filterStackFrame,
          debugChannel: debugChannel?.serverSide,
        }
      ) as Readable
      const finalReplayable = new ReplayableNodeStream(finalSourceStream)

      return {
        stream: finalReplayable.createReplayStream(),
        accumulatedChunksPromise: accumulateStreamChunks(
          finalReplayable.createReplayStream(),
          finalStageController,
          null
        ),
      }
    },
    () => {
      // Static stage
      finalStageController.advanceStage(RenderStage.Static)
    },
    () => {
      // EarlyRuntime stage
      finalStageController.advanceStage(RenderStage.EarlyRuntime)
    },
    () => {
      // Runtime stage
      finalStageController.advanceStage(RenderStage.Runtime)
    },
    () => {
      // Dynamic stage
      finalStageController.advanceStage(RenderStage.Dynamic)
    }
  )

  if (process.env.__NEXT_DEV_SERVER && setCacheStatus) {
    setCacheStatus('filled', htmlRequestId)
  }

  return {
    stream: finalStreamResult.stream,
    accumulatedChunksPromise: finalStreamResult.accumulatedChunksPromise,
    syncInterruptReason: finalStageController.getSyncInterruptReason(),
    startTime,
    staticStageEndTime: finalStageController.getStaticStageEndTime(),
    runtimeStageEndTime: finalStageController.getRuntimeStageEndTime(),
    debugChannel,
    requestStore,
  }
}

interface AccumulatedStreamChunks {
  readonly staticChunks: Array<Uint8Array>
  readonly runtimeChunks: Array<Uint8Array>
  readonly dynamicChunks: Array<Uint8Array>
}

async function accumulateStreamChunks(
  stream: AnyStream,
  stageController: StagedRenderingController,
  signal: AbortSignal | null
): Promise<AccumulatedStreamChunks> {
  const staticChunks: Array<Uint8Array> = []
  const runtimeChunks: Array<Uint8Array> = []
  const dynamicChunks: Array<Uint8Array> = []

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
        if (done) {
          cancel()
          break
        }
        accumulateChunk(
          stageController,
          staticChunks,
          runtimeChunks,
          dynamicChunks,
          value
        )
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
        accumulateChunk(
          stageController,
          staticChunks,
          runtimeChunks,
          dynamicChunks,
          value
        )
      }
    } catch (err) {
      if (!cancelled) {
        throw err
      }
    }
  }

  return { staticChunks, runtimeChunks, dynamicChunks }
}

function accumulateChunk(
  stageController: StagedRenderingController,
  staticChunks: Array<Uint8Array>,
  runtimeChunks: Array<Uint8Array>,
  dynamicChunks: Array<Uint8Array>,
  value: Uint8Array
): void {
  switch (stageController.currentStage) {
    case RenderStage.Before:
      throw new InvariantError('Unexpected stream chunk while in Before stage')
    case RenderStage.EarlyStatic:
    case RenderStage.Static:
      staticChunks.push(value)
    // fall through
    case RenderStage.EarlyRuntime:
    case RenderStage.Runtime:
      runtimeChunks.push(value)
    // fall through
    case RenderStage.Dynamic:
      dynamicChunks.push(value)
      break
    case RenderStage.Abandoned:
      break
    default:
      stageController.currentStage satisfies never
      break
  }
}

async function countStaticStageBytes(
  stream: ReadableStream<Uint8Array>,
  stageController: StagedRenderingController
): Promise<number> {
  let byteLength = 0
  const reader = stream.getReader()

  stageController.onStage(RenderStage.EarlyRuntime, () => {
    reader.cancel()
  })

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (stageController.currentStage <= RenderStage.Static) {
      byteLength += value.byteLength
    } else {
      reader.cancel()
      break
    }
  }

  return byteLength
}

async function countStaticStageBytesNode(
  stream: Readable,
  stageController: StagedRenderingController
): Promise<number> {
  let byteLength = 0
  let cancelled = false

  stageController.onStage(RenderStage.EarlyRuntime, () => {
    cancelled = true
    stream.destroy()
  })

  try {
    for await (const value of stream) {
      if (cancelled) break
      if (stageController.currentStage <= RenderStage.Static) {
        byteLength += (value as Uint8Array).byteLength
      } else {
        cancelled = true
        stream.destroy()
        break
      }
    }
  } catch (err) {
    if (!cancelled) {
      throw err
    }
  }

  return byteLength
}

function createAsyncApiPromises(
  stagedRendering: StagedRenderingController,
  cookies: RequestStore['cookies'],
  mutableCookies: RequestStore['mutableCookies'],
  headers: RequestStore['headers']
): NonNullable<RequestStore['asyncApiPromises']> {
  return {
    // Runtime APIs (for prefetch segments)
    cookies: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'cookies',
      cookies
    ),
    earlyCookies: stagedRendering.delayUntilStage(
      RenderStage.EarlyRuntime,
      'cookies',
      cookies
    ),
    mutableCookies: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'cookies',
      mutableCookies as RequestStore['cookies']
    ),
    earlyMutableCookies: stagedRendering.delayUntilStage(
      RenderStage.EarlyRuntime,
      'cookies',
      mutableCookies as RequestStore['cookies']
    ),
    headers: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'headers',
      headers
    ),
    earlyHeaders: stagedRendering.delayUntilStage(
      RenderStage.EarlyRuntime,
      'headers',
      headers
    ),
    // These are not used directly, but we chain other `params`/`searchParams` promises off of them.
    sharedParamsParent: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      undefined,
      '<internal params>'
    ),
    earlySharedParamsParent: stagedRendering.delayUntilStage(
      RenderStage.EarlyRuntime,
      undefined,
      '<internal params>'
    ),
    sharedSearchParamsParent: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      undefined,
      '<internal searchParams>'
    ),
    earlySharedSearchParamsParent: stagedRendering.delayUntilStage(
      RenderStage.EarlyRuntime,
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
      '<VALIDATION_MESSAGE>' +
        JSON.stringify({ type: 'validation_start', requestId, url }) +
        '</VALIDATION_MESSAGE>'
    )
    console.log(
      '<VALIDATION_MESSAGE>' +
        JSON.stringify({ type: 'validation_end', requestId, url }) +
        '</VALIDATION_MESSAGE>'
    )
  }
}

async function spawnStaticShellValidationInDev(
  ...args: Parameters<typeof spawnStaticShellValidationInDevImpl>
) {
  if (process.env.__NEXT_TEST_MODE && process.env.NEXT_TEST_LOG_VALIDATION) {
    const ctx: AppRenderContext = args[5]
    const requestId = ctx.requestId
    const url = ctx.url.href
    console.log(
      '<VALIDATION_MESSAGE>' +
        JSON.stringify({ type: 'validation_start', requestId, url }) +
        '</VALIDATION_MESSAGE>'
    )
    try {
      return await spawnStaticShellValidationInDevImpl(...args)
    } finally {
      console.log(
        '<VALIDATION_MESSAGE>' +
          JSON.stringify({ type: 'validation_end', requestId, url }) +
          '</VALIDATION_MESSAGE>'
      )
    }
  } else {
    return await spawnStaticShellValidationInDevImpl(...args)
  }
}

/**
 * This function is a fork of prerenderToStream cacheComponents branch.
 * While it doesn't return a stream we want it to have identical
 * prerender semantics to prerenderToStream and should update it
 * in conjunction with any changes to that function.
 */
async function spawnStaticShellValidationInDevImpl(
  accumulatedChunksPromise: Promise<AccumulatedStreamChunks>,
  syncInterruptReason: Error | null,
  startTime: number,
  staticStageEndTime: number,
  runtimeStageEndTime: number,
  ctx: AppRenderContext,
  requestStore: RequestStore,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  debugChannelClient: AnyStream | undefined,
  devRenderDidError: boolean
): Promise<void> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  const {
    componentMod: ComponentMod,
    getDynamicParamFromSegment,
    renderOpts,
    workStore,
  } = ctx

  const loaderTree = ComponentMod.routeModule.userland.loaderTree

  const allowEmptyStaticShell =
    (renderOpts.allowEmptyStaticShell ?? false) ||
    (await isPageAllowedToBlock(loaderTree))

  const rootParams = getRootParams(loaderTree, getDynamicParamFromSegment)

  const hmrRefreshHash = getHmrRefreshHash(requestStore)

  const { invalidDynamicUsageError } = workStore
  if (invalidDynamicUsageError) {
    // We don't need to continue the prerender process if we already detected
    // invalid dynamic usage in the initial prerender phase. Forward the error
    // to the dev overlay only when userland caught the rejection. If userland
    // didn't catch, the rejection propagated into the React render and React's
    // `serverComponentsErrorHandler` already stamped a digest on the error and
    // emitted it as a Flight error chunk — surfacing it again here would
    // duplicate the entry in the dev overlay.
    if (!(invalidDynamicUsageError as { digest?: unknown }).digest) {
      return logMessagesAndSendErrorsToBrowser([invalidDynamicUsageError], ctx)
    }
    return
  }

  if (syncInterruptReason) {
    return logMessagesAndSendErrorsToBrowser([syncInterruptReason], ctx)
  }

  let debugChunks: Uint8Array[] | null = null
  if (debugChannelClient) {
    debugChunks = []
    ;(async () => {
      for await (const c of debugChannelClient) {
        debugChunks.push(c)
      }
    })()
  }

  const accumulatedChunks = await accumulatedChunksPromise
  const { staticChunks, runtimeChunks, dynamicChunks } = accumulatedChunks

  const needsInstantValidation =
    await anySegmentNeedsInstantValidationInDev(loaderTree)

  // `samples` from instant config are only used during build
  const validationSamples = null
  const validationSampleTracking = null

  // First we warmup SSR with the runtime chunks. This ensures that when we do
  // the full prerender pass with dynamic tracking module loading won't
  // interrupt the prerender and can properly observe the entire content
  await warmupClientModulesForStagedValidation(
    // if we're going to be validating prefetches, we'll be rendering some segments in the dynamic stage.
    // otherwise, for static shell validation, we only need to warm up to the runtime stage.
    // we also need to use a different store type, because instant validation allows more APIs to resolve.
    needsInstantValidation ? 'validation-client' : 'prerender-client',
    needsInstantValidation ? dynamicChunks : runtimeChunks,
    dynamicChunks,
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    validationSamples,
    validationSampleTracking
  )

  debug?.(`Starting static shell validation...`)

  const runtimeResult = await validateStagedShell(
    runtimeChunks,
    dynamicChunks,
    debugChunks,
    runtimeStageEndTime,
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    hmrRefreshHash,
    trackDynamicHoleInRuntimeShell
  )

  if (runtimeResult.length > 0) {
    debug?.(`❌ Failed - ${runtimeResult.length} errors from runtime stage`)
    // We have something to report from the runtime validation
    // We can skip the rest
    return logMessagesAndSendErrorsToBrowser(runtimeResult, ctx)
  }

  const staticResult = await validateStagedShell(
    staticChunks,
    dynamicChunks,
    debugChunks,
    staticStageEndTime,
    rootParams,
    fallbackRouteParams,
    allowEmptyStaticShell,
    ctx,
    hmrRefreshHash,
    trackDynamicHoleInStaticShell
  )

  if (staticResult.length > 0) {
    debug?.(`❌ Failed - ${staticResult.length} errors from static stage`)
    // We have something to report from the static validation
    // We can skip the rest
    return logMessagesAndSendErrorsToBrowser(staticResult, ctx)
  }
  debug?.(`✅ Passed`)

  if (needsInstantValidation) {
    const instantConfigsResult = await validateInstantConfigs(
      accumulatedChunks,
      debugChunks,
      startTime,
      rootParams,
      fallbackRouteParams,
      ctx,
      hmrRefreshHash,
      validationSamples,
      devRenderDidError
    )

    if (instantConfigsResult.length > 0) {
      return logMessagesAndSendErrorsToBrowser(instantConfigsResult, ctx)
    }
  }
}

async function warmupClientModulesForStagedValidation(
  storeType: PrerenderStoreModernClient['type'] | ValidationStoreClient['type'],
  partialServerChunks: Array<Uint8Array>,
  allServerChunks: Array<Uint8Array>,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  allowEmptyStaticShell: boolean,
  ctx: AppRenderContext,
  validationSamples: ValidationStoreClient['validationSamples'],
  validationSampleTracking: ValidationStoreClient['validationSampleTracking']
) {
  const { implicitTags, nonce, workStore } = ctx

  // Warmup SSR
  const initialClientPrerenderController = new AbortController()
  const initialClientReactController = new AbortController()
  const initialClientRenderController = new AbortController()

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
      allowEmptyStaticShell,
      revalidate: INFINITE_CACHE,
      expire: INFINITE_CACHE,
      stale: INFINITE_CACHE,
      tags: [...implicitTags.tags],
      // TODO should this be removed from client stores?
      prerenderResumeDataCache: null,
      renderResumeDataCache: null,
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
      prerenderResumeDataCache: null,
      renderResumeDataCache: null,
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
    initialClientReactController.signal
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
      // We don't need bootstrap scripts in this prerender
      // bootstrapScripts: [bootstrapScript],
    }
  )

  // The listener to abort our own render controller must be added after React
  // has added its listener, to ensure that pending I/O is not
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
  const cacheSignal = new CacheSignal()
  trackPendingModules(cacheSignal)
  await cacheSignal.cacheReady()
  initialClientReactController.abort()
}

async function validateStagedShell(
  stageChunks: Array<Uint8Array>,
  allServerChunks: Array<Uint8Array>,
  debugChunks: null | Array<Uint8Array>,
  debugEndTime: number | undefined,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  allowEmptyStaticShell: boolean,
  ctx: AppRenderContext,
  hmrRefreshHash: string | undefined,
  trackDynamicHole:
    | typeof trackDynamicHoleInStaticShell
    | typeof trackDynamicHoleInRuntimeShell
): Promise<Array<unknown>> {
  const { implicitTags, nonce, workStore } = ctx

  const clientDynamicTracking = createDynamicTrackingState(
    false //isDebugDynamicAccesses
  )
  const clientReactController = new AbortController()
  const clientRenderController = new AbortController()

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
    allowEmptyStaticShell,
    revalidate: INFINITE_CACHE,
    expire: INFINITE_CACHE,
    stale: INFINITE_CACHE,
    tags: [...implicitTags.tags],
    // TODO should this be removed from client stores?
    prerenderResumeDataCache: null,
    renderResumeDataCache: null,
    hmrRefreshHash,
    // Client prerenders don't track server param access
    varyParamsAccumulator: null,
  }

  const dynamicValidation = createDynamicValidationState()

  const serverStream = createNodeStreamWithLateRelease(
    stageChunks,
    allServerChunks,
    clientReactController.signal
  )

  const debugChannelClient = debugChunks
    ? createNodeStreamWithLateRelease(
        debugChunks,
        debugChunks,
        clientReactController.signal
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
            signal: clientReactController.signal,
            onError: (err: unknown, errorInfo: ErrorInfo) => {
              if (
                isPrerenderInterruptedError(err) ||
                clientReactController.signal.aborted
              ) {
                const componentStack = errorInfo.componentStack
                if (typeof componentStack === 'string') {
                  trackDynamicHole(
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
        clientReactController.signal.addEventListener(
          'abort',
          () => {
            clientRenderController.abort()
          },
          { once: true }
        )

        return pendingFinalClientResult
      },
      () => {
        clientReactController.abort()
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
 * contains any `unstable_instant` configs, the payload is rendered to
 * detect dynamic holes without Suspense.
 */
async function validateInstantConfigs(
  accumulatedChunks: AccumulatedStreamChunks,
  debugChunks: null | Array<Uint8Array>,
  startTime: number,
  rootParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  ctx: AppRenderContext,
  hmrRefreshHash: string | undefined,
  validationSamples: ValidationStoreClient['validationSamples'] | null,
  devRenderDidError: boolean
): Promise<Array<unknown>> {
  const debug =
    process.env.NEXT_PRIVATE_DEBUG_VALIDATION === '1' ? console.log : undefined

  const {
    createCombinedPayloadAtDepth,
    createCombinedPayloadStream,
    collectStagedSegmentData,
    discoverValidationDepths,
  } = ctx.componentMod.InstantValidation()!

  const { createValidationSampleTracking } =
    require('./instant-validation/instant-samples') as typeof import('./instant-validation/instant-samples')

  debug?.('\nStarting depth-based instant validation...')

  const loaderTree = ctx.componentMod.routeModule.userland.loaderTree

  // Only affects a debug environment name label, not functional behavior.
  const hasRuntimePrefetch = true

  const clientReferenceManifest = getClientReferenceManifest()

  const renderFlightStream = process.env.__NEXT_USE_NODE_STREAMS
    ? renderToNodeFlightStream
    : renderToWebFlightStream
  const createDebugChannel = process.env.__NEXT_USE_NODE_STREAMS
    ? createNodeDebugChannel
    : createWebDebugChannel

  const {
    cache,
    payload: initialRscPayload,
    stageEndTimes,
  } = await collectStagedSegmentData(
    ctx.componentMod,
    renderFlightStream,
    {
      [RenderStage.Static]: accumulatedChunks.staticChunks,
      [RenderStage.Runtime]: accumulatedChunks.runtimeChunks,
      [RenderStage.Dynamic]: accumulatedChunks.dynamicChunks,
    },
    debugChunks,
    startTime,
    hasRuntimePrefetch,
    clientReferenceManifest,
    createDebugChannel
  )

  const { implicitTags, nonce, workStore } = ctx
  const isDebugChannelEnabled = !!ctx.renderOpts.setReactDebugChannel

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
    const extraChunksController = new AbortController()

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
      initialRscPayload,
      cache,
      loaderTree,
      ctx.getDynamicParamFromSegment,
      ctx.query,
      depth,
      groupDepthForValidation,
      extraChunksController.signal,
      boundaryState,
      clientReferenceManifest,
      stageEndTimes,
      useRuntimeStageForPartialSegments
    )

    if (payloadResult === null) {
      return null
    }

    const reactController = new AbortController()
    const renderController = new AbortController()
    const preinitScripts = () => {}
    const { ServerInsertedHTMLProvider } = createServerInsertedHTML()

    const { stream: serverStream, debugStream } =
      await createCombinedPayloadStream(
        ctx.componentMod,
        renderFlightStream,
        payloadResult.payload,
        extraChunksController,
        reactController.signal,
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
      prerenderResumeDataCache: null,
      renderResumeDataCache: null,
      hmrRefreshHash,
      varyParamsAccumulator: null,
      boundaryState,
      fallbackRouteParams,
      validationSamples,
      validationSampleTracking,
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
              signal: reactController.signal,
              onError: (err: unknown, errorInfo: ErrorInfo) => {
                if (
                  isPrerenderInterruptedError(err) ||
                  reactController.signal.aborted
                ) {
                  const componentStack = errorInfo.componentStack
                  if (typeof componentStack === 'string') {
                    trackDynamicHoleInNavigation(
                      workStore,
                      componentStack,
                      instantValidationState,
                      clientDynamicTracking,
                      payloadResult.hasAmbiguousErrors
                        ? DynamicHoleKind.Runtime
                        : DynamicHoleKind.Dynamic,
                      boundaryState
                    )
                  }
                  return
                } else if (!reactController.signal.aborted) {
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

          reactController.signal.addEventListener(
            'abort',
            () => {
              renderController.abort()
            },
            { once: true }
          )

          return pendingResult
        },
        () => {
          reactController.abort()
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
      debug?.(
        `Trying depth ${depth}` +
          (currentGroupDepth > 0
            ? ` + groupDepth ${currentGroupDepth}...`
            : '...')
      )

      const result = await validateAtDepth(depth, currentGroupDepth)

      if (Array.isArray(result)) {
        const errors: Array<Error> = result
        // Validation completed at least partially.
        if (errors.length > 0) {
          // There were issues with producing an instant UI for this attempted navigation
          debug?.(
            `  Depth ${depth}+${currentGroupDepth}: ❌ Failed (${errors.length} errors)`
          )
          return errors
        } else {
          // There is nothing blocking instant UI for this simluated navigation
          debug?.(`  Depth ${depth}+${currentGroupDepth}: ✅ Passed`)
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
  const initialStageController = new StagedRenderingController(
    initialDataController.signal,
    initialAbandonController,
    true // track sync IO
  )

  requestStore.prerenderResumeDataCache = prerenderResumeDataCache
  requestStore.renderResumeDataCache = null
  requestStore.stagedRendering = initialStageController
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
      initialStageController.advanceStage(RenderStage.EarlyStatic)
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
      advanceStageIfNoCacheMiss(RenderStage.EarlyRuntime)
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
  initialReactController.abort()

  //===============================================
  // Final render (restarted, with warm caches)
  //===============================================

  requestStore = createRequestStore()

  // Unlike dev, where we're re-using the render that'll be visible in the browser,
  // we *can* abort the validation render.

  const finalReactController = new AbortController()
  const finalDataController = new AbortController()
  const finalStageController = new StagedRenderingController(
    finalDataController.signal, // abortable
    null, // no abandoning
    true // track sync IO
  )

  requestStore.prerenderResumeDataCache = null
  requestStore.renderResumeDataCache = createRenderResumeDataCache(
    prerenderResumeDataCache
  )
  requestStore.stagedRendering = finalStageController
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
      finalStageController.advanceStage(RenderStage.EarlyStatic)
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
    () => {
      finalStageController.advanceStage(RenderStage.Static)
    },
    () => {
      finalStageController.advanceStage(RenderStage.EarlyRuntime)
    },
    () => {
      finalStageController.advanceStage(RenderStage.Runtime)
    },
    () => {
      finalStageController.advanceStage(RenderStage.Dynamic)
    }
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
    const requestId = Date.now()
    const route = ctx.workStore.route
    console.error(
      '<VALIDATION_MESSAGE>' +
        JSON.stringify({
          type: 'validation_start',
          requestId,
          url: route,
        }) +
        '</VALIDATION_MESSAGE>'
    )
    try {
      return await run()
    } finally {
      console.error(
        '<VALIDATION_MESSAGE>' +
          JSON.stringify({
            type: 'validation_end',
            requestId,
            url: route,
          }) +
          '</VALIDATION_MESSAGE>'
      )
    }
  } else {
    return await run()
  }
}

/**
 * Runs instant validation at build time using the `samples` from `unstable_instant`.
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
    isStaticGeneration: false,
    page: outerWorkStore.page,
    route: outerWorkStore.route,
    incrementalCache: outerWorkStore.incrementalCache,
    cacheLifeProfiles: outerWorkStore.cacheLifeProfiles,
    useCacheTimeout: outerWorkStore.useCacheTimeout,
    staticPageGenerationTimeout: outerWorkStore.staticPageGenerationTimeout,
    isBuildTimePrerendering: false,
    fetchCache: outerWorkStore.fetchCache,
    isOnDemandRevalidate: false,

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
      parsedRequestHeaders: outerCtx.parsedRequestHeaders,
      getDynamicParamFromSegment,
      interpolatedParams: sampleParams,
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
        // These will be set when rendering
        renderResumeDataCache: null,
        prerenderResumeDataCache: null,
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
      validationCtx,
      createRequestStore(),
      createRequestStore,
      (requestStore) =>
        workUnitAsyncStorage.run(
          requestStore,
          getRSCPayload,
          loaderTree,
          validationCtx,
          { is404: false }
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

    const allowEmptyStaticShell =
      (validationCtx.renderOpts.allowEmptyStaticShell ?? false) ||
      (await isPageAllowedToBlock(loaderTree))

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
    await warmupClientModulesForStagedValidation(
      'validation-client',
      accumulatedChunks.dynamicChunks,
      accumulatedChunks.dynamicChunks,
      sampleRootParams,
      fallbackRouteParams,
      allowEmptyStaticShell,
      validationCtx,
      validationSamples,
      warmupValidationSamplesTracking
    )
    if (warmupValidationSamplesTracking.missingSampleErrors.length > 0) {
      return warmupValidationSamplesTracking.missingSampleErrors
    }

    return await validateInstantConfigs(
      accumulatedChunks,
      debugChunks,
      startTime,
      sampleRootParams,
      fallbackRouteParams,
      validationCtx,
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

/**
 * Determines whether we should generate static flight data.
 */
// TODO: This helper used to exclude fallback route params. It now only checks
// static generation inside prerenderToStream and can be removed. LOE: low.
function shouldGenerateStaticFlightData(workStore: WorkStore): boolean {
  const { isStaticGeneration } = workStore
  if (!isStaticGeneration) return false

  return true
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

  const { reactServerErrorsByDigest } = workStore
  // We don't report errors during prerendering through our instrumentation hooks
  const reportErrors = !experimental.isRoutePPREnabled
  function onHTMLRenderRSCError(err: DigestedError, silenceLog: boolean) {
    if (reportErrors) {
      return onInstrumentationRequestError?.(
        err,
        req,
        createErrorContext(ctx, 'react-server-components'),
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
        createErrorContext(ctx, 'server-rendering'),
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
  let reactServerPrerenderResumeDataCache: null | PrerenderResumeDataCache =
    null
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

      // Always start with a fresh prerender RDC so warmup can fill misses,
      // even when we have a prefilled render RDC to seed from.
      const prerenderResumeDataCache = createPrerenderResumeDataCache()
      reactServerPrerenderResultIsDynamic = null
      reactServerPrerenderResumeDataCache = prerenderResumeDataCache
      reactServerPrerenderStore = null
      let renderResumeDataCache: RenderResumeDataCache | null =
        renderOpts.renderResumeDataCache ?? null

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
        // During the initial prerender we need to track all cache reads to ensure
        // we render long enough to fill every cache it is possible to visit during
        // the final prerender.
        cacheSignal,
        dynamicTracking: null,
        allowEmptyStaticShell,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        prerenderResumeDataCache,
        renderResumeDataCache,
        hmrRefreshHash: undefined,
        // We don't track vary params during initial prerender, only the final one
        varyParamsAccumulator: null,
      }

      // We're not going to use the result of this render because the only time it could be used
      // is if it completes in a microtask and that's likely very rare for any non-trivial app
      const initialServerPayload = await workUnitAsyncStorage.run(
        initialServerPayloadPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        { is404: res.statusCode === 404 }
      )

      const initialServerPrerenderStore: PrerenderStore = (prerenderStore = {
        type: 'prerender',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        renderSignal: initialServerRenderController.signal,
        controller: initialServerPrerenderController,
        // During the initial prerender we need to track all cache reads to ensure
        // we render long enough to fill every cache it is possible to visit during
        // the final prerender.
        cacheSignal,
        dynamicTracking: null,
        allowEmptyStaticShell,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        prerenderResumeDataCache,
        renderResumeDataCache,
        hmrRefreshHash: undefined,
        // We don't track vary params during initial prerender, only the final one
        varyParamsAccumulator: null,
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
          allowEmptyStaticShell,
          revalidate: INFINITE_CACHE,
          expire: INFINITE_CACHE,
          stale: INFINITE_CACHE,
          tags: [...implicitTags.tags],
          prerenderResumeDataCache,
          renderResumeDataCache,
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
        initialClientReactController.abort()
      }

      if (renderOpts.renderResumeDataCache) {
        // Swap to the warmed cache so the final render uses entries produced during warmup.
        renderResumeDataCache = createRenderResumeDataCache(
          prerenderResumeDataCache
        )
      }

      const finalServerReactController = new AbortController()
      const finalServerRenderController = new AbortController()

      const varyParamsAccumulator = createResponseVaryParamsAccumulator()

      const finalServerPayloadPrerenderStore: PrerenderStore = {
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
        // All caches we could read must already be filled so no tracking is necessary
        cacheSignal: null,
        dynamicTracking: null,
        allowEmptyStaticShell,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        prerenderResumeDataCache,
        renderResumeDataCache,
        hmrRefreshHash: undefined,
        varyParamsAccumulator,
      }

      const finalAttemptRSCPayload = await workUnitAsyncStorage.run(
        finalServerPayloadPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        { is404: res.statusCode === 404 }
      )

      let staleTimeIterable: StaleTimeIterable | undefined
      if (cachedNavigations) {
        staleTimeIterable = new StaleTimeIterable()
        finalAttemptRSCPayload.s = staleTimeIterable
      }

      const serverDynamicTracking = createDynamicTrackingState(
        isDebugDynamicAccesses
      )
      let serverIsDynamic = false

      const finalServerPrerenderStore: PrerenderStore = (prerenderStore = {
        type: 'prerender',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        renderSignal: finalServerRenderController.signal,
        controller: finalServerReactController,
        // All caches we could read must already be filled so no tracking is necessary
        cacheSignal: null,
        dynamicTracking: serverDynamicTracking,
        allowEmptyStaticShell,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        prerenderResumeDataCache,
        renderResumeDataCache,
        hmrRefreshHash: undefined,
        varyParamsAccumulator,
      })

      if (staleTimeIterable !== undefined) {
        trackStaleTime(
          finalServerPrerenderStore,
          staleTimeIterable,
          selectStaleTime
        )
      }

      let prerenderIsPending = true
      const finalRSCPrerenderOptions = {
        filterStackFrame,
        onError: (err: unknown) => {
          return serverComponentsErrorHandler(err)
        },
        signal: finalServerReactController.signal,
      }
      const finalRSCAbortCallback = async () => {
        // Now that the prerendering is complete, we know the final stale
        // time and vary params. Close the stale time iterable and resolve
        // the vary params thenable so Flight can serialize their values
        // into the stream. The timing here is important: both were
        // included in the Flight payload, but they can only be serialized
        // at the very end, after all the components have finished.
        //
        // We resolve these directly here instead of reading from the work
        // unit store because this callback runs in a separate task (via
        // setTimeout) and may not have access to the async storage context.
        const pendingFinishes: Promise<void>[] = [
          finishAccumulatingVaryParams(varyParamsAccumulator),
        ]
        if (staleTimeIterable !== undefined) {
          pendingFinishes.push(finishStaleTimeTracking(staleTimeIterable))
        }
        await Promise.all(pendingFinishes)

        if (finalServerReactController.signal.aborted) {
          // If the server controller is already aborted we must have called something
          // that required aborting the prerender synchronously such as with new Date()
          serverIsDynamic = true
          return
        }

        if (prerenderIsPending) {
          // If prerenderIsPending then we have blocked for longer than a Task and we assume
          // there is something unfinished.
          serverIsDynamic = true
        }

        finalServerReactController.abort()
      }
      const finalRSCPrerenderFn = async () => {
        const pendingPrerenderResult = workUnitAsyncStorage.run(
          // The store to scope
          finalServerPrerenderStore,
          // The function to run
          getServerPrerender(ComponentMod),
          // ... the arguments for the function to run
          finalAttemptRSCPayload,
          clientModules,
          finalRSCPrerenderOptions
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

        const prerenderResult = await pendingPrerenderResult
        prerenderIsPending = false

        return prerenderResult
      }
      const reactServerResult = (reactServerPrerenderResult =
        await createReactServerPrerenderResult(
          runInSequentialTasks(finalRSCPrerenderFn, finalRSCAbortCallback)
        ))
      reactServerPrerenderResultIsDynamic = serverIsDynamic
      reactServerPrerenderStore = finalServerPrerenderStore

      if (shouldGenerateStaticFlightData(workStore)) {
        metadata.flightData = await streamToBuffer(
          cachedNavigations
            ? prependIsPartialByte(
                reactServerResult.asStream(),
                serverIsDynamic
              )
            : reactServerResult.asStream()
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
      }

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
        allowEmptyStaticShell,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        prerenderResumeDataCache,
        renderResumeDataCache,
        hmrRefreshHash: undefined,
        // Client prerenders don't track server param access
        varyParamsAccumulator: null,
      }

      let dynamicValidation = createDynamicValidationState()

      const finalClientOnHeaders = createOnHeadersCallback(appendHeader)

      let { prelude: unprocessedPrelude, postponed } =
        await runInSequentialTasks(
          () => {
            const pendingFinalClientResult = workUnitAsyncStorage.run(
              finalClientPrerenderStore,
              getClientPrerender,
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
            finalClientReactController.abort()
          }
        )

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
      if (serverIsDynamic) {
        if (postponed != null) {
          metadata.postponed = await getDynamicHTMLPostponedState(
            postponed,
            preludeIsEmpty
              ? DynamicHTMLPreludeState.Empty
              : DynamicHTMLPreludeState.Full,
            fallbackRouteParams,
            prerenderResumeDataCache,
            cacheComponents
          )
        } else {
          metadata.postponed = await getDynamicDataPostponedState(
            prerenderResumeDataCache,
            cacheComponents
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
          renderResumeDataCache: createRenderResumeDataCache(
            prerenderResumeDataCache
          ),
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
        renderResumeDataCache: createRenderResumeDataCache(
          prerenderResumeDataCache
        ),
      }
    } else if (experimental.isRoutePPREnabled) {
      // We're statically generating with PPR and need to do dynamic tracking
      let dynamicTracking = createDynamicTrackingState(isDebugDynamicAccesses)

      const prerenderResumeDataCache = createPrerenderResumeDataCache()
      const pprReactServerPrerenderStore: PrerenderStore = (prerenderStore = {
        type: 'prerender-ppr',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        dynamicTracking,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        prerenderResumeDataCache,
      })
      const RSCPayload = await workUnitAsyncStorage.run(
        pprReactServerPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        { is404: res.statusCode === 404 }
      )
      let reactServerResult: ReactServerPrerenderResult
      reactServerResult = reactServerPrerenderResult =
        await createReactServerPrerenderResultFromRender(
          workUnitAsyncStorage.run(
            pprReactServerPrerenderStore,
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

      const ssrPrerenderStore: PrerenderStore = {
        type: 'prerender-ppr',
        phase: 'render',
        rootParams,
        fallbackRouteParams,
        implicitTags,
        dynamicTracking,
        revalidate: INFINITE_CACHE,
        expire: INFINITE_CACHE,
        stale: INFINITE_CACHE,
        tags: [...implicitTags.tags],
        prerenderResumeDataCache,
      }
      const pprOnHeaders = createOnHeadersCallback(appendHeader)
      const { prelude: unprocessedPrelude, postponed } =
        await workUnitAsyncStorage.run(
          ssrPrerenderStore,
          getClientPrerender,
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
            onHeaders: pprOnHeaders,
            maxHeadersLength: reactMaxHeadersLength,
            bootstrapScripts: [bootstrapScript],
          }
        )
      const getServerInsertedHTML = makeGetServerInsertedHTML({
        polyfills,
        renderServerInsertedHTML,
        serverCapturedErrors: allCapturedErrors,
        basePath,
        tracingMetadata: tracingMetadata,
      })

      // After awaiting here we've waited for the entire RSC render to complete. Crucially this means
      // that when we detect whether we've used dynamic APIs below we know we'll have picked up even
      // parts of the React Server render that might not be used in the SSR render.
      const flightData = await streamToBuffer(reactServerResult.asStream())

      if (shouldGenerateStaticFlightData(workStore)) {
        metadata.flightData = flightData
        await collectSegmentData(
          flightData,
          ssrPrerenderStore,
          ComponentMod,
          renderOpts,
          ctx.pagePath,
          metadata
        )
      }

      const { prelude, preludeIsEmpty } =
        await processPreludeOp(unprocessedPrelude)

      /**
       * When prerendering there are three outcomes to consider
       *
       *   Dynamic HTML:      The prerender has dynamic holes (caused by using Next.js Dynamic Rendering APIs)
       *                      We will need to resume this result when requests are handled and we don't include
       *                      any server inserted HTML or inlined flight data in the static HTML
       *
       *   Dynamic Data:      The prerender has no dynamic holes but dynamic APIs were used. We will not
       *                      resume this render when requests are handled but we will generate new inlined
       *                      flight data since it is dynamic and differences may end up reconciling on the client
       *
       *   Static:            The prerender has no dynamic holes and no dynamic APIs were used. We statically encode
       *                      all server inserted HTML and flight data
       */
      // First we check if we have any dynamic holes in our HTML prerender
      if (accessedDynamicData(dynamicTracking.dynamicAccesses)) {
        if (postponed != null) {
          // Dynamic HTML case.
          metadata.postponed = await getDynamicHTMLPostponedState(
            postponed,
            preludeIsEmpty
              ? DynamicHTMLPreludeState.Empty
              : DynamicHTMLPreludeState.Full,
            fallbackRouteParams,
            prerenderResumeDataCache,
            cacheComponents
          )
        } else {
          // Dynamic Data case.
          metadata.postponed = await getDynamicDataPostponedState(
            prerenderResumeDataCache,
            cacheComponents
          )
        }
        // Regardless of whether this is the Dynamic HTML or Dynamic Data case we need to ensure we include
        // server inserted html in the static response because the html that is part of the prerender may depend on it
        // It is possible in the set of stream transforms for Dynamic HTML vs Dynamic Data may differ but currently both states
        // require the same set so we unify the code path here
        reactServerResult.consume()
        const pprDynamicOpts = {
          getServerInsertedHTML,
          getServerInsertedMetadata,
          deploymentId: ctx.sharedContext.deploymentId,
        }
        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueDynamicPrerender(prelude, pprDynamicOpts),
          dynamicAccess: dynamicTracking.dynamicAccesses,
          // TODO: Should this include the SSR pass?
          collectedRevalidate: pprReactServerPrerenderStore.revalidate,
          collectedExpire: pprReactServerPrerenderStore.expire,
          collectedStale: selectStaleTime(pprReactServerPrerenderStore.stale),
          collectedTags: pprReactServerPrerenderStore.tags,
        }
      } else if (fallbackRouteParams && fallbackRouteParams.size > 0) {
        // Rendering the fallback case.
        metadata.postponed = await getDynamicDataPostponedState(
          prerenderResumeDataCache,
          cacheComponents
        )

        const pprFallbackDynamicOpts = {
          getServerInsertedHTML,
          getServerInsertedMetadata,
          deploymentId: ctx.sharedContext.deploymentId,
        }
        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueDynamicPrerender(
            prelude,
            pprFallbackDynamicOpts
          ),
          dynamicAccess: dynamicTracking.dynamicAccesses,
          // TODO: Should this include the SSR pass?
          collectedRevalidate: pprReactServerPrerenderStore.revalidate,
          collectedExpire: pprReactServerPrerenderStore.expire,
          collectedStale: selectStaleTime(pprReactServerPrerenderStore.stale),
          collectedTags: pprReactServerPrerenderStore.tags,
        }
      } else {
        // Static case
        // We still have not used any dynamic APIs. At this point we can produce an entirely static prerender response
        if (workStore.forceDynamic) {
          throw new StaticGenBailoutError(
            'Invariant: a Page with `dynamic = "force-dynamic"` did not trigger the dynamic pathway. This is a bug in Next.js'
          )
        }

        let htmlStream: AnyStream = prelude
        if (postponed != null) {
          // We postponed but nothing dynamic was used. We resume the render now and immediately abort it
          // so we can set all the postponed boundaries to client render mode before we store the HTML response
          const foreverStream = createPendingStream()
          const resumePrelude = await resumeAndAbort(
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

        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueStaticPrerender(htmlStream, {
            inlinedDataStream: createInlinedDataStream(
              reactServerResult.consumeAsStream(),
              nonce,
              formState
            ),
            getServerInsertedHTML,
            getServerInsertedMetadata,
            deploymentId: ctx.sharedContext.deploymentId,
          }),
          dynamicAccess: dynamicTracking.dynamicAccesses,
          // TODO: Should this include the SSR pass?
          collectedRevalidate: pprReactServerPrerenderStore.revalidate,
          collectedExpire: pprReactServerPrerenderStore.expire,
          collectedStale: selectStaleTime(pprReactServerPrerenderStore.stale),
          collectedTags: pprReactServerPrerenderStore.tags,
        }
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
        { is404: res.statusCode === 404 }
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
          bootstrapScripts: [bootstrapScript],
        },
        { waitForAllReady: true }
      )

      if (shouldGenerateStaticFlightData(workStore)) {
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
      }

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
          isStaticGeneration: true,
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
      '/_not-found/page'
    )

    if (cacheComponents) {
      const originalFlightPrerenderResult = reactServerPrerenderResult
      const originalFlightPrerenderResultIsDynamic =
        reactServerPrerenderResultIsDynamic
      const originalPrerenderResumeDataCache =
        reactServerPrerenderResumeDataCache
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
      if (originalPrerenderResumeDataCache === null) {
        throw new InvariantError(
          'Cache Components error recovery expected an original prerender resume data cache'
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
      const errorPrerenderResumeDataCache = createPrerenderResumeDataCache()
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
        cacheSignal: null,
        dynamicTracking: errorServerDynamicTracking,
        allowEmptyStaticShell,
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
        prerenderResumeDataCache: errorPrerenderResumeDataCache,
        renderResumeDataCache: renderOpts.renderResumeDataCache ?? null,
        hmrRefreshHash: undefined,
        varyParamsAccumulator: null,
      }

      const errorRSCPayload = await workUnitAsyncStorage.run(
        errorPrerenderStore,
        getErrorRSCPayload,
        tree,
        ctx,
        reactServerErrorsByDigest.has((err as any).digest) ? undefined : err,
        errorType
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
              errorServerReactController.abort()
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
          allowEmptyStaticShell,
          revalidate: errorPrerenderStore.revalidate,
          expire: errorPrerenderStore.expire,
          stale: errorPrerenderStore.stale,
          tags: [...(errorPrerenderStore.tags || implicitTags.tags)],
          prerenderResumeDataCache: errorPrerenderResumeDataCache,
          renderResumeDataCache: renderOpts.renderResumeDataCache ?? null,
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
            errorClientReactController.abort()
          }
        )

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
            originalPrerenderResumeDataCache,
            cacheComponents
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
              originalPrerenderResumeDataCache
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
            originalPrerenderResumeDataCache
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
      errorType
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
          bootstrapScripts: [errorBootstrapScript],
          formState,
        },
        { waitForAllReady: true }
      )

      if (shouldGenerateStaticFlightData(workStore)) {
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
      }

      return {
        digestErrorsMap: reactServerErrorsByDigest,
        ssrErrors: allCapturedErrors,
        stream: await continueFizzStream(errorHtmlStream, {
          inlinedDataStream: createInlinedDataStream(
            reactServerPrerenderResult.consumeAsStream(),
            nonce,
            formState
          ),
          isStaticGeneration: true,
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
  // build, compute them by measuring segment gzip sizes and write them to
  // metadata so the build pipeline can persist them to the manifest.
  let hints: PrefetchHints | null
  const prefetchInlining = renderOpts.experimental.prefetchInlining
  if (!prefetchInlining) {
    hints = null
  } else if (renderOpts.isBuildTimePrerendering) {
    // Build time: compute fresh hints and store in metadata for the manifest.
    hints = await ComponentMod.collectPrefetchHints(
      fullPageDataBuffer,
      staleTime,
      clientModules,
      serverConsumerManifest,
      prefetchInlining.maxSize,
      prefetchInlining.maxBundleSize
    )
    metadata.prefetchHints = hints
  } else {
    // Runtime: use hints from the manifest. Never compute fresh hints
    // during ISR/revalidation.
    const manifestHints = renderOpts.prefetchHints?.[pagePath]
    if (manifestHints === undefined) {
      if (!renderOpts.cacheComponents) {
        // Without cacheComponents, dynamic pages have no static shell
        // and therefore no prerender pass to compute hints. This is
        // expected — just skip the hint system for this route and let
        // prefetching proceed normally without inlining decisions.
        hints = null
      } else {
        // TODO(#91407): No hints found for this route. This currently
        // happens for routes with `instant = false` at the root segment,
        // which causes the prerender to run per-request and the hints
        // manifest to be unavailable at runtime.
        //
        // Fall back to a hint tree that marks everything as
        // unprefetchable. Once the instant:false bug is fixed, this
        // should become an error — the manifest should always have an
        // entry for every route that reaches collectSegmentData.
        hints = {
          hints: PrefetchHint.PrefetchDisabled,
          slots: null,
        }
      }
    } else {
      hints = manifestHints
    }
  }

  // Pass the resolved hints so collectSegmentData can union them into
  // the TreePrefetch. During the initial build the FlightRouterState in
  // the buffer doesn't have inlining hints yet (they were just computed
  // above), so we need to merge them in here. At runtime/ISR the hints
  // are already embedded in the FlightRouterState, so this is null.
  metadata.segmentData = await ComponentMod.collectSegmentData(
    renderOpts.cacheComponents,
    fullPageDataBuffer,
    staleTime,
    clientModules,
    serverConsumerManifest,
    Boolean(renderOpts.experimental.prefetchInlining),
    hints
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
