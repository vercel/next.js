import type { ComponentType, ErrorInfo, JSX, ReactNode } from 'react'
import type { RenderOpts, PreloadCallbacks } from './types'
import type {
  ActionResult,
  DynamicParamTypesShort,
  FlightRouterState,
  Segment,
  CacheNodeSeedData,
  RSCPayload,
  FlightData,
  InitialRSCPayload,
  FlightDataPath,
} from '../../shared/lib/app-router-types'
import {
  workAsyncStorage,
  type WorkStore,
} from '../app-render/work-async-storage.external'
import type {
  PrerenderStoreModernRuntime,
  RequestStore,
} from '../app-render/work-unit-async-storage.external'
import type { NextParsedUrlQuery } from '../request-meta'
import type { LoaderTree } from '../lib/app-dir-module'
import type { AppPageModule } from '../route-modules/app-page/module'
import type {
  ClientReferenceManifest,
  ManifestNode,
} from '../../build/webpack/plugins/flight-manifest-plugin'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { IncomingHttpHeaders } from 'http'
import * as ReactClient from 'react'

import RenderResult, {
  type AppPageRenderResultMetadata,
  type RenderResultOptions,
} from '../render-result'
import {
  chainStreams,
  renderToInitialFizzStream,
  createDocumentClosingStream,
  continueFizzStream,
  continueDynamicPrerender,
  continueStaticPrerender,
  continueDynamicHTMLResume,
  streamToBuffer,
  streamToString,
  continueStaticFallbackPrerender,
} from '../stream-utils/node-web-streams-helper'
import { stripInternalQueries } from '../internal-utils'
import {
  NEXT_HMR_REFRESH_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_ROUTER_STALE_TIME_HEADER,
  NEXT_URL,
  RSC_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_HMR_REFRESH_HASH_COOKIE,
  NEXT_DID_POSTPONE_HEADER,
  NEXT_REQUEST_ID_HEADER,
  NEXT_HTML_REQUEST_ID_HEADER,
} from '../../client/components/app-router-headers'
import { createMetadataContext } from '../../lib/metadata/metadata-context'
import { createRequestStoreForRender } from '../async-storage/request-store'
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
import { getTracer } from '../lib/trace/tracer'
import { FlightRenderResult } from './flight-render-result'
import {
  createFlightReactServerErrorHandler,
  createHTMLReactServerErrorHandler,
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
import { walkTreeWithFlightRouterState } from './walk-tree-with-flight-router-state'
import { createComponentTree, getRootParams } from './create-component-tree'
import { getAssetQueryString } from './get-asset-query-string'
import {
  getServerModuleMap,
  setReferenceManifestsSingleton,
} from './encryption-utils'
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
import {
  useFlightStream,
  createInlinedDataReadableStream,
} from './use-flight-response'
import {
  StaticGenBailoutError,
  isStaticGenBailoutError,
} from '../../client/components/static-generation-bailout'
import { getStackWithoutErrorMessage } from '../../lib/format-server-error'
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
} from './dynamic-rendering'
import {
  getClientComponentLoaderMetrics,
  wrapClientComponentLoader,
} from '../client-component-renderer-logger'
import { createServerModuleMap } from './action-utils'
import { isNodeNextRequest } from '../base-http/helpers'
import { parseRelativeUrl } from '../../shared/lib/router/utils/parse-relative-url'
import AppRouter from '../../client/components/app-router'
import type { ServerComponentsHmrCache } from '../response-cache'
import type { RequestErrorContext } from '../instrumentation/types'
import { getIsPossibleServerAction } from '../lib/server-action-request-meta'
import { createInitialRouterState } from '../../client/components/router-reducer/create-initial-router-state'
import { createMutableActionQueue } from '../../client/components/app-router-instance'
import { getRevalidateReason } from '../instrumentation/utils'
import { PAGE_SEGMENT_KEY } from '../../shared/lib/segment'
import type { OpaqueFallbackRouteParams } from '../request/fallback-params'
import {
  prerenderAndAbortInSequentialTasksWithStages,
  processPrelude,
} from './app-render-prerender-utils'
import {
  type ReactServerPrerenderResult,
  ReactServerResult,
  createReactServerPrerenderResult,
  createReactServerPrerenderResultFromRender,
  prerenderAndAbortInSequentialTasks,
} from './app-render-prerender-utils'
import { printDebugThrownValueForProspectiveRender } from './prospective-render-utils'
import {
  pipelineInSequentialTasks,
  scheduleInSequentialTasks,
} from './app-render-render-utils'
import { waitAtLeastOneReactRenderTask } from '../../lib/scheduler'
import {
  workUnitAsyncStorage,
  type PrerenderStore,
} from './work-unit-async-storage.external'
import { consoleAsyncStorage } from './console-async-storage.external'
import { CacheSignal } from './cache-signal'
import { getTracedMetadata } from '../lib/trace/utils'
import { InvariantError } from '../../shared/lib/invariant-error'

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
import type { ExperimentalConfig } from '../config-shared'
import type { Params } from '../request/params'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'
import { ImageConfigContext } from '../../shared/lib/image-config-context.shared-runtime'
import { imageConfigDefault } from '../../shared/lib/image-config'
import { RenderStage, StagedRenderingController } from './staged-rendering'
import { anySegmentHasRuntimePrefetchEnabled } from './staged-validation'
import { warnOnce } from '../../shared/lib/utils/warn-once'

export type GetDynamicParamFromSegment = (
  // [slug] / [[slug]] / [...slug]
  segment: string
) => DynamicParam | null

export type DynamicParam = {
  param: string
  value: string | string[] | null
  treeSegment: Segment
  type: DynamicParamTypesShort
}

export type GenerateFlight = typeof generateDynamicFlightRenderResult

export type AppSharedContext = {
  buildId: string
}

export type AppRenderContext = {
  sharedContext: AppSharedContext
  workStore: WorkStore
  url: ReturnType<typeof parseRelativeUrl>
  componentMod: AppPageModule
  renderOpts: RenderOpts
  parsedRequestHeaders: ParsedRequestHeaders
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  query: NextParsedUrlQuery
  isPrefetch: boolean
  isPossibleServerAction: boolean
  requestTimestamp: number
  appUsingSizeAdjustment: boolean
  flightRouterState?: FlightRouterState
  requestId: string
  htmlRequestId: string
  pagePath: string
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
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

  const isRuntimePrefetchRequest = headers[NEXT_ROUTER_PREFETCH_HEADER] === '2'

  const isHmrRefresh = headers[NEXT_HMR_REFRESH_HEADER] !== undefined

  const isRSCRequest = headers[RSC_HEADER] !== undefined

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

  if (process.env.NODE_ENV !== 'production') {
    // The request IDs are only used in development mode to send debug
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
    isRouteTreePrefetchRequest,
    isHmrRefresh,
    isRSCRequest,
    nonce,
    previouslyRevalidatedTags,
    requestId,
    htmlRequestId,
  }
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
      children: [PAGE_SEGMENT_KEY, {}, notFoundTreeComponents],
    },
    // When global-not-found is present, skip layout from components
    hasGlobalNotFound ? components : {},
  ]
}

/**
 * Returns a function that parses the dynamic segment and return the associated value.
 */
function makeGetDynamicParamFromSegment(
  interpolatedParams: Params,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
): GetDynamicParamFromSegment {
  return function getDynamicParamFromSegment(
    // [slug] / [[slug]] / [...slug]
    segment: string
  ) {
    const segmentParam = getSegmentParam(segment)
    if (!segmentParam) {
      return null
    }
    const segmentKey = segmentParam.param
    const dynamicParamType = dynamicParamTypes[segmentParam.type]
    return getDynamicParam(
      interpolatedParams,
      segmentKey,
      dynamicParamType,
      fallbackRouteParams
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
    actionResult: ActionResult
    skipFlight: boolean
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
    getDynamicParamFromSegment,
    query,
    requestId,
    flightRouterState,
    workStore,
    url,
  } = ctx

  const serveStreamingMetadata = !!ctx.renderOpts.serveStreamingMetadata

  if (!options?.skipFlight) {
    const preloadCallbacks: PreloadCallbacks = []

    const { Viewport, Metadata, MetadataOutlet } = createMetadataComponents({
      tree: loaderTree,
      parsedQuery: query,
      pathname: url.pathname,
      metadataContext: createMetadataContext(ctx.renderOpts),
      getDynamicParamFromSegment,
      workStore,
      serveStreamingMetadata,
    })

    flightData = (
      await walkTreeWithFlightRouterState({
        ctx,
        loaderTreeToFilter: loaderTree,
        parentParams: {},
        flightRouterState,
        // For flight, render metadata inside leaf page
        rscHead: createElement(
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
        ),
        injectedCSS: new Set(),
        injectedJS: new Set(),
        injectedFontPreloadTags: new Set(),
        rootLayoutIncluded: false,
        preloadCallbacks,
        MetadataOutlet,
      })
    ).map((path) => path.slice(1)) // remove the '' (root) segment
  }

  // If we have an action result, then this is a server action response.
  // We can rely on this because `ActionResult` will always be a promise, even if
  // the result is falsey.
  if (options?.actionResult) {
    return {
      a: options.actionResult,
      f: flightData,
      b: ctx.sharedContext.buildId,
    }
  }

  // Otherwise, it's a regular RSC response.
  return {
    b: ctx.sharedContext.buildId,
    f: flightData,
    S: workStore.isStaticGeneration,
  }
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
    skipFlight: boolean
    componentTree?: CacheNodeSeedData
    preloadCallbacks?: PreloadCallbacks
    temporaryReferences?: WeakMap<any, string>
  }
): Promise<RenderResult> {
  const {
    clientReferenceManifest,
    componentMod: { renderToReadableStream },
    htmlRequestId,
    renderOpts,
    requestId,
    workStore,
  } = ctx

  const {
    dev = false,
    onInstrumentationRequestError,
    setReactDebugChannel,
  } = renderOpts

  function onFlightDataRenderError(err: DigestedError) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'react-server-components-payload')
    )
  }
  const onError = createFlightReactServerErrorHandler(
    dev,
    onFlightDataRenderError
  )

  const debugChannel = setReactDebugChannel && createDebugChannel()

  if (debugChannel) {
    setReactDebugChannel(debugChannel.clientSide, htmlRequestId, requestId)
  }

  // For app dir, use the bundled version of Flight server renderer (renderToReadableStream)
  // which contains the subset React.
  const rscPayload = await workUnitAsyncStorage.run(
    requestStore,
    generateDynamicRSCPayload,
    ctx,
    options
  )

  const flightReadableStream = workUnitAsyncStorage.run(
    requestStore,
    renderToReadableStream,
    rscPayload,
    clientReferenceManifest.clientModules,
    {
      onError,
      temporaryReferences: options?.temporaryReferences,
      filterStackFrame,
      debugChannel: debugChannel?.serverSide,
    }
  )

  return new FlightRenderResult(flightReadableStream, {
    fetchMetrics: workStore.fetchMetrics,
  })
}

type RenderToReadableStreamServerOptions = NonNullable<
  Parameters<
    (typeof import('react-server-dom-webpack/server.node'))['renderToReadableStream']
  >[2]
>

async function stagedRenderToReadableStreamWithoutCachesInDev(
  ctx: AppRenderContext,
  requestStore: RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>,
  options: Omit<RenderToReadableStreamServerOptions, 'environmentName'>
) {
  const {
    componentMod: { renderToReadableStream },
  } = ctx
  // We're rendering while bypassing caches,
  // so we have no hope of showing a useful runtime stage.
  // But we still want things like `params` to show up in devtools correctly,
  // which relies on mechanisms we've set up for staged rendering,
  // so we do a 2-task version (Static -> Dynamic) instead.

  const stageController = new StagedRenderingController()
  const environmentName = () => {
    const currentStage = stageController.currentStage
    switch (currentStage) {
      case RenderStage.Static:
        return 'Prerender'
      case RenderStage.Runtime:
      case RenderStage.Dynamic:
        return 'Server'
      default:
        currentStage satisfies never
        throw new InvariantError(`Invalid render stage: ${currentStage}`)
    }
  }

  requestStore.stagedRendering = stageController
  requestStore.asyncApiPromises = createAsyncApiPromisesInDev(
    stageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  const rscPayload = await getPayload(requestStore)

  return await workUnitAsyncStorage.run(
    requestStore,
    scheduleInSequentialTasks,
    () => {
      return renderToReadableStream(
        rscPayload,
        clientReferenceManifest.clientModules,
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
  createRequestStore: (() => RequestStore) | undefined
): Promise<RenderResult> {
  const {
    htmlRequestId,
    renderOpts,
    requestId,
    workStore,
    componentMod: { createElement },
  } = ctx

  const {
    dev = false,
    onInstrumentationRequestError,
    setReactDebugChannel,
    setCacheStatus,
    clientReferenceManifest,
  } = renderOpts

  function onFlightDataRenderError(err: DigestedError) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'react-server-components-payload')
    )
  }
  const onError = createFlightReactServerErrorHandler(
    dev,
    onFlightDataRenderError
  )

  const getPayload = async (requestStore: RequestStore) => {
    const payload: RSCPayload & RSCPayloadDevProperties =
      await workUnitAsyncStorage.run(
        requestStore,
        generateDynamicRSCPayload,
        ctx,
        undefined
      )

    if (isBypassingCachesInDev(renderOpts, requestStore)) {
      // Mark the RSC payload to indicate that caches were bypassed in dev.
      // This lets the client know not to cache anything based on this render.
      payload._bypassCachesInDev = createElement(WarnForBypassCachesInDev, {
        route: workStore.route,
      })
    }

    return payload
  }

  let debugChannel: DebugChannelPair | undefined
  let stream: ReadableStream<Uint8Array>

  if (
    // We only do this flow if we can safely recreate the store from scratch
    // (which is not the case for renders after an action)
    createRequestStore &&
    // We only do this flow if we're not bypassing caches in dev using
    // "disable cache" in devtools or a hard refresh (cache-control: "no-store")
    !isBypassingCachesInDev(renderOpts, initialRequestStore)
  ) {
    // Before we kick off the render, we set the cache status back to it's initial state
    // in case a previous render bypassed the cache.
    if (setCacheStatus) {
      setCacheStatus('ready', htmlRequestId, requestId)
    }

    const result = await renderWithRestartOnCacheMissInDev(
      ctx,
      initialRequestStore,
      createRequestStore,
      getPayload,
      onError
    )
    debugChannel = result.debugChannel
    stream = result.stream
  } else {
    // We're either bypassing caches or we can't restart the render.
    // Do a dynamic render, but with (basic) environment labels.

    assertClientReferenceManifest(clientReferenceManifest)

    // Set cache status to bypass when specifically bypassing caches in dev
    if (setCacheStatus) {
      setCacheStatus('bypass', htmlRequestId, requestId)
    }

    debugChannel = setReactDebugChannel && createDebugChannel()

    stream = await stagedRenderToReadableStreamWithoutCachesInDev(
      ctx,
      initialRequestStore,
      getPayload,
      clientReferenceManifest,
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
  res: BaseNextResponse,
  ctx: AppRenderContext,
  requestStore: RequestStore
): Promise<RenderResult> {
  const { workStore } = ctx
  const renderOpts = ctx.renderOpts

  function onFlightDataRenderError(err: DigestedError) {
    return renderOpts.onInstrumentationRequestError?.(
      err,
      req,
      // TODO(runtime-ppr): should we use a different value?
      createErrorContext(ctx, 'react-server-components-payload')
    )
  }
  const onError = createFlightReactServerErrorHandler(
    false,
    onFlightDataRenderError
  )

  const metadata: AppPageRenderResultMetadata = {}

  const generatePayload = () => generateDynamicRSCPayload(ctx, undefined)

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
    generatePayload,
    prerenderResumeDataCache,
    renderResumeDataCache,
    rootParams,
    requestStore.headers,
    requestStore.cookies,
    requestStore.draftMode
  )

  const response = await finalRuntimeServerPrerender(
    ctx,
    generatePayload,
    prerenderResumeDataCache,
    renderResumeDataCache,
    rootParams,
    requestStore.headers,
    requestStore.cookies,
    requestStore.draftMode,
    onError
  )

  applyMetadataFromPrerenderResult(response, metadata, workStore)
  metadata.fetchMetrics = ctx.workStore.fetchMetrics

  if (response.isPartial) {
    res.setHeader(NEXT_DID_POSTPONE_HEADER, '1')
  }

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
  draftMode: PrerenderStoreModernRuntime['draftMode']
) {
  const { implicitTags, renderOpts, workStore } = ctx

  const { clientReferenceManifest, ComponentMod } = renderOpts

  assertClientReferenceManifest(clientReferenceManifest)

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
    captureOwnerStack: undefined,
    // We only need task sequencing in the final prerender.
    runtimeStagePromise: null,
    // These are not present in regular prerenders, but allowed in a runtime prerender.
    headers,
    cookies,
    draftMode,
  }

  // We're not going to use the result of this render because the only time it could be used
  // is if it completes in a microtask and that's likely very rare for any non-trivial app
  const initialServerPayload = await workUnitAsyncStorage.run(
    initialServerPrerenderStore,
    getPayload
  )

  const pendingInitialServerResult = workUnitAsyncStorage.run(
    initialServerPrerenderStore,
    ComponentMod.prerender,
    initialServerPayload,
    clientReferenceManifest.clientModules,
    {
      filterStackFrame,
      onError: (err) => {
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
          printDebugThrownValueForProspectiveRender(err, workStore.route)
        }
      },
      // we don't care to track postpones during the prospective render because we need
      // to always do a final render anyway
      onPostpone: undefined,
      // We don't want to stop rendering until the cacheSignal is complete so we pass
      // a different signal to this render call than is used by dynamic APIs to signify
      // transitioning out of the prerender environment
      signal: initialServerRenderController.signal,
    }
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
      printDebugThrownValueForProspectiveRender(err, workStore.route)
    }
    return null
  }
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
  onError: (err: unknown) => string | undefined
) {
  const { implicitTags, renderOpts } = ctx

  const {
    clientReferenceManifest,
    ComponentMod,
    experimental,
    isDebugDynamicAccesses,
  } = renderOpts

  assertClientReferenceManifest(clientReferenceManifest)

  const selectStaleTime = createSelectStaleTime(experimental)

  let serverIsDynamic = false
  const finalServerController = new AbortController()

  const serverDynamicTracking = createDynamicTrackingState(
    isDebugDynamicAccesses
  )

  const { promise: runtimeStagePromise, resolve: resolveBlockedRuntimeAPIs } =
    createPromiseWithResolvers<void>()

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
    captureOwnerStack: undefined,
    // Used to separate the "Static" stage from the "Runtime" stage.
    runtimeStagePromise,
    // These are not present in regular prerenders, but allowed in a runtime prerender.
    headers,
    cookies,
    draftMode,
  }

  const finalRSCPayload = await workUnitAsyncStorage.run(
    finalServerPrerenderStore,
    getPayload
  )

  let prerenderIsPending = true
  const result = await prerenderAndAbortInSequentialTasksWithStages(
    async () => {
      // Static stage
      const prerenderResult = await workUnitAsyncStorage.run(
        finalServerPrerenderStore,
        ComponentMod.prerender,
        finalRSCPayload,
        clientReferenceManifest.clientModules,
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
      // Advance to the runtime stage.
      //
      // We make runtime APIs hang during the first task (above), and unblock them in the following task (here).
      // This makes sure that, at this point, we'll have finished all the static parts (what we'd prerender statically).
      // We know that they don't contain any incorrect sync IO, because that'd have caused a build error.
      // After we unblock Runtime APIs, if we encounter sync IO (e.g. `await cookies(); Date.now()`),
      // we'll abort, but we'll produce at least as much output as a static prerender would.
      resolveBlockedRuntimeAPIs()
    },
    () => {
      // Abort.
      if (finalServerController.signal.aborted) {
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
      finalServerController.abort()
    }
  )

  return {
    result,
    // TODO(runtime-ppr): do we need to produce a digest map here?
    // digestErrorsMap: ...,
    dynamicAccess: serverDynamicTracking,
    isPartial: serverIsDynamic,
    collectedRevalidate: finalServerPrerenderStore.revalidate,
    collectedExpire: finalServerPrerenderStore.expire,
    collectedStale: selectStaleTime(finalServerPrerenderStore.stale),
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
  is404: boolean
): Promise<InitialRSCPayload & { P: ReactNode }> {
  const injectedCSS = new Set<string>()
  const injectedJS = new Set<string>()
  const injectedFontPreloadTags = new Set<string>()
  let missingSlots: Set<string> | undefined

  // We only track missing parallel slots in development
  if (process.env.NODE_ENV === 'development') {
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

  const initialTree = createFlightRouterStateFromLoaderTree(
    tree,
    getDynamicParamFromSegment,
    query
  )
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
    getDynamicParamFromSegment,
    workStore,
    serveStreamingMetadata,
  })

  const preloadCallbacks: PreloadCallbacks = []

  const seedData = await createComponentTree({
    ctx,
    loaderTree: tree,
    parentParams: {},
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
  const varyHeader = ctx.res.getHeader('vary')
  const couldBeIntercepted =
    typeof varyHeader === 'string' && varyHeader.includes(NEXT_URL)

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

  return {
    // See the comment above the `Preloads` component (below) for why this is part of the payload
    P: createElement(Preloads, {
      preloadCallbacks: preloadCallbacks,
    }),
    b: ctx.sharedContext.buildId,
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
    s: typeof ctx.renderOpts.postponed === 'string',
    S: workStore.isStaticGeneration,
  }
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
  const { Viewport, Metadata } = createMetadataComponents({
    tree,
    parsedQuery: query,
    pathname: url.pathname,
    metadataContext: createMetadataContext(ctx.renderOpts),
    errorType,
    getDynamicParamFromSegment,
    workStore,
    serveStreamingMetadata: serveStreamingMetadata,
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
    process.env.NODE_ENV === 'development' &&
      createElement('meta', {
        name: 'next-error',
        content: 'not-found',
      }),
    createElement(Metadata, null)
  )

  const initialTree = createFlightRouterStateFromLoaderTree(
    tree,
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
        process.env.NODE_ENV !== 'production' && err
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
    false, // We don't currently support runtime prefetching for error pages.
  ]

  const { GlobalError, styles: globalErrorStyles } = await getGlobalErrorStyles(
    tree,
    ctx
  )

  const isPossiblyPartialHead =
    workStore.isStaticGeneration &&
    ctx.renderOpts.experimental.isRoutePPREnabled === true

  return {
    b: ctx.sharedContext.buildId,
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
    s: typeof ctx.renderOpts.postponed === 'string',
    S: workStore.isStaticGeneration,
  } satisfies InitialRSCPayload
}

function assertClientReferenceManifest(
  clientReferenceManifest: RenderOpts['clientReferenceManifest']
): asserts clientReferenceManifest is NonNullable<
  RenderOpts['clientReferenceManifest']
> {
  if (!clientReferenceManifest) {
    throw new InvariantError('Expected clientReferenceManifest to be defined.')
  }
}

// This component must run in an SSR context. It will render the RSC root component
function App<T>({
  reactServerStream,
  reactDebugStream,
  preinitScripts,
  clientReferenceManifest,
  ServerInsertedHTMLProvider,
  nonce,
  images,
}: {
  /* eslint-disable @next/internal/no-ambiguous-jsx -- React Client */
  reactServerStream: BinaryStreamOf<T>
  reactDebugStream: ReadableStream<Uint8Array> | undefined
  preinitScripts: () => void
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  ServerInsertedHTMLProvider: ComponentType<{
    children: JSX.Element
  }>
  images: RenderOpts['images']
  nonce?: string
}): JSX.Element {
  preinitScripts()
  const response = ReactClient.use(
    useFlightStream<InitialRSCPayload>(
      reactServerStream,
      reactDebugStream,
      clientReferenceManifest,
      nonce
    )
  )

  const initialState = createInitialRouterState({
    // This is not used during hydration, so we don't have to pass a
    // real timestamp.
    navigatedAt: -1,
    initialFlightData: response.f,
    initialCanonicalUrlParts: response.c,
    initialRenderedSearch: response.q,
    initialParallelRoutes: new Map(),
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
  reactDebugStream,
  preinitScripts,
  clientReferenceManifest,
  ServerInsertedHTMLProvider,
  nonce,
  images,
}: {
  reactServerStream: BinaryStreamOf<T>
  reactDebugStream: ReadableStream<Uint8Array> | undefined
  preinitScripts: () => void
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  ServerInsertedHTMLProvider: ComponentType<{
    children: JSX.Element
  }>
  nonce?: string
  images: RenderOpts['images']
}): JSX.Element {
  /* eslint-disable @next/internal/no-ambiguous-jsx -- React Client */
  preinitScripts()
  const response = ReactClient.use(
    useFlightStream<InitialRSCPayload>(
      reactServerStream,
      reactDebugStream,
      clientReferenceManifest,
      nonce
    )
  )

  const initialState = createInitialRouterState({
    // This is not used during hydration, so we don't have to pass a
    // real timestamp.
    navigatedAt: -1,
    initialFlightData: response.f,
    initialCanonicalUrlParts: response.c,
    initialRenderedSearch: response.q,
    initialParallelRoutes: new Map(),
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
export type BinaryStreamOf<T> = ReadableStream<Uint8Array>

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
    clientReferenceManifest,
    serverActionsManifest,
    ComponentMod,
    nextFontManifest,
    serverActions,
    assetPrefix = '',
    enableTainting,
    cacheComponents,
  } = renderOpts

  // We need to expose the bundled `require` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app__) {
    const instrumented = wrapClientComponentLoader(ComponentMod)

    // When we are prerendering if there is a cacheSignal for tracking
    // cache reads we track calls to `loadChunk` and `require`. This allows us
    // to treat chunk/module loading with similar semantics as cache reads to avoid
    // module loading from causing a prerender to abort too early.

    const shouldTrackModuleLoading = () => {
      if (!cacheComponents) {
        return false
      }
      if (renderOpts.dev) {
        return true
      }
      const workUnitStore = workUnitAsyncStorage.getStore()

      if (!workUnitStore) {
        return false
      }

      switch (workUnitStore.type) {
        case 'prerender':
        case 'prerender-client':
        case 'prerender-runtime':
        case 'cache':
        case 'private-cache':
          return true
        case 'prerender-ppr':
        case 'prerender-legacy':
        case 'request':
        case 'unstable-cache':
          return false
        default:
          workUnitStore satisfies never
      }
    }

    const __next_require__: typeof instrumented.require = (...args) => {
      const exportsOrPromise = instrumented.require(...args)
      if (shouldTrackModuleLoading()) {
        // requiring an async module returns a promise.
        trackPendingImport(exportsOrPromise)
      }
      return exportsOrPromise
    }
    // @ts-expect-error
    globalThis.__next_require__ = __next_require__

    const __next_chunk_load__: typeof instrumented.loadChunk = (...args) => {
      const loadingChunk = instrumented.loadChunk(...args)
      if (shouldTrackModuleLoading()) {
        trackPendingChunkLoad(loadingChunk)
      }
      return loadingChunk
    }
    // @ts-expect-error
    globalThis.__next_chunk_load__ = __next_chunk_load__
  }

  if (
    process.env.NODE_ENV === 'development' &&
    renderOpts.setIsrStatus &&
    !cacheComponents
  ) {
    // Reset the ISR status at start of request.
    const { pathname } = new URL(req.url || '/', 'http://n')
    renderOpts.setIsrStatus(
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

  assertClientReferenceManifest(clientReferenceManifest)

  const serverModuleMap = createServerModuleMap({ serverActionsManifest })

  setReferenceManifestsSingleton({
    page: workStore.page,
    clientReferenceManifest,
    serverActionsManifest,
    serverModuleMap,
  })

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
    fallbackRouteParams
  )

  const isPossibleActionRequest = getIsPossibleServerAction(req)

  const implicitTags = await getImplicitTags(
    workStore.page,
    url,
    fallbackRouteParams
  )

  const ctx: AppRenderContext = {
    componentMod: ComponentMod,
    url,
    renderOpts,
    workStore,
    parsedRequestHeaders,
    getDynamicParamFromSegment,
    query,
    isPrefetch: isPrefetchRequest,
    isPossibleServerAction: isPossibleActionRequest,
    requestTimestamp,
    appUsingSizeAdjustment,
    flightRouterState,
    requestId,
    htmlRequestId,
    pagePath,
    clientReferenceManifest,
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
    if (
      workStore.pendingRevalidates ||
      workStore.pendingRevalidateWrites ||
      workStore.pendingRevalidatedTags
    ) {
      const pendingPromise = executeRevalidates(workStore).finally(() => {
        if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
          console.log('pending revalidates promise finished for:', url)
        }
      })

      if (renderOpts.waitUntil) {
        renderOpts.waitUntil(pendingPromise)
      } else {
        options.waitUntil = pendingPromise
      }
    }

    applyMetadataFromPrerenderResult(response, metadata, workStore)

    if (response.renderResumeDataCache) {
      metadata.renderResumeDataCache = response.renderResumeDataCache
    }

    return new RenderResult(await streamToString(response.stream), options)
  } else {
    // We're rendering dynamically
    const renderResumeDataCache =
      renderOpts.renderResumeDataCache ??
      postponedState?.renderResumeDataCache ??
      null

    const rootParams = getRootParams(loaderTree, ctx.getDynamicParamFromSegment)
    const devValidatingFallbackParams =
      getRequestMeta(req, 'devValidatingFallbackParams') || null

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
      devValidatingFallbackParams
    )
    const requestStore = createRequestStore()

    if (
      process.env.NODE_ENV === 'development' &&
      renderOpts.setIsrStatus &&
      !cacheComponents &&
      // Only pages using the Node runtime can use ISR, so we only need to
      // update the status for those.
      // The type check here ensures that `req` is correctly typed, and the
      // environment variable check provides dead code elimination.
      process.env.NEXT_RUNTIME !== 'edge' &&
      isNodeNextRequest(req)
    ) {
      const setIsrStatus = renderOpts.setIsrStatus
      req.originalRequest.on('end', () => {
        const { pathname } = new URL(req.url || '/', 'http://n')
        const isStatic = !requestStore.usedDynamic && !workStore.forceDynamic
        setIsrStatus(pathname, isStatic)
      })
    }

    if (isRSCRequest) {
      if (isRuntimePrefetchRequest) {
        return generateRuntimePrefetchResult(req, res, ctx, requestStore)
      } else {
        if (
          process.env.NODE_ENV === 'development' &&
          process.env.NEXT_RUNTIME !== 'edge' &&
          cacheComponents
        ) {
          return generateDynamicFlightRenderResultWithStagesInDev(
            req,
            ctx,
            requestStore,
            createRequestStore
          )
        } else {
          return generateDynamicFlightRenderResult(req, ctx, requestStore)
        }
      }
    }

    const renderToStreamWithTracing = getTracer().wrap(
      AppRenderSpan.getBodyResult,
      {
        spanName: `render route (app) ${pagePath}`,
        attributes: {
          'next.route': pagePath,
        },
      },
      renderToStream
    )

    let didExecuteServerAction = false
    let formState: null | any = null
    if (isPossibleActionRequest) {
      // For action requests, we don't want to use the resume data cache.
      requestStore.renderResumeDataCache = null

      // For action requests, we handle them differently with a special render result.
      const actionRequestResult = await handleAction({
        req,
        res,
        ComponentMod,
        serverModuleMap,
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
          const stream = await renderToStreamWithTracing(
            requestStore,
            req,
            res,
            ctx,
            notFoundLoaderTree,
            formState,
            postponedState,
            metadata,
            undefined, // Prevent restartable-render behavior in dev + Cache Components mode
            devValidatingFallbackParams
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
      // Restore the resume data cache
      requestStore.renderResumeDataCache = renderResumeDataCache
    }

    const options: RenderResultOptions = {
      metadata,
      contentType: HTML_CONTENT_TYPE_HEADER,
    }

    const stream = await renderToStreamWithTracing(
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
      devValidatingFallbackParams
    )

    // Invalid dynamic usages should only error the request in development.
    // In production, it's better to produce a result.
    // (the dynamic error will still be thrown inside the component tree, but it's catchable by error boundaries)
    if (workStore.invalidDynamicUsageError && workStore.dev) {
      throw workStore.invalidDynamicUsageError
    }

    // If we have pending revalidates, wait until they are all resolved.
    if (
      workStore.pendingRevalidates ||
      workStore.pendingRevalidateWrites ||
      workStore.pendingRevalidatedTags
    ) {
      const pendingPromise = executeRevalidates(workStore).finally(() => {
        if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
          console.log('pending revalidates promise finished for:', url)
        }
      })

      if (renderOpts.waitUntil) {
        renderOpts.waitUntil(pendingPromise)
      } else {
        options.waitUntil = pendingPromise
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
      interpolatedParams
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
  devValidatingFallbackParams: OpaqueFallbackRouteParams | null
): Promise<ReadableStream<Uint8Array>> {
  /* eslint-disable @next/internal/no-ambiguous-jsx -- React Client */
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
    clientReferenceManifest,
    ComponentMod: {
      createElement,
      renderToReadableStream: serverRenderToReadableStream,
    },
    crossOrigin,
    dev = false,
    experimental,
    nextExport = false,
    onInstrumentationRequestError,
    page,
    reactMaxHeadersLength,
    setReactDebugChannel,
    shouldWaitOnAllReady,
    subresourceIntegrityManifest,
    supportsDynamicResponse,
    cacheComponents,
  } = renderOpts

  assertClientReferenceManifest(clientReferenceManifest)

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
  const bootstrapScriptContent =
    process.env.NODE_ENV !== 'production'
      ? `self.__next_r=${JSON.stringify(requestId)}`
      : undefined

  const reactServerErrorsByDigest: Map<string, DigestedError> = new Map()
  const silenceLogger = false
  function onHTMLRenderRSCError(err: DigestedError) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'react-server-components')
    )
  }
  const serverComponentsErrorHandler = createHTMLReactServerErrorHandler(
    dev,
    nextExport,
    reactServerErrorsByDigest,
    silenceLogger,
    onHTMLRenderRSCError
  )

  function onHTMLRenderSSRError(err: DigestedError) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'server-rendering')
    )
  }

  const allCapturedErrors: Array<unknown> = []
  const htmlRendererErrorHandler = createHTMLErrorHandler(
    dev,
    nextExport,
    reactServerErrorsByDigest,
    allCapturedErrors,
    silenceLogger,
    onHTMLRenderSSRError
  )

  let reactServerResult: null | ReactServerResult = null
  let reactDebugStream: ReadableStream<Uint8Array> | undefined

  const setHeader = res.setHeader.bind(res)
  const appendHeader = res.appendHeader.bind(res)

  try {
    if (
      // We only want this behavior when we have React's dev builds available
      process.env.NODE_ENV === 'development' &&
      // We only want this behavior when running `next dev`
      dev &&
      // Edge routes never prerender so we don't have a Prerender environment for anything in edge runtime
      process.env.NEXT_RUNTIME !== 'edge' &&
      // We only have a Prerender environment for projects opted into cacheComponents
      cacheComponents
    ) {
      const [resolveValidation, validationOutlet] = createValidationOutlet()
      let debugChannel: DebugChannelPair | undefined
      const getPayload = async (
        // eslint-disable-next-line @typescript-eslint/no-shadow
        requestStore: RequestStore
      ) => {
        const payload: InitialRSCPayload & RSCPayloadDevProperties =
          await workUnitAsyncStorage.run(
            requestStore,
            getRSCPayload,
            tree,
            ctx,
            res.statusCode === 404
          )
        // Placing the validation outlet in the payload is safe
        // even if we end up discarding a render and restarting,
        // because we're not going to wait for the stream to complete,
        // so leaving the validation unresolved is fine.
        payload._validation = validationOutlet

        if (isBypassingCachesInDev(renderOpts, requestStore)) {
          // Mark the RSC payload to indicate that caches were bypassed in dev.
          // This lets the client know not to cache anything based on this render.
          payload._bypassCachesInDev = createElement(WarnForBypassCachesInDev, {
            route: workStore.route,
          })
        }

        return payload
      }

      if (
        // We only do this flow if we can safely recreate the store from scratch
        // (which is not the case for renders after an action)
        createRequestStore &&
        // We only do this flow if we're not bypassing caches in dev using
        // "disable cache" in devtools or a hard refresh (cache-control: "no-store")
        !isBypassingCachesInDev(renderOpts, requestStore)
      ) {
        const {
          stream: serverStream,
          debugChannel: returnedDebugChannel,
          requestStore: finalRequestStore,
        } = await renderWithRestartOnCacheMissInDev(
          ctx,
          requestStore,
          createRequestStore,
          getPayload,
          serverComponentsErrorHandler
        )

        reactServerResult = new ReactServerResult(serverStream)
        requestStore = finalRequestStore
        debugChannel = returnedDebugChannel
      } else {
        // We're either bypassing caches or we can't restart the render.
        // Do a dynamic render, but with (basic) environment labels.

        debugChannel = setReactDebugChannel && createDebugChannel()

        const serverStream =
          await stagedRenderToReadableStreamWithoutCachesInDev(
            ctx,
            requestStore,
            getPayload,
            clientReferenceManifest,
            {
              onError: serverComponentsErrorHandler,
              filterStackFrame,
              debugChannel: debugChannel?.serverSide,
            }
          )
        reactServerResult = new ReactServerResult(serverStream)
      }

      if (debugChannel && setReactDebugChannel) {
        const [readableSsr, readableBrowser] =
          debugChannel.clientSide.readable.tee()

        reactDebugStream = readableSsr

        setReactDebugChannel(
          { readable: readableBrowser },
          htmlRequestId,
          requestId
        )
      }

      // TODO(restart-on-cache-miss):
      // This can probably be optimized to do less work,
      // because we've already made sure that we have warm caches.
      consoleAsyncStorage.run(
        { dim: true },
        spawnDynamicValidationInDev,
        resolveValidation,
        tree,
        ctx,
        res.statusCode === 404,
        clientReferenceManifest,
        requestStore,
        devValidatingFallbackParams
      )
    } else {
      // This is a dynamic render. We don't do dynamic tracking because we're not prerendering
      const RSCPayload: RSCPayload & RSCPayloadDevProperties =
        await workUnitAsyncStorage.run(
          requestStore,
          getRSCPayload,
          tree,
          ctx,
          res.statusCode === 404
        )

      const debugChannel = setReactDebugChannel && createDebugChannel()

      if (debugChannel) {
        const [readableSsr, readableBrowser] =
          debugChannel.clientSide.readable.tee()

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
          serverRenderToReadableStream,
          RSCPayload,
          clientReferenceManifest.clientModules,
          {
            filterStackFrame,
            onError: serverComponentsErrorHandler,
            debugChannel: debugChannel?.serverSide,
          }
        )
      )
    }

    // React doesn't start rendering synchronously but we want the RSC render to have a chance to start
    // before we begin SSR rendering because we want to capture any available preload headers so we tick
    // one task before continuing
    await waitAtLeastOneReactRenderTask()

    // If provided, the postpone state should be parsed as JSON so it can be
    // provided to React.
    if (typeof renderOpts.postponed === 'string') {
      if (postponedState?.type === DynamicState.DATA) {
        // We have a complete HTML Document in the prerender but we need to
        // still include the new server component render because it was not included
        // in the static prelude.
        const inlinedReactServerDataStream = createInlinedDataReadableStream(
          reactServerResult.tee(),
          nonce,
          formState
        )

        return chainStreams(
          inlinedReactServerDataStream,
          createDocumentClosingStream()
        )
      } else if (postponedState) {
        // We assume we have dynamic HTML requiring a resume render to complete
        const { postponed, preludeState } =
          getPostponedFromState(postponedState)
        const resume = (
          require('react-dom/server') as typeof import('react-dom/server')
        ).resume

        const htmlStream = await workUnitAsyncStorage.run(
          requestStore,
          resume,
          <App
            reactServerStream={reactServerResult.tee()}
            reactDebugStream={reactDebugStream}
            preinitScripts={preinitScripts}
            clientReferenceManifest={clientReferenceManifest}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />,
          postponed,
          { onError: htmlRendererErrorHandler, nonce }
        )

        const getServerInsertedHTML = makeGetServerInsertedHTML({
          polyfills,
          renderServerInsertedHTML,
          serverCapturedErrors: allCapturedErrors,
          basePath,
          tracingMetadata: tracingMetadata,
        })
        return await continueDynamicHTMLResume(htmlStream, {
          // If the prelude is empty (i.e. is no static shell), we should wait for initial HTML to be rendered
          // to avoid injecting RSC data too early.
          // If we have a non-empty-prelude (i.e. a static HTML shell), then it's already been sent separately,
          // so we shouldn't wait for any HTML to be emitted from the resume before sending RSC data.
          delayDataUntilFirstHtmlChunk:
            preludeState === DynamicHTMLPreludeState.Empty,
          inlinedDataStream: createInlinedDataReadableStream(
            reactServerResult.consume(),
            nonce,
            formState
          ),
          getServerInsertedHTML,
          getServerInsertedMetadata,
        })
      }
    }

    // This is a regular dynamic render
    const renderToReadableStream = (
      require('react-dom/server') as typeof import('react-dom/server')
    ).renderToReadableStream

    const htmlStream = await workUnitAsyncStorage.run(
      requestStore,
      renderToReadableStream,
      <App
        reactServerStream={reactServerResult.tee()}
        reactDebugStream={reactDebugStream}
        preinitScripts={preinitScripts}
        clientReferenceManifest={clientReferenceManifest}
        ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
        nonce={nonce}
        images={ctx.renderOpts.images}
      />,
      {
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
    )

    const getServerInsertedHTML = makeGetServerInsertedHTML({
      polyfills,
      renderServerInsertedHTML,
      serverCapturedErrors: allCapturedErrors,
      basePath,
      tracingMetadata: tracingMetadata,
    })
    /**
     * Rules of Static & Dynamic HTML:
     *
     *    1.) We must generate static HTML unless the caller explicitly opts
     *        in to dynamic HTML support.
     *
     *    2.) If dynamic HTML support is requested, we must honor that request
     *        or throw an error. It is the sole responsibility of the caller to
     *        ensure they aren't e.g. requesting dynamic HTML for a static page.
     *
     *   3.) If `shouldWaitOnAllReady` is true, which indicates we need to
     *       resolve all suspenses and generate a full HTML. e.g. when it's a
     *       html limited bot requests, we produce the full HTML content.
     *
     * These rules help ensure that other existing features like request caching,
     * coalescing, and ISR continue working as intended.
     */
    const generateStaticHTML =
      supportsDynamicResponse !== true || !!shouldWaitOnAllReady

    return await continueFizzStream(htmlStream, {
      inlinedDataStream: createInlinedDataReadableStream(
        reactServerResult.consume(),
        nonce,
        formState
      ),
      isStaticGeneration: generateStaticHTML,
      isBuildTimePrerendering: ctx.workStore.isBuildTimePrerendering === true,
      buildId: ctx.workStore.buildId,
      getServerInsertedHTML,
      getServerInsertedMetadata,
      validateRootLayout: dev,
    })
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

    let errorType: MetadataErrorType | 'redirect' | undefined

    if (isHTTPAccessFallbackError(err)) {
      res.statusCode = getAccessFallbackHTTPStatus(err)
      metadata.statusCode = res.statusCode
      errorType = getAccessFallbackErrorTypeByStatus(res.statusCode)
    } else if (isRedirectError(err)) {
      errorType = 'redirect'
      res.statusCode = getRedirectStatusCodeFromError(err)
      metadata.statusCode = res.statusCode

      const redirectUrl = addPathPrefix(getURLFromRedirectError(err), basePath)

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

    const errorRSCPayload = await workUnitAsyncStorage.run(
      requestStore,
      getErrorRSCPayload,
      tree,
      ctx,
      reactServerErrorsByDigest.has((err as any).digest) ? null : err,
      errorType
    )

    const errorServerStream = workUnitAsyncStorage.run(
      requestStore,
      serverRenderToReadableStream,
      errorRSCPayload,
      clientReferenceManifest.clientModules,
      {
        filterStackFrame,
        onError: serverComponentsErrorHandler,
      }
    )

    if (reactServerResult === null) {
      // We errored when we did not have an RSC stream to read from. This is not just a render
      // error, we need to throw early
      throw err
    }

    try {
      const fizzStream = await workUnitAsyncStorage.run(
        requestStore,
        renderToInitialFizzStream,
        {
          ReactDOMServer:
            require('react-dom/server') as typeof import('react-dom/server'),
          element: (
            <ErrorApp
              reactServerStream={errorServerStream}
              reactDebugStream={undefined}
              ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
              preinitScripts={errorPreinitScripts}
              clientReferenceManifest={clientReferenceManifest}
              nonce={nonce}
              images={ctx.renderOpts.images}
            />
          ),
          streamOptions: {
            nonce,
            bootstrapScriptContent,
            // Include hydration scripts in the HTML
            bootstrapScripts: [errorBootstrapScript],
            formState,
          },
        }
      )

      /**
       * Rules of Static & Dynamic HTML:
       *
       *    1.) We must generate static HTML unless the caller explicitly opts
       *        in to dynamic HTML support.
       *
       *    2.) If dynamic HTML support is requested, we must honor that request
       *        or throw an error. It is the sole responsibility of the caller to
       *        ensure they aren't e.g. requesting dynamic HTML for a static page.
       *    3.) If `shouldWaitOnAllReady` is true, which indicates we need to
       *        resolve all suspenses and generate a full HTML. e.g. when it's a
       *        html limited bot requests, we produce the full HTML content.
       *
       * These rules help ensure that other existing features like request caching,
       * coalescing, and ISR continue working as intended.
       */
      const generateStaticHTML =
        supportsDynamicResponse !== true || !!shouldWaitOnAllReady
      return await continueFizzStream(fizzStream, {
        inlinedDataStream: createInlinedDataReadableStream(
          // This is intentionally using the readable datastream from the
          // main render rather than the flight data from the error page
          // render
          reactServerResult.consume(),
          nonce,
          formState
        ),
        isStaticGeneration: generateStaticHTML,
        isBuildTimePrerendering: ctx.workStore.isBuildTimePrerendering === true,
        buildId: ctx.workStore.buildId,
        getServerInsertedHTML: makeGetServerInsertedHTML({
          polyfills,
          renderServerInsertedHTML,
          serverCapturedErrors: [],
          basePath,
          tracingMetadata: tracingMetadata,
        }),
        getServerInsertedMetadata,
        validateRootLayout: dev,
      })
    } catch (finalErr: any) {
      if (
        process.env.NODE_ENV === 'development' &&
        isHTTPAccessFallbackError(finalErr)
      ) {
        const { bailOnRootNotFound } =
          require('../../client/components/dev-root-http-access-fallback-boundary') as typeof import('../../client/components/dev-root-http-access-fallback-boundary')
        bailOnRootNotFound()
      }
      throw finalErr
    }
  }
  /* eslint-enable @next/internal/no-ambiguous-jsx */
}

async function renderWithRestartOnCacheMissInDev(
  ctx: AppRenderContext,
  initialRequestStore: RequestStore,
  createRequestStore: () => RequestStore,
  getPayload: (requestStore: RequestStore) => Promise<RSCPayload>,
  onError: (error: unknown) => void
) {
  const {
    htmlRequestId,
    renderOpts,
    requestId,
    componentMod: {
      routeModule: {
        userland: { loaderTree },
      },
    },
  } = ctx
  const {
    clientReferenceManifest,
    ComponentMod,
    setCacheStatus,
    setReactDebugChannel,
  } = renderOpts
  assertClientReferenceManifest(clientReferenceManifest)

  const hasRuntimePrefetch =
    await anySegmentHasRuntimePrefetchEnabled(loaderTree)

  // If the render is restarted, we'll recreate a fresh request store
  let requestStore: RequestStore = initialRequestStore

  const environmentName = () => {
    const currentStage = requestStore.stagedRendering!.currentStage
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
  const initialStageController = new StagedRenderingController(
    initialDataController.signal
  )

  requestStore.prerenderResumeDataCache = prerenderResumeDataCache
  // `getRenderResumeDataCache` will fall back to using `prerenderResumeDataCache` as `renderResumeDataCache`,
  // so not having a resume data cache won't break any expectations in case we don't need to restart.
  requestStore.renderResumeDataCache = null
  requestStore.stagedRendering = initialStageController
  requestStore.asyncApiPromises = createAsyncApiPromisesInDev(
    initialStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )
  requestStore.cacheSignal = cacheSignal

  let debugChannel = setReactDebugChannel && createDebugChannel()

  const initialRscPayload = await getPayload(requestStore)
  const maybeInitialServerStream = await workUnitAsyncStorage.run(
    requestStore,
    () =>
      pipelineInSequentialTasks(
        () => {
          // Static stage
          const stream = ComponentMod.renderToReadableStream(
            initialRscPayload,
            clientReferenceManifest.clientModules,
            {
              onError,
              environmentName,
              filterStackFrame,
              debugChannel: debugChannel?.serverSide,
              signal: initialReactController.signal,
            }
          )
          // If we abort the render, we want to reject the stage-dependent promises as well.
          // Note that we want to install this listener after the render is started
          // so that it runs after react is finished running its abort code.
          initialReactController.signal.addEventListener('abort', () => {
            initialDataController.abort(initialReactController.signal.reason)
          })
          return stream
        },
        (stream) => {
          // Runtime stage
          initialStageController.advanceStage(RenderStage.Runtime)

          // If we had a cache miss in the static stage, we'll have to disard this stream
          // and render again once the caches are warm.
          if (cacheSignal.hasPendingReads()) {
            return null
          }

          // If there's no cache misses, we'll continue rendering,
          // and see if there's any cache misses in the runtime stage.
          return stream
        },
        async (maybeStream) => {
          // Dynamic stage

          // If we had cache misses in either of the previous stages,
          // then we'll only use this render for filling caches.
          // We won't advance the stage, and thus leave dynamic APIs hanging,
          // because they won't be cached anyway, so it'd be wasted work.
          if (maybeStream === null || cacheSignal.hasPendingReads()) {
            return null
          }

          // If there's no cache misses, we'll use this render, so let it advance to the dynamic stage.
          initialStageController.advanceStage(RenderStage.Dynamic)
          return maybeStream
        }
      )
  )

  if (maybeInitialServerStream !== null) {
    // No cache misses. We can use the stream as is.
    return {
      stream: maybeInitialServerStream,
      debugChannel,
      requestStore,
    }
  }

  if (process.env.NODE_ENV === 'development' && setCacheStatus) {
    setCacheStatus('filling', htmlRequestId, requestId)
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

  const finalStageController = new StagedRenderingController()

  // We've filled the caches, so now we can render as usual,
  // without any cache-filling mechanics.
  requestStore.prerenderResumeDataCache = null
  requestStore.renderResumeDataCache = createRenderResumeDataCache(
    prerenderResumeDataCache
  )
  requestStore.stagedRendering = finalStageController
  requestStore.cacheSignal = null
  requestStore.asyncApiPromises = createAsyncApiPromisesInDev(
    finalStageController,
    requestStore.cookies,
    requestStore.mutableCookies,
    requestStore.headers
  )

  // The initial render already wrote to its debug channel.
  // We're not using it, so we need to create a new one.
  debugChannel = setReactDebugChannel && createDebugChannel()

  const finalRscPayload = await getPayload(requestStore)
  const finalServerStream = await workUnitAsyncStorage.run(requestStore, () =>
    pipelineInSequentialTasks(
      () => {
        // Static stage
        return ComponentMod.renderToReadableStream(
          finalRscPayload,
          clientReferenceManifest.clientModules,
          {
            onError,
            environmentName,
            filterStackFrame,
            debugChannel: debugChannel?.serverSide,
          }
        )
      },
      (stream) => {
        // Runtime stage
        finalStageController.advanceStage(RenderStage.Runtime)
        return stream
      },
      (stream) => {
        // Dynamic stage
        finalStageController.advanceStage(RenderStage.Dynamic)
        return stream
      }
    )
  )

  if (process.env.NODE_ENV === 'development' && setCacheStatus) {
    setCacheStatus('filled', htmlRequestId, requestId)
  }

  return {
    stream: finalServerStream,
    debugChannel,
    requestStore,
  }
}

function createAsyncApiPromisesInDev(
  stagedRendering: StagedRenderingController,
  cookies: RequestStore['cookies'],
  mutableCookies: RequestStore['mutableCookies'],
  headers: RequestStore['headers']
): NonNullable<RequestStore['asyncApiPromises']> {
  return {
    // Runtime APIs
    cookies: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'cookies',
      cookies
    ),
    mutableCookies: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'cookies',
      mutableCookies as RequestStore['cookies']
    ),
    headers: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'headers',
      headers
    ),
    // These are not used directly, but we chain other `params`/`searchParams` promises off of them.
    sharedParamsParent: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'params',
      '<internal params>'
    ),
    sharedSearchParamsParent: stagedRendering.delayUntilStage(
      RenderStage.Runtime,
      'searchParams',
      '<internal searchParams>'
    ),
    connection: stagedRendering.delayUntilStage(
      RenderStage.Dynamic,
      'connection',
      undefined
    ),
  }
}

type DebugChannelPair = {
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
}

type DebugChannelServer = {
  readable?: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}
type DebugChannelClient = {
  readable: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
}

function createDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }

  let readableController: ReadableStreamDefaultController | undefined

  const clientSideReadable = new ReadableStream<Uint8Array>({
    start(controller) {
      readableController = controller
    },
  })

  return {
    serverSide: {
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          readableController?.enqueue(chunk)
        },
        close() {
          readableController?.close()
        },
        abort(err) {
          readableController?.error(err)
        },
      }),
    },
    clientSide: {
      readable: clientSideReadable,
    },
  }
}

function createValidationOutlet() {
  let resolveValidation: (value: ReactNode) => void
  let outlet = new Promise<ReactNode>((resolve) => {
    resolveValidation = resolve
  })
  return [resolveValidation!, outlet] as const
}

/**
 * This function is a fork of prerenderToStream cacheComponents branch.
 * While it doesn't return a stream we want it to have identical
 * prerender semantics to prerenderToStream and should update it
 * in conjunction with any changes to that function.
 */
async function spawnDynamicValidationInDev(
  resolveValidation: (validatingElement: ReactNode) => void,
  tree: LoaderTree,
  ctx: AppRenderContext,
  isNotFound: boolean,
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>,
  requestStore: RequestStore,
  fallbackRouteParams: OpaqueFallbackRouteParams | null
): Promise<void> {
  const {
    componentMod: ComponentMod,
    getDynamicParamFromSegment,
    implicitTags,
    nonce,
    renderOpts,
    workStore,
  } = ctx

  const { allowEmptyStaticShell = false } = renderOpts

  // These values are placeholder values for this validating render
  // that are provided during the actual prerenderToStream.
  const preinitScripts = () => {}
  const { ServerInsertedHTMLProvider } = createServerInsertedHTML()

  const rootParams = getRootParams(
    ComponentMod.routeModule.userland.loaderTree,
    getDynamicParamFromSegment
  )

  const hmrRefreshHash = requestStore.cookies.get(
    NEXT_HMR_REFRESH_HASH_COOKIE
  )?.value

  // The prerender controller represents the lifetime of the prerender. It will
  // be aborted when a task is complete or a synchronously aborting API is
  // called. Notably, during prospective prerenders, this does not actually
  // terminate the prerender itself, which will continue until all caches are
  // filled.
  const initialServerPrerenderController = new AbortController()

  // This controller is used to abort the React prerender.
  const initialServerReactController = new AbortController()

  // This controller represents the lifetime of the React prerender. Its signal
  // can be used for any I/O operation to abort the I/O and/or to reject, when
  // prerendering aborts. This includes our own hanging promises for accessing
  // request data, and for fetch calls. It might be replaced in the future by
  // React.cacheSignal(). It's aborted after the React controller, so that no
  // pending I/O can register abort listeners that are called before React's
  // abort listener is called. This ensures that pending I/O is not rejected too
  // early when aborting the prerender. Notably, during the prospective
  // prerender, it is different from the prerender controller because we don't
  // want to end the React prerender until all caches are filled.
  const initialServerRenderController = new AbortController()

  // The cacheSignal helps us track whether caches are still filling or we are
  // ready to cut the render off.
  const cacheSignal = new CacheSignal()

  const captureOwnerStackClient = ReactClient.captureOwnerStack
  const { captureOwnerStack: captureOwnerStackServer, createElement } =
    ComponentMod

  // The resume data cache here should use a fresh instance as it's
  // performing a fresh prerender. If we get to implementing the
  // prerendering of an already prerendered page, we should use the passed
  // resume data cache instead.
  const prerenderResumeDataCache = createPrerenderResumeDataCache()
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
    renderResumeDataCache: null,
    hmrRefreshHash,
    captureOwnerStack: captureOwnerStackServer,
  }

  // We're not going to use the result of this render because the only time it could be used
  // is if it completes in a microtask and that's likely very rare for any non-trivial app
  const initialServerPayload = await workUnitAsyncStorage.run(
    initialServerPayloadPrerenderStore,
    getRSCPayload,
    tree,
    ctx,
    isNotFound
  )

  const initialServerPrerenderStore: PrerenderStore = {
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
    renderResumeDataCache: null,
    hmrRefreshHash,
    captureOwnerStack: captureOwnerStackServer,
  }

  const pendingInitialServerResult = workUnitAsyncStorage.run(
    initialServerPrerenderStore,
    ComponentMod.prerender,
    initialServerPayload,
    clientReferenceManifest.clientModules,
    {
      filterStackFrame,
      onError: (err) => {
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
          printDebugThrownValueForProspectiveRender(err, workStore.route)
        }
      },
      // we don't care to track postpones during the prospective render because we need
      // to always do a final render anyway
      onPostpone: undefined,
      // We don't want to stop rendering until the cacheSignal is complete so we pass
      // a different signal to this render call than is used by dynamic APIs to signify
      // transitioning out of the prerender environment
      signal: initialServerReactController.signal,
    }
  )

  // The listener to abort our own render controller must be added after React
  // has added its listener, to ensure that pending I/O is not aborted/rejected
  // too early.
  initialServerReactController.signal.addEventListener(
    'abort',
    () => {
      initialServerRenderController.abort()
    },
    { once: true }
  )

  // Wait for all caches to be finished filling and for async imports to resolve
  trackPendingModules(cacheSignal)
  await cacheSignal.cacheReady()

  initialServerReactController.abort()

  // We don't need to continue the prerender process if we already
  // detected invalid dynamic usage in the initial prerender phase.
  const { invalidDynamicUsageError } = workStore
  if (invalidDynamicUsageError) {
    resolveValidation(
      createElement(LogSafely, {
        fn: () => {
          console.error(invalidDynamicUsageError)
        },
      })
    )
    return
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
      printDebugThrownValueForProspectiveRender(err, workStore.route)
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
      renderResumeDataCache: null,
      hmrRefreshHash: undefined,
      captureOwnerStack: captureOwnerStackClient,
    }

    const prerender = (
      require('react-dom/static') as typeof import('react-dom/static')
    ).prerender
    const pendingInitialClientResult = workUnitAsyncStorage.run(
      initialClientPrerenderStore,
      prerender,
      // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- React Client
      <App
        reactServerStream={initialServerResult.asUnclosingStream()}
        reactDebugStream={undefined}
        preinitScripts={preinitScripts}
        clientReferenceManifest={clientReferenceManifest}
        ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
        nonce={nonce}
        images={ctx.renderOpts.images}
      />,
      {
        signal: initialClientReactController.signal,
        onError: (err) => {
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
            printDebugThrownValueForProspectiveRender(err, workStore.route)
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

    pendingInitialClientResult.catch((err) => {
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
        printDebugThrownValueForProspectiveRender(err, workStore.route)
      }
    })

    // This is mostly needed for dynamic `import()`s in client components.
    // Promises passed to client were already awaited above (assuming that they came from cached functions)
    trackPendingModules(cacheSignal)
    await cacheSignal.cacheReady()
    initialClientReactController.abort()
  }

  const finalServerReactController = new AbortController()
  const finalServerRenderController = new AbortController()

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
    renderResumeDataCache: null,
    hmrRefreshHash,
    captureOwnerStack: captureOwnerStackServer,
  }

  const finalAttemptRSCPayload = await workUnitAsyncStorage.run(
    finalServerPayloadPrerenderStore,
    getRSCPayload,
    tree,
    ctx,
    isNotFound
  )

  const serverDynamicTracking = createDynamicTrackingState(
    false // isDebugDynamicAccesses
  )

  const finalServerPrerenderStore: PrerenderStore = {
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
    renderResumeDataCache: null,
    hmrRefreshHash,
    captureOwnerStack: captureOwnerStackServer,
  }

  const reactServerResult = await createReactServerPrerenderResult(
    prerenderAndAbortInSequentialTasks(
      async () => {
        const pendingPrerenderResult = workUnitAsyncStorage.run(
          // The store to scope
          finalServerPrerenderStore,
          // The function to run
          ComponentMod.prerender,
          // ... the arguments for the function to run
          finalAttemptRSCPayload,
          clientReferenceManifest.clientModules,
          {
            filterStackFrame,
            onError: (err: unknown) => {
              if (
                finalServerReactController.signal.aborted &&
                isPrerenderInterruptedError(err)
              ) {
                return err.digest
              }

              if (isReactLargeShellError(err)) {
                // TODO: Aggregate
                console.error(err)
                return undefined
              }

              return getDigestForWellKnownError(err)
            },
            signal: finalServerReactController.signal,
          }
        )

        // The listener to abort our own render controller must be added after
        // React has added its listener, to ensure that pending I/O is not
        // aborted/rejected too early.
        finalServerReactController.signal.addEventListener(
          'abort',
          () => {
            finalServerRenderController.abort()
          },
          { once: true }
        )

        return pendingPrerenderResult
      },
      () => {
        finalServerReactController.abort()
      }
    )
  )

  const clientDynamicTracking = createDynamicTrackingState(
    false //isDebugDynamicAccesses
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
    renderResumeDataCache: null,
    hmrRefreshHash,
    captureOwnerStack: captureOwnerStackClient,
  }

  let dynamicValidation = createDynamicValidationState()

  try {
    const prerender = (
      require('react-dom/static') as typeof import('react-dom/static')
    ).prerender
    let { prelude: unprocessedPrelude } =
      await prerenderAndAbortInSequentialTasks(
        () => {
          const pendingFinalClientResult = workUnitAsyncStorage.run(
            finalClientPrerenderStore,
            prerender,
            // eslint-disable-next-line @next/internal/no-ambiguous-jsx -- React Client
            <App
              reactServerStream={reactServerResult.asUnclosingStream()}
              reactDebugStream={undefined}
              preinitScripts={preinitScripts}
              clientReferenceManifest={clientReferenceManifest}
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
                  const componentStack = errorInfo.componentStack
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

    const { preludeIsEmpty } = await processPrelude(unprocessedPrelude)
    resolveValidation(
      createElement(LogSafely, {
        fn: throwIfDisallowedDynamic.bind(
          null,
          workStore,
          preludeIsEmpty ? PreludeState.Empty : PreludeState.Full,
          dynamicValidation,
          serverDynamicTracking
        ),
      })
    )
  } catch (thrownValue) {
    // Even if the root errors we still want to report any cache components errors
    // that were discovered before the root errored.

    let loggingFunction = throwIfDisallowedDynamic.bind(
      null,
      workStore,
      PreludeState.Errored,
      dynamicValidation,
      serverDynamicTracking
    )

    if (process.env.NEXT_DEBUG_BUILD || process.env.__NEXT_VERBOSE_LOGGING) {
      // We don't normally log these errors because we are going to retry anyway but
      // it can be useful for debugging Next.js itself to get visibility here when needed
      const originalLoggingFunction = loggingFunction
      loggingFunction = () => {
        console.error(
          'During dynamic validation the root of the page errored. The next logged error is the thrown value. It may be a duplicate of errors reported during the normal development mode render.'
        )
        console.error(thrownValue)
        originalLoggingFunction()
      }
    }

    resolveValidation(
      createElement(LogSafely, {
        fn: loggingFunction,
      })
    )
  }
}

async function LogSafely({ fn }: { fn: () => unknown }) {
  try {
    await fn()
  } catch {}
  return null
}

type PrerenderToStreamResult = {
  stream: ReadableStream<Uint8Array>
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
function shouldGenerateStaticFlightData(workStore: WorkStore): boolean {
  const { isStaticGeneration } = workStore
  if (!isStaticGeneration) return false

  return true
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
    allowEmptyStaticShell = false,
    basePath,
    buildManifest,
    clientReferenceManifest,
    ComponentMod,
    crossOrigin,
    dev = false,
    experimental,
    isDebugDynamicAccesses,
    nextExport = false,
    onInstrumentationRequestError,
    page,
    reactMaxHeadersLength,
    subresourceIntegrityManifest,
    cacheComponents,
  } = renderOpts

  assertClientReferenceManifest(clientReferenceManifest)

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

  const reactServerErrorsByDigest: Map<string, DigestedError> = new Map()
  // We don't report errors during prerendering through our instrumentation hooks
  const silenceLogger = !!experimental.isRoutePPREnabled
  function onHTMLRenderRSCError(err: DigestedError) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'react-server-components')
    )
  }
  const serverComponentsErrorHandler = createHTMLReactServerErrorHandler(
    dev,
    nextExport,
    reactServerErrorsByDigest,
    silenceLogger,
    onHTMLRenderRSCError
  )

  function onHTMLRenderSSRError(err: DigestedError) {
    return onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'server-rendering')
    )
  }
  const allCapturedErrors: Array<unknown> = []
  const htmlRendererErrorHandler = createHTMLErrorHandler(
    dev,
    nextExport,
    reactServerErrorsByDigest,
    allCapturedErrors,
    silenceLogger,
    onHTMLRenderSSRError
  )

  let reactServerPrerenderResult: null | ReactServerPrerenderResult = null
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

      let resumeDataCache: RenderResumeDataCache | PrerenderResumeDataCache
      let renderResumeDataCache: RenderResumeDataCache | null = null
      let prerenderResumeDataCache: PrerenderResumeDataCache | null = null

      if (renderOpts.renderResumeDataCache) {
        // If a prefilled immutable render resume data cache is provided, e.g.
        // when prerendering an optional fallback shell after having prerendered
        // pages with defined params, we use this instead of a prerender resume
        // data cache.
        resumeDataCache = renderResumeDataCache =
          renderOpts.renderResumeDataCache
      } else {
        // Otherwise we create a new mutable prerender resume data cache.
        resumeDataCache = prerenderResumeDataCache =
          createPrerenderResumeDataCache()
      }

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
        captureOwnerStack: undefined, // Not available in production.
      }

      // We're not going to use the result of this render because the only time it could be used
      // is if it completes in a microtask and that's likely very rare for any non-trivial app
      const initialServerPayload = await workUnitAsyncStorage.run(
        initialServerPayloadPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        res.statusCode === 404
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
        captureOwnerStack: undefined, // Not available in production.
      })

      const pendingInitialServerResult = workUnitAsyncStorage.run(
        initialServerPrerenderStore,
        ComponentMod.prerender,
        initialServerPayload,
        clientReferenceManifest.clientModules,
        {
          filterStackFrame,
          onError: (err) => {
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
              printDebugThrownValueForProspectiveRender(err, workStore.route)
            }
          },
          // we don't care to track postpones during the prospective render because we need
          // to always do a final render anyway
          onPostpone: undefined,
          // We don't want to stop rendering until the cacheSignal is complete so we pass
          // a different signal to this render call than is used by dynamic APIs to signify
          // transitioning out of the prerender environment
          signal: initialServerReactController.signal,
        }
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
          printDebugThrownValueForProspectiveRender(err, workStore.route)
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
          captureOwnerStack: undefined, // Not available in production.
        }

        const prerender = (
          require('react-dom/static') as typeof import('react-dom/static')
        ).prerender
        const pendingInitialClientResult = workUnitAsyncStorage.run(
          initialClientPrerenderStore,
          prerender,
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx
          <App
            reactServerStream={initialServerResult.asUnclosingStream()}
            reactDebugStream={undefined}
            preinitScripts={preinitScripts}
            clientReferenceManifest={clientReferenceManifest}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />,
          {
            signal: initialClientReactController.signal,
            onError: (err) => {
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
                printDebugThrownValueForProspectiveRender(err, workStore.route)
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

        pendingInitialClientResult.catch((err) => {
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
            printDebugThrownValueForProspectiveRender(err, workStore.route)
          }
        })

        // This is mostly needed for dynamic `import()`s in client components.
        // Promises passed to client were already awaited above (assuming that they came from cached functions)
        trackPendingModules(cacheSignal)
        await cacheSignal.cacheReady()
        initialClientReactController.abort()
      }

      const finalServerReactController = new AbortController()
      const finalServerRenderController = new AbortController()

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
        captureOwnerStack: undefined, // Not available in production.
      }

      const finalAttemptRSCPayload = await workUnitAsyncStorage.run(
        finalServerPayloadPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        res.statusCode === 404
      )

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
        captureOwnerStack: undefined, // Not available in production.
      })

      let prerenderIsPending = true
      const reactServerResult = (reactServerPrerenderResult =
        await createReactServerPrerenderResult(
          prerenderAndAbortInSequentialTasks(
            async () => {
              const pendingPrerenderResult = workUnitAsyncStorage.run(
                // The store to scope
                finalServerPrerenderStore,
                // The function to run
                ComponentMod.prerender,
                // ... the arguments for the function to run
                finalAttemptRSCPayload,
                clientReferenceManifest.clientModules,
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

              const prerenderResult = await pendingPrerenderResult
              prerenderIsPending = false

              return prerenderResult
            },
            () => {
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
          )
        ))

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
        captureOwnerStack: undefined, // Not available in production.
      }

      let dynamicValidation = createDynamicValidationState()

      const prerender = (
        require('react-dom/static') as typeof import('react-dom/static')
      ).prerender
      let { prelude: unprocessedPrelude, postponed } =
        await prerenderAndAbortInSequentialTasks(
          () => {
            const pendingFinalClientResult = workUnitAsyncStorage.run(
              finalClientPrerenderStore,
              prerender,
              // eslint-disable-next-line @next/internal/no-ambiguous-jsx
              <App
                reactServerStream={reactServerResult.asUnclosingStream()}
                reactDebugStream={undefined}
                preinitScripts={preinitScripts}
                clientReferenceManifest={clientReferenceManifest}
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
                onHeaders: (headers: Headers) => {
                  headers.forEach((value, key) => {
                    appendHeader(key, value)
                  })
                },
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
        await processPrelude(unprocessedPrelude)

      // If we've disabled throwing on empty static shell, then we don't need to
      // track any dynamic access that occurs above the suspense boundary because
      // we'll do so in the route shell.
      if (!allowEmptyStaticShell) {
        throwIfDisallowedDynamic(
          workStore,
          preludeIsEmpty ? PreludeState.Empty : PreludeState.Full,
          dynamicValidation,
          serverDynamicTracking
        )
      }

      const getServerInsertedHTML = makeGetServerInsertedHTML({
        polyfills,
        renderServerInsertedHTML,
        serverCapturedErrors: allCapturedErrors,
        basePath,
        tracingMetadata: tracingMetadata,
      })

      const flightData = await streamToBuffer(reactServerResult.asStream())
      metadata.flightData = flightData
      metadata.segmentData = await collectSegmentData(
        flightData,
        finalServerPrerenderStore,
        ComponentMod,
        renderOpts
      )

      if (serverIsDynamic) {
        // Dynamic case
        // We will always need to perform a "resume" render of some kind when this route is accessed
        // because the RSC data itself is dynamic. We determine if there are any HTML holes or not
        // but generally this is a "partial" prerender in that there will be a per-request compute
        // concatenated to the static shell.
        if (postponed != null) {
          // Dynamic HTML case
          metadata.postponed = await getDynamicHTMLPostponedState(
            postponed,
            preludeIsEmpty
              ? DynamicHTMLPreludeState.Empty
              : DynamicHTMLPreludeState.Full,
            fallbackRouteParams,
            resumeDataCache,
            cacheComponents
          )
        } else {
          // Dynamic Data case
          metadata.postponed = await getDynamicDataPostponedState(
            resumeDataCache,
            cacheComponents
          )
        }
        reactServerResult.consume()
        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueDynamicPrerender(prelude, {
            getServerInsertedHTML,
            getServerInsertedMetadata,
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
      } else {
        // Static case
        // We will not perform resumption per request. The result can be served statically to the requestor
        // and if there was anything dynamic it will only be rendered in the browser.
        if (workStore.forceDynamic) {
          throw new StaticGenBailoutError(
            'Invariant: a Page with `dynamic = "force-dynamic"` did not trigger the dynamic pathway. This is a bug in Next.js'
          )
        }

        let htmlStream = prelude
        if (postponed != null) {
          // We postponed but nothing dynamic was used. We resume the render now and immediately abort it
          // so we can set all the postponed boundaries to client render mode before we store the HTML response
          const resume = (
            require('react-dom/server') as typeof import('react-dom/server')
          ).resume

          // We don't actually want to render anything so we just pass a stream
          // that never resolves. The resume call is going to abort immediately anyway
          const foreverStream = new ReadableStream<Uint8Array>()

          const resumeStream = await resume(
            // eslint-disable-next-line @next/internal/no-ambiguous-jsx
            <App
              reactServerStream={foreverStream}
              reactDebugStream={undefined}
              preinitScripts={() => {}}
              clientReferenceManifest={clientReferenceManifest}
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
          htmlStream = chainStreams(prelude, resumeStream)
        }

        let finalStream
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
              ComponentMod.renderToReadableStream(
                [],
                clientReferenceManifest.clientModules,
                {
                  filterStackFrame,
                  onError: serverComponentsErrorHandler,
                }
              )
            )
          finalStream = await continueStaticFallbackPrerender(htmlStream, {
            inlinedDataStream: createInlinedDataReadableStream(
              emptyReactServerResult.consumeAsStream(),
              nonce,
              formState
            ),
            getServerInsertedHTML,
            getServerInsertedMetadata,
            isBuildTimePrerendering:
              ctx.workStore.isBuildTimePrerendering === true,
            buildId: ctx.workStore.buildId,
          })
        } else {
          // Normal static prerender case, no fallback param handling needed
          finalStream = await continueStaticPrerender(htmlStream, {
            inlinedDataStream: createInlinedDataReadableStream(
              reactServerResult.consumeAsStream(),
              nonce,
              formState
            ),
            getServerInsertedHTML,
            getServerInsertedMetadata,
            isBuildTimePrerendering:
              ctx.workStore.isBuildTimePrerendering === true,
            buildId: ctx.workStore.buildId,
          })
        }

        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: finalStream,
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
      }
    } else if (experimental.isRoutePPREnabled) {
      // We're statically generating with PPR and need to do dynamic tracking
      let dynamicTracking = createDynamicTrackingState(isDebugDynamicAccesses)

      const prerenderResumeDataCache = createPrerenderResumeDataCache()
      const reactServerPrerenderStore: PrerenderStore = (prerenderStore = {
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
        reactServerPrerenderStore,
        getRSCPayload,
        tree,
        ctx,
        res.statusCode === 404
      )
      const reactServerResult = (reactServerPrerenderResult =
        await createReactServerPrerenderResultFromRender(
          workUnitAsyncStorage.run(
            reactServerPrerenderStore,
            ComponentMod.renderToReadableStream,
            // ... the arguments for the function to run
            RSCPayload,
            clientReferenceManifest.clientModules,
            {
              filterStackFrame,
              onError: serverComponentsErrorHandler,
            }
          )
        ))

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
      const prerender = (
        require('react-dom/static') as typeof import('react-dom/static')
      ).prerender
      const { prelude: unprocessedPrelude, postponed } =
        await workUnitAsyncStorage.run(
          ssrPrerenderStore,
          prerender,
          // eslint-disable-next-line @next/internal/no-ambiguous-jsx
          <App
            reactServerStream={reactServerResult.asUnclosingStream()}
            reactDebugStream={undefined}
            preinitScripts={preinitScripts}
            clientReferenceManifest={clientReferenceManifest}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={nonce}
            images={ctx.renderOpts.images}
          />,
          {
            onError: htmlRendererErrorHandler,
            onHeaders: (headers: Headers) => {
              headers.forEach((value, key) => {
                appendHeader(key, value)
              })
            },
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
        metadata.segmentData = await collectSegmentData(
          flightData,
          ssrPrerenderStore,
          ComponentMod,
          renderOpts
        )
      }

      const { prelude, preludeIsEmpty } =
        await processPrelude(unprocessedPrelude)

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
        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueDynamicPrerender(prelude, {
            getServerInsertedHTML,
            getServerInsertedMetadata,
          }),
          dynamicAccess: dynamicTracking.dynamicAccesses,
          // TODO: Should this include the SSR pass?
          collectedRevalidate: reactServerPrerenderStore.revalidate,
          collectedExpire: reactServerPrerenderStore.expire,
          collectedStale: selectStaleTime(reactServerPrerenderStore.stale),
          collectedTags: reactServerPrerenderStore.tags,
        }
      } else if (fallbackRouteParams && fallbackRouteParams.size > 0) {
        // Rendering the fallback case.
        metadata.postponed = await getDynamicDataPostponedState(
          prerenderResumeDataCache,
          cacheComponents
        )

        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueDynamicPrerender(prelude, {
            getServerInsertedHTML,
            getServerInsertedMetadata,
          }),
          dynamicAccess: dynamicTracking.dynamicAccesses,
          // TODO: Should this include the SSR pass?
          collectedRevalidate: reactServerPrerenderStore.revalidate,
          collectedExpire: reactServerPrerenderStore.expire,
          collectedStale: selectStaleTime(reactServerPrerenderStore.stale),
          collectedTags: reactServerPrerenderStore.tags,
        }
      } else {
        // Static case
        // We still have not used any dynamic APIs. At this point we can produce an entirely static prerender response
        if (workStore.forceDynamic) {
          throw new StaticGenBailoutError(
            'Invariant: a Page with `dynamic = "force-dynamic"` did not trigger the dynamic pathway. This is a bug in Next.js'
          )
        }

        let htmlStream = prelude
        if (postponed != null) {
          // We postponed but nothing dynamic was used. We resume the render now and immediately abort it
          // so we can set all the postponed boundaries to client render mode before we store the HTML response
          const resume = (
            require('react-dom/server') as typeof import('react-dom/server')
          ).resume

          // We don't actually want to render anything so we just pass a stream
          // that never resolves. The resume call is going to abort immediately anyway
          const foreverStream = new ReadableStream<Uint8Array>()

          const resumeStream = await resume(
            // eslint-disable-next-line @next/internal/no-ambiguous-jsx
            <App
              reactServerStream={foreverStream}
              reactDebugStream={undefined}
              preinitScripts={() => {}}
              clientReferenceManifest={clientReferenceManifest}
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
          htmlStream = chainStreams(prelude, resumeStream)
        }

        return {
          digestErrorsMap: reactServerErrorsByDigest,
          ssrErrors: allCapturedErrors,
          stream: await continueStaticPrerender(htmlStream, {
            inlinedDataStream: createInlinedDataReadableStream(
              reactServerResult.consumeAsStream(),
              nonce,
              formState
            ),
            getServerInsertedHTML,
            getServerInsertedMetadata,
            isBuildTimePrerendering:
              ctx.workStore.isBuildTimePrerendering === true,
            buildId: ctx.workStore.buildId,
          }),
          dynamicAccess: dynamicTracking.dynamicAccesses,
          // TODO: Should this include the SSR pass?
          collectedRevalidate: reactServerPrerenderStore.revalidate,
          collectedExpire: reactServerPrerenderStore.expire,
          collectedStale: selectStaleTime(reactServerPrerenderStore.stale),
          collectedTags: reactServerPrerenderStore.tags,
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
        res.statusCode === 404
      )

      const reactServerResult = (reactServerPrerenderResult =
        await createReactServerPrerenderResultFromRender(
          workUnitAsyncStorage.run(
            prerenderLegacyStore,
            ComponentMod.renderToReadableStream,
            RSCPayload,
            clientReferenceManifest.clientModules,
            {
              filterStackFrame,
              onError: serverComponentsErrorHandler,
            }
          )
        ))

      const renderToReadableStream = (
        require('react-dom/server') as typeof import('react-dom/server')
      ).renderToReadableStream
      const htmlStream = await workUnitAsyncStorage.run(
        prerenderLegacyStore,
        renderToReadableStream,
        // eslint-disable-next-line @next/internal/no-ambiguous-jsx
        <App
          reactServerStream={reactServerResult.asUnclosingStream()}
          reactDebugStream={undefined}
          preinitScripts={preinitScripts}
          clientReferenceManifest={clientReferenceManifest}
          ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
          nonce={nonce}
          images={ctx.renderOpts.images}
        />,
        {
          onError: htmlRendererErrorHandler,
          nonce,
          bootstrapScripts: [bootstrapScript],
        }
      )

      if (shouldGenerateStaticFlightData(workStore)) {
        const flightData = await streamToBuffer(reactServerResult.asStream())
        metadata.flightData = flightData
        metadata.segmentData = await collectSegmentData(
          flightData,
          prerenderLegacyStore,
          ComponentMod,
          renderOpts
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
          inlinedDataStream: createInlinedDataReadableStream(
            reactServerResult.consumeAsStream(),
            nonce,
            formState
          ),
          isStaticGeneration: true,
          isBuildTimePrerendering:
            ctx.workStore.isBuildTimePrerendering === true,
          buildId: ctx.workStore.buildId,
          getServerInsertedHTML,
          getServerInsertedMetadata,
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

    if (isHTTPAccessFallbackError(err)) {
      res.statusCode = getAccessFallbackHTTPStatus(err)
      metadata.statusCode = res.statusCode
      errorType = getAccessFallbackErrorTypeByStatus(res.statusCode)
    } else if (isRedirectError(err)) {
      errorType = 'redirect'
      res.statusCode = getRedirectStatusCodeFromError(err)
      metadata.statusCode = res.statusCode

      const redirectUrl = addPathPrefix(getURLFromRedirectError(err), basePath)

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

    const prerenderLegacyStore: PrerenderStore = (prerenderStore = {
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
    })
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
      ComponentMod.renderToReadableStream,
      errorRSCPayload,
      clientReferenceManifest.clientModules,
      {
        filterStackFrame,
        onError: serverComponentsErrorHandler,
      }
    )

    try {
      // TODO we should use the same prerender semantics that we initially rendered
      // with in this case too. The only reason why this is ok atm is because it's essentially
      // an empty page and no user code runs.
      const fizzStream = await workUnitAsyncStorage.run(
        prerenderLegacyStore,
        renderToInitialFizzStream,
        {
          ReactDOMServer:
            require('react-dom/server') as typeof import('react-dom/server'),
          element: (
            // eslint-disable-next-line @next/internal/no-ambiguous-jsx
            <ErrorApp
              reactServerStream={errorServerStream}
              reactDebugStream={undefined}
              ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
              preinitScripts={errorPreinitScripts}
              clientReferenceManifest={clientReferenceManifest}
              nonce={nonce}
              images={ctx.renderOpts.images}
            />
          ),
          streamOptions: {
            nonce,
            // Include hydration scripts in the HTML
            bootstrapScripts: [errorBootstrapScript],
            formState,
          },
        }
      )

      if (shouldGenerateStaticFlightData(workStore)) {
        const flightData = await streamToBuffer(
          reactServerPrerenderResult.asStream()
        )
        metadata.flightData = flightData
        metadata.segmentData = await collectSegmentData(
          flightData,
          prerenderLegacyStore,
          ComponentMod,
          renderOpts
        )
      }

      // This is intentionally using the readable datastream from the main
      // render rather than the flight data from the error page render
      const flightStream = reactServerPrerenderResult.consumeAsStream()

      return {
        // Returning the error that was thrown so it can be used to handle
        // the response in the caller.
        digestErrorsMap: reactServerErrorsByDigest,
        ssrErrors: allCapturedErrors,
        stream: await continueFizzStream(fizzStream, {
          inlinedDataStream: createInlinedDataReadableStream(
            flightStream,
            nonce,
            formState
          ),
          isStaticGeneration: true,
          isBuildTimePrerendering:
            ctx.workStore.isBuildTimePrerendering === true,
          buildId: ctx.workStore.buildId,
          getServerInsertedHTML: makeGetServerInsertedHTML({
            polyfills,
            renderServerInsertedHTML,
            serverCapturedErrors: [],
            basePath,
            tracingMetadata: tracingMetadata,
          }),
          getServerInsertedMetadata,
          validateRootLayout: dev,
        }),
        dynamicAccess: null,
        collectedRevalidate:
          prerenderStore !== null ? prerenderStore.revalidate : INFINITE_CACHE,
        collectedExpire:
          prerenderStore !== null ? prerenderStore.expire : INFINITE_CACHE,
        collectedStale: selectStaleTime(
          prerenderStore !== null ? prerenderStore.stale : INFINITE_CACHE
        ),
        collectedTags: prerenderStore !== null ? prerenderStore.tags : null,
      }
    } catch (finalErr: any) {
      if (
        process.env.NODE_ENV === 'development' &&
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
  const {
    modules: { 'global-error': globalErrorModule },
  } = parseLoaderTree(tree)

  const {
    componentMod: { createElement },
  } = ctx
  const GlobalErrorComponent: GlobalErrorComponent =
    ctx.componentMod.GlobalError
  let globalErrorStyles
  if (globalErrorModule) {
    const [, styles] = await createComponentStylesAndScripts({
      ctx,
      filePath: globalErrorModule[1],
      getComponent: globalErrorModule[0],
      injectedCSS: new Set(),
      injectedJS: new Set(),
    })
    globalErrorStyles = styles
  }
  if (ctx.renderOpts.dev) {
    const dir =
      (process.env.NEXT_RUNTIME === 'edge'
        ? process.env.__NEXT_EDGE_PROJECT_DIR
        : ctx.renderOpts.dir) || ''

    const globalErrorModulePath = normalizeConventionFilePath(
      dir,
      globalErrorModule?.[1]
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

function createSelectStaleTime(experimental: ExperimentalConfig) {
  return (stale: number) =>
    stale === INFINITE_CACHE &&
    typeof experimental.staleTimes?.static === 'number'
      ? experimental.staleTimes.static
      : stale
}

async function collectSegmentData(
  fullPageDataBuffer: Buffer,
  prerenderStore: PrerenderStore,
  ComponentMod: AppPageModule,
  renderOpts: RenderOpts
): Promise<Map<string, Buffer> | undefined> {
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

  const clientReferenceManifest = renderOpts.clientReferenceManifest
  if (
    !clientReferenceManifest ||
    // Do not generate per-segment data unless the experimental Segment Cache
    // flag is enabled.
    //
    // We also skip generating segment data if flag is set to "client-only",
    // rather than true. (The "client-only" option only affects the behavior of
    // the client-side implementation; per-segment prefetches are intentionally
    // disabled in that configuration).
    renderOpts.experimental.clientSegmentCache !== true
  ) {
    return
  }

  // Manifest passed to the Flight client for reading the full-page Flight
  // stream. Based off similar code in use-cache-wrapper.ts.
  const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'
  const serverConsumerManifest = {
    // moduleLoading must be null because we don't want to trigger preloads of ClientReferences
    // to be added to the consumer. Instead, we'll wait for any ClientReference to be emitted
    // which themselves will handle the preloading.
    moduleLoading: null,
    moduleMap: isEdgeRuntime
      ? clientReferenceManifest.edgeRscModuleMapping
      : clientReferenceManifest.rscModuleMapping,
    serverModuleMap: getServerModuleMap(),
  }

  const selectStaleTime = createSelectStaleTime(renderOpts.experimental)
  const staleTime = selectStaleTime(prerenderStore.stale)
  return await ComponentMod.collectSegmentData(
    renderOpts.cacheComponents,
    fullPageDataBuffer,
    staleTime,
    clientReferenceManifest.clientModules as ManifestNode,
    serverConsumerManifest
  )
}

function isBypassingCachesInDev(
  renderOpts: RenderOpts,
  requestStore: RequestStore
): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    !!renderOpts.dev &&
    requestStore.headers.get('cache-control') === 'no-cache'
  )
}

function WarnForBypassCachesInDev({ route }: { route: string }) {
  warnOnce(
    `Route ${route} is rendering with server caches disabled. For this navigation, Component Metadata in React DevTools will not accurately reflect what is statically prerenderable and runtime prefetchable. See more info here: https://nextjs.org/docs/messages/cache-bypass-in-dev`
  )
  return null
}
