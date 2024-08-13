import type {
  ActionResult,
  DynamicParamTypesShort,
  FlightRouterState,
  FlightSegmentPath,
  RenderOpts,
  Segment,
  CacheNodeSeedData,
  PreloadCallbacks,
  RSCPayload,
  FlightData,
  InitialRSCPayload,
} from './types'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import type { RequestStore } from '../../client/components/request-async-storage.external'
import type { NextParsedUrlQuery } from '../request-meta'
import type { LoaderTree } from '../lib/app-dir-module'
import type { AppPageModule } from '../route-modules/app-page/module'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { Revalidate } from '../lib/revalidate'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'
import type { BaseNextRequest, BaseNextResponse } from '../base-http'
import type { IncomingHttpHeaders } from 'http'

import React, { type JSX } from 'react'

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
} from '../stream-utils/node-web-streams-helper'
import { stripInternalQueries } from '../internal-utils'
import {
  NEXT_HMR_REFRESH_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_URL,
  RSC_HEADER,
} from '../../client/components/app-router-headers'
import {
  createMetadataComponents,
  createMetadataContext,
} from '../../lib/metadata/metadata'
import { withRequestStore } from '../async-storage/with-request-store'
import { withStaticGenerationStore } from '../async-storage/with-static-generation-store'
import { isNotFoundError } from '../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
  getRedirectStatusCodeFromError,
} from '../../client/components/redirect'
import { addImplicitTags } from '../lib/patch-fetch'
import { AppRenderSpan, NextNodeServerSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'
import { FlightRenderResult } from './flight-render-result'
import {
  createFlightReactServerErrorHandler,
  createHTMLReactServerErrorHandler,
  createHTMLErrorHandler,
  type DigestedError,
} from './create-error-handler'
import {
  getShortDynamicParamType,
  dynamicParamTypes,
} from './get-short-dynamic-param-type'
import { getSegmentParam } from './get-segment-param'
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
import {
  getTracedMetadata,
  makeGetServerInsertedHTML,
} from './make-get-server-inserted-html'
import { walkTreeWithFlightRouterState } from './walk-tree-with-flight-router-state'
import { createComponentTree } from './create-component-tree'
import { getAssetQueryString } from './get-asset-query-string'
import { setReferenceManifestsSingleton } from './encryption-utils'
import {
  DYNAMIC_DATA,
  getDynamicDataPostponedState,
  getDynamicHTMLPostponedState,
  getPostponedFromState,
  type PostponedState,
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
  usedDynamicAPIs,
  createPostponedAbortSignal,
  formatDynamicAPIAccesses,
  createDynamicTrackingState,
  type DynamicTrackingState,
} from './dynamic-rendering'
import {
  getClientComponentLoaderMetrics,
  wrapClientComponentLoader,
} from '../client-component-renderer-logger'
import { createServerModuleMap } from './action-utils'
import { isNodeNextRequest } from '../base-http/helpers'
import { parseParameter } from '../../shared/lib/router/utils/route-regex'
import { parseRelativeUrl } from '../../shared/lib/router/utils/parse-relative-url'
import AppRouter from '../../client/components/app-router'
import type { ServerComponentsHmrCache } from '../response-cache'
import type { RequestErrorContext } from '../instrumentation/types'
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
import { createInitialRouterState } from '../../client/components/router-reducer/create-initial-router-state'
import { createMutableActionQueue } from '../../shared/lib/router/action-queue'
import { prerenderAsyncStorage } from './prerender-async-storage.external'

export type GetDynamicParamFromSegment = (
  // [slug] / [[slug]] / [...slug]
  segment: string
) => {
  param: string
  value: string | string[] | null
  treeSegment: Segment
  type: DynamicParamTypesShort
} | null

export type GenerateFlight = typeof generateDynamicFlightRenderResult

export type AppRenderContext = {
  staticGenerationStore: StaticGenerationStore
  requestStore: RequestStore
  componentMod: AppPageModule
  renderOpts: RenderOpts
  parsedRequestHeaders: ParsedRequestHeaders
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  query: NextParsedUrlQuery
  isPrefetch: boolean
  isAction: boolean
  requestTimestamp: number
  appUsingSizeAdjustment: boolean
  flightRouterState?: FlightRouterState
  requestId: string
  defaultRevalidate: Revalidate
  pagePath: string
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  assetPrefix: string
  isNotFoundPath: boolean
  nonce: string | undefined
  res: BaseNextResponse
}

interface ParseRequestHeadersOptions {
  readonly isRoutePPREnabled: boolean
}

const flightDataPathHeadKey = 'h'

interface ParsedRequestHeaders {
  /**
   * Router state provided from the client-side router. Used to handle rendering
   * from the common layout down. This value will be undefined if the request is
   * not a client-side navigation request, or if the request is a prefetch
   * request.
   */
  readonly flightRouterState: FlightRouterState | undefined
  readonly isPrefetchRequest: boolean
  readonly isHmrRefresh: boolean
  readonly isRSCRequest: boolean
  readonly nonce: string | undefined
}

function parseRequestHeaders(
  headers: IncomingHttpHeaders,
  options: ParseRequestHeadersOptions
): ParsedRequestHeaders {
  const isPrefetchRequest =
    headers[NEXT_ROUTER_PREFETCH_HEADER.toLowerCase()] !== undefined

  const isHmrRefresh =
    headers[NEXT_HMR_REFRESH_HEADER.toLowerCase()] !== undefined

  const isRSCRequest = headers[RSC_HEADER.toLowerCase()] !== undefined

  const shouldProvideFlightRouterState =
    isRSCRequest && (!isPrefetchRequest || !options.isRoutePPREnabled)

  const flightRouterState = shouldProvideFlightRouterState
    ? parseAndValidateFlightRouterState(
        headers[NEXT_ROUTER_STATE_TREE_HEADER.toLowerCase()]
      )
    : undefined

  const csp =
    headers['content-security-policy'] ||
    headers['content-security-policy-report-only']

  const nonce =
    typeof csp === 'string' ? getScriptNonceFromHeader(csp) : undefined

  return {
    flightRouterState,
    isPrefetchRequest,
    isHmrRefresh,
    isRSCRequest,
    nonce,
  }
}

function createNotFoundLoaderTree(loaderTree: LoaderTree): LoaderTree {
  // Align the segment with parallel-route-default in next-app-loader
  return ['', {}, loaderTree[2]]
}

export type CreateSegmentPath = (child: FlightSegmentPath) => FlightSegmentPath

/**
 * Returns a function that parses the dynamic segment and return the associated value.
 */
function makeGetDynamicParamFromSegment(
  params: { [key: string]: any },
  pagePath: string
): GetDynamicParamFromSegment {
  return function getDynamicParamFromSegment(
    // [slug] / [[slug]] / [...slug]
    segment: string
  ) {
    const segmentParam = getSegmentParam(segment)
    if (!segmentParam) {
      return null
    }

    const key = segmentParam.param

    let value = params[key]

    if (Array.isArray(value)) {
      value = value.map((i) => encodeURIComponent(i))
    } else if (typeof value === 'string') {
      value = encodeURIComponent(value)
    }

    if (!value) {
      const isCatchall = segmentParam.type === 'catchall'
      const isOptionalCatchall = segmentParam.type === 'optional-catchall'

      if (isCatchall || isOptionalCatchall) {
        const dynamicParamType = dynamicParamTypes[segmentParam.type]
        // handle the case where an optional catchall does not have a value,
        // e.g. `/dashboard/[[...slug]]` when requesting `/dashboard`
        if (isOptionalCatchall) {
          return {
            param: key,
            value: null,
            type: dynamicParamType,
            treeSegment: [key, '', dynamicParamType],
          }
        }

        // handle the case where a catchall or optional catchall does not have a value,
        // e.g. `/foo/bar/hello` and `@slot/[...catchall]` or `@slot/[[...catchall]]` is matched
        value = pagePath
          .split('/')
          // remove the first empty string
          .slice(1)
          // replace any dynamic params with the actual values
          .flatMap((pathSegment) => {
            const param = parseParameter(pathSegment)
            // if the segment matches a param, return the param value
            // otherwise, it's a static segment, so just return that
            return params[param.key] ?? param.key
          })

        return {
          param: key,
          value,
          type: dynamicParamType,
          // This value always has to be a string.
          treeSegment: [key, value.join('/'), dynamicParamType],
        }
      }
    }

    const type = getShortDynamicParamType(segmentParam.type)

    return {
      param: key,
      // The value that is passed to user code.
      value: value,
      // The value that is rendered in the router tree.
      treeSegment: [key, Array.isArray(value) ? value.join('/') : value, type],
      type: type,
    }
  }
}

function NonIndex({ ctx }: { ctx: AppRenderContext }) {
  const is404Page = ctx.pagePath === '/404'
  const isInvalidStatusCode =
    typeof ctx.res.statusCode === 'number' && ctx.res.statusCode > 400

  if (is404Page || isInvalidStatusCode) {
    return <meta name="robots" content="noindex" />
  }
  return null
}

/**
 * This is used by server actions & client-side navigations to generate RSC data from a client-side request.
 * This function is only called on "dynamic" requests (ie, there wasn't already a static response).
 * It uses request headers (namely `Next-Router-State-Tree`) to determine where to start rendering.
 */
async function generateDynamicRSCPayload(
  ctx: AppRenderContext,
  options?: {
    actionResult: ActionResult
    skipFlight: boolean
    asNotFound?: boolean
  }
): Promise<RSCPayload> {
  // Flight data that is going to be passed to the browser.
  // Currently a single item array but in the future multiple patches might be combined in a single request.
  let flightData: FlightData | null = null

  const {
    componentMod: { tree: loaderTree, createDynamicallyTrackedSearchParams },
    getDynamicParamFromSegment,
    appUsingSizeAdjustment,
    requestStore: { url },
    query,
    requestId,
    flightRouterState,
  } = ctx

  if (!options?.skipFlight) {
    const preloadCallbacks: PreloadCallbacks = []

    const [MetadataTree, getMetadataReady] = createMetadataComponents({
      tree: loaderTree,
      query,
      metadataContext: createMetadataContext(url.pathname, ctx.renderOpts),
      getDynamicParamFromSegment,
      appUsingSizeAdjustment,
      createDynamicallyTrackedSearchParams,
    })
    flightData = (
      await walkTreeWithFlightRouterState({
        ctx,
        createSegmentPath: (child) => child,
        loaderTreeToFilter: loaderTree,
        parentParams: {},
        flightRouterState,
        isFirst: true,
        // For flight, render metadata inside leaf page
        rscPayloadHead: (
          <React.Fragment key={flightDataPathHeadKey}>
            <NonIndex ctx={ctx} />
            {/* Adding requestId as react key to make metadata remount for each render */}
            <MetadataTree key={requestId} />
          </React.Fragment>
        ),
        injectedCSS: new Set(),
        injectedJS: new Set(),
        injectedFontPreloadTags: new Set(),
        rootLayoutIncluded: false,
        asNotFound: ctx.isNotFoundPath || options?.asNotFound,
        getMetadataReady,
        preloadCallbacks,
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
      b: ctx.renderOpts.buildId,
    }
  }

  // Otherwise, it's a regular RSC response.
  return {
    b: ctx.renderOpts.buildId,
    // Anything besides an action response should have non-null flightData.
    // We don't ever expect this to be null because `skipFlight` is only
    // used when invoked by a server action, which is covered above.
    // The client router can handle an empty string (treating it as an MPA navigation),
    // so we'll use that as a fallback.
    f: flightData ?? '',
  }
}

function createErrorContext(
  ctx: AppRenderContext,
  renderSource: RequestErrorContext['renderSource']
): RequestErrorContext {
  return {
    routerKind: 'App Router',
    routePath: ctx.pagePath,
    routeType: ctx.isAction ? 'action' : 'render',
    renderSource,
  }
}
/**
 * Produces a RenderResult containing the Flight data for the given request. See
 * `generateDynamicRSCPayload` for information on the contents of the render result.
 */
async function generateDynamicFlightRenderResult(
  req: BaseNextRequest,
  ctx: AppRenderContext,
  options?: {
    actionResult: ActionResult
    skipFlight: boolean
    asNotFound?: boolean
    componentTree?: CacheNodeSeedData
    preloadCallbacks?: PreloadCallbacks
  }
): Promise<RenderResult> {
  const renderOpts = ctx.renderOpts

  function onFlightDataRenderError(err: DigestedError) {
    return renderOpts.onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, 'react-server-components-payload')
    )
  }
  const onError = createFlightReactServerErrorHandler(
    !!renderOpts.dev,
    onFlightDataRenderError
  )

  const rscPayload = await generateDynamicRSCPayload(ctx, options)

  // For app dir, use the bundled version of Flight server renderer (renderToReadableStream)
  // which contains the subset React.
  const flightReadableStream = ctx.componentMod.renderToReadableStream(
    rscPayload,
    ctx.clientReferenceManifest.clientModules,
    {
      onError,
      nonce: ctx.nonce,
    }
  )

  return new FlightRenderResult(flightReadableStream, {
    fetchMetrics: ctx.staticGenerationStore.fetchMetrics,
  })
}

// This is the data necessary to render <AppRouter /> when no SSR errors are encountered
async function getRSCPayload(
  tree: LoaderTree,
  ctx: AppRenderContext,
  asNotFound: boolean
) {
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
    componentMod: { GlobalError, createDynamicallyTrackedSearchParams },
    requestStore: { url },
  } = ctx
  const initialTree = createFlightRouterStateFromLoaderTree(
    tree,
    getDynamicParamFromSegment,
    query
  )

  const [MetadataTree, getMetadataReady] = createMetadataComponents({
    tree,
    errorType: asNotFound ? 'not-found' : undefined,
    query,
    metadataContext: createMetadataContext(url.pathname, ctx.renderOpts),
    getDynamicParamFromSegment: getDynamicParamFromSegment,
    appUsingSizeAdjustment: appUsingSizeAdjustment,
    createDynamicallyTrackedSearchParams,
  })

  const preloadCallbacks: PreloadCallbacks = []

  const seedData = await createComponentTree({
    ctx,
    createSegmentPath: (child) => child,
    loaderTree: tree,
    parentParams: {},
    firstItem: true,
    injectedCSS,
    injectedJS,
    injectedFontPreloadTags,
    rootLayoutIncluded: false,
    asNotFound: asNotFound,
    getMetadataReady,
    missingSlots,
    preloadCallbacks,
  })

  // When the `vary` response header is present with `Next-URL`, that means there's a chance
  // it could respond differently if there's an interception route. We provide this information
  // to `AppRouter` so that it can properly seed the prefetch cache with a prefix, if needed.
  const varyHeader = ctx.res.getHeader('vary')
  const couldBeIntercepted =
    typeof varyHeader === 'string' && varyHeader.includes(NEXT_URL)

  const initialHead = (
    <React.Fragment key={flightDataPathHeadKey}>
      <NonIndex ctx={ctx} />
      {/* Adding requestId as react key to make metadata remount for each render */}
      <MetadataTree key={ctx.requestId} />
    </React.Fragment>
  )

  return {
    // See the comment above the `Preloads` component (below) for why this is part of the payload
    P: <Preloads preloadCallbacks={preloadCallbacks} />,
    b: ctx.renderOpts.buildId,
    p: ctx.assetPrefix,
    c: url.pathname + url.search,
    i: couldBeIntercepted,
    f: [[initialTree, seedData, initialHead]],
    m: missingSlots,
    G: GlobalError,
  } satisfies InitialRSCPayload & { P: React.ReactNode }
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
  errorType: 'not-found' | 'redirect' | undefined
) {
  const {
    getDynamicParamFromSegment,
    query,
    appUsingSizeAdjustment,
    componentMod: { GlobalError, createDynamicallyTrackedSearchParams },
    requestStore: { url },
    requestId,
  } = ctx

  const [MetadataTree] = createMetadataComponents({
    tree,
    metadataContext: createMetadataContext(url.pathname, ctx.renderOpts),
    errorType,
    query,
    getDynamicParamFromSegment,
    appUsingSizeAdjustment,
    createDynamicallyTrackedSearchParams,
  })

  const initialHead = (
    <React.Fragment key={flightDataPathHeadKey}>
      <NonIndex ctx={ctx} />
      {/* Adding requestId as react key to make metadata remount for each render */}
      <MetadataTree key={requestId} />
      {process.env.NODE_ENV === 'development' && (
        <meta name="next-error" content="not-found" />
      )}
    </React.Fragment>
  )

  const initialTree = createFlightRouterStateFromLoaderTree(
    tree,
    getDynamicParamFromSegment,
    query
  )

  // For metadata notFound error there's no global not found boundary on top
  // so we create a not found page with AppRouter
  const initialSeedData: CacheNodeSeedData = [
    initialTree[0],
    {},
    <html id="__next_error__">
      <head></head>
      <body></body>
    </html>,
    null,
  ]

  return {
    b: ctx.renderOpts.buildId,
    p: ctx.assetPrefix,
    c: url.pathname + url.search,
    m: undefined,
    i: false,
    f: [[initialTree, initialSeedData, initialHead]],
    G: GlobalError,
  } satisfies RSCPayload
}

// This component must run in an SSR context. It will render the RSC root component
function App<T>({
  reactServerStream,
  preinitScripts,
  clientReferenceManifest,
  nonce,
  ServerInsertedHTMLProvider,
}: {
  reactServerStream: BinaryStreamOf<T>
  preinitScripts: () => void
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  ServerInsertedHTMLProvider: React.ComponentType<{ children: JSX.Element }>
  nonce?: string
}): JSX.Element {
  preinitScripts()
  const response = React.use(
    useFlightStream<InitialRSCPayload>(
      reactServerStream,
      clientReferenceManifest,
      nonce
    )
  )

  const initialState = createInitialRouterState({
    buildId: response.b,
    initialFlightData: response.f,
    initialCanonicalUrl: response.c,
    // location and initialParallelRoutes are not initialized in the SSR render
    // they are set to an empty map and window.location, respectively during hydration
    initialParallelRoutes: null!,
    location: null,
    couldBeIntercepted: response.i,
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
      <ServerInsertedHTMLProvider>
        <AppRouter
          actionQueue={actionQueue}
          globalErrorComponent={response.G}
          assetPrefix={response.p}
        />
      </ServerInsertedHTMLProvider>
    </HeadManagerContext.Provider>
  )
}

// @TODO our error stream should be probably just use the same root component. But it was previosuly
// different I don't want to figure out if that is meaningful at this time so just keeping the behavior
// consistent for now.
function AppWithoutContext<T>({
  reactServerStream,
  preinitScripts,
  clientReferenceManifest,
  nonce,
}: {
  reactServerStream: BinaryStreamOf<T>
  preinitScripts: () => void
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  nonce?: string
}): JSX.Element {
  preinitScripts()
  const response = React.use(
    useFlightStream<InitialRSCPayload>(
      reactServerStream,
      clientReferenceManifest,
      nonce
    )
  )

  const initialState = createInitialRouterState({
    buildId: response.b,
    initialFlightData: response.f,
    initialCanonicalUrl: response.c,
    // location and initialParallelRoutes are not initialized in the SSR render
    // they are set to an empty map and window.location, respectively during hydration
    initialParallelRoutes: null!,
    location: null,
    couldBeIntercepted: response.i,
  })

  const actionQueue = createMutableActionQueue(initialState)

  return (
    <AppRouter
      actionQueue={actionQueue}
      globalErrorComponent={response.G}
      assetPrefix={response.p}
    />
  )
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
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  requestStore: RequestStore,
  staticGenerationStore: StaticGenerationStore,
  parsedRequestHeaders: ParsedRequestHeaders,
  requestEndedState: { ended?: boolean }
) {
  const isNotFoundPath = pagePath === '/404'

  // A unique request timestamp used by development to ensure that it's
  // consistent and won't change during this request. This is important to
  // avoid that resources can be deduped by React Float if the same resource is
  // rendered or preloaded multiple times: `<link href="a.css?v={Date.now()}"/>`.
  const requestTimestamp = Date.now()

  const {
    serverActionsManifest,
    ComponentMod,
    nextFontManifest,
    serverActions,
    assetPrefix = '',
    enableTainting,
  } = renderOpts

  // We need to expose the bundled `require` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app__) {
    const instrumented = wrapClientComponentLoader(ComponentMod)
    // @ts-ignore
    globalThis.__next_require__ = instrumented.require
    // When we are prerendering if there is a cacheSignal for tracking
    // cache reads we wrap the loadChunk in this tracking. This allows us
    // to treat chunk loading with similar semantics as cache reads to avoid
    // async loading chunks from causing a prerender to abort too early.
    // @ts-ignore
    globalThis.__next_chunk_load__ = instrumented.loadChunk
  }

  if (process.env.NODE_ENV === 'development') {
    // reset isr status at start of request
    const { pathname } = new URL(req.url || '/', 'http://n')
    renderOpts.setAppIsrStatus?.(pathname, null)
  }

  if (
    // The type check here ensures that `req` is correctly typed, and the
    // environment variable check provides dead code elimination.
    process.env.NEXT_RUNTIME !== 'edge' &&
    isNodeNextRequest(req)
  ) {
    req.originalRequest.on('end', () => {
      const staticGenStore =
        ComponentMod.staticGenerationAsyncStorage.getStore()

      if (
        process.env.NODE_ENV === 'development' &&
        staticGenStore &&
        renderOpts.setAppIsrStatus
      ) {
        // only node can be ISR so we only need to update the status here
        const { pathname } = new URL(req.url || '/', 'http://n')
        let { revalidate } = staticGenStore
        if (typeof revalidate === 'undefined') {
          revalidate = false
        }
        if (revalidate === false || revalidate > 0) {
          renderOpts.setAppIsrStatus(pathname, revalidate)
        }
      }

      requestEndedState.ended = true

      if ('performance' in globalThis) {
        const metrics = getClientComponentLoaderMetrics({ reset: true })
        if (metrics) {
          getTracer()
            .startSpan(NextNodeServerSpan.clientComponentLoading, {
              startTime: metrics.clientComponentLoadStart,
              attributes: {
                'next.clientComponentLoadCount':
                  metrics.clientComponentLoadCount,
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

  const metadata: AppPageRenderResultMetadata = {}

  const appUsingSizeAdjustment = !!nextFontManifest?.appUsingSizeAdjust

  // TODO: fix this typescript
  const clientReferenceManifest = renderOpts.clientReferenceManifest!

  const serverModuleMap = createServerModuleMap({
    serverActionsManifest,
    pageName: renderOpts.page,
  })

  setReferenceManifestsSingleton({
    clientReferenceManifest,
    serverActionsManifest,
    serverModuleMap,
  })

  ComponentMod.patchFetch()

  // Pull out the hooks/references from the component.
  const { tree: loaderTree, taintObjectReference } = ComponentMod

  if (enableTainting) {
    taintObjectReference(
      'Do not pass process.env to client components since it will leak sensitive data',
      process.env
    )
  }

  staticGenerationStore.fetchMetrics = []
  metadata.fetchMetrics = staticGenerationStore.fetchMetrics

  // don't modify original query object
  query = { ...query }
  stripInternalQueries(query)

  const { flightRouterState, isPrefetchRequest, isRSCRequest, nonce } =
    parsedRequestHeaders

  /**
   * The metadata items array created in next-app-loader with all relevant information
   * that we need to resolve the final metadata.
   */
  let requestId: string

  if (process.env.NEXT_RUNTIME === 'edge') {
    requestId = crypto.randomUUID()
  } else {
    requestId = require('next/dist/compiled/nanoid').nanoid()
  }

  /**
   * Dynamic parameters. E.g. when you visit `/dashboard/vercel` which is rendered by `/dashboard/[slug]` the value will be {"slug": "vercel"}.
   */
  const params = renderOpts.params ?? {}

  const getDynamicParamFromSegment = makeGetDynamicParamFromSegment(
    params,
    pagePath
  )

  const isActionRequest = getServerActionRequestMetadata(req).isServerAction

  const ctx: AppRenderContext = {
    componentMod: ComponentMod,
    renderOpts,
    requestStore,
    staticGenerationStore,
    parsedRequestHeaders,
    getDynamicParamFromSegment,
    query,
    isPrefetch: isPrefetchRequest,
    isAction: isActionRequest,
    requestTimestamp,
    appUsingSizeAdjustment,
    flightRouterState,
    requestId,
    defaultRevalidate: false,
    pagePath,
    clientReferenceManifest,
    assetPrefix,
    isNotFoundPath,
    nonce,
    res,
  }

  getTracer().getRootSpanAttributes()?.set('next.route', pagePath)

  const { isStaticGeneration } = staticGenerationStore

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

    const asNotFound = isNotFoundPath
    let response = await prerenderToStreamWithTracing(
      req,
      res,
      ctx,
      metadata,
      staticGenerationStore,
      asNotFound,
      loaderTree
    )

    // If we're debugging partial prerendering, print all the dynamic API accesses
    // that occurred during the render.
    // @TODO move into renderToStream function
    if (
      response.dynamicTracking &&
      usedDynamicAPIs(response.dynamicTracking) &&
      response.dynamicTracking.isDebugDynamicAccesses
    ) {
      warn('The following dynamic usage was detected:')
      for (const access of formatDynamicAPIAccesses(response.dynamicTracking)) {
        warn(access)
      }
    }

    // If we encountered any unexpected errors during build we fail the
    // prerendering phase and the build.
    if (response.digestErrorsMap.size) {
      const buildFailingError = response.digestErrorsMap.values().next().value
      throw buildFailingError
    }

    const options: RenderResultOptions = {
      metadata,
    }
    // If we have pending revalidates, wait until they are all resolved.
    if (staticGenerationStore.pendingRevalidates) {
      options.waitUntil = Promise.all([
        staticGenerationStore.incrementalCache?.revalidateTag(
          staticGenerationStore.revalidatedTags || []
        ),
        ...Object.values(staticGenerationStore.pendingRevalidates || {}),
      ])
    }

    addImplicitTags(staticGenerationStore, requestStore)

    if (staticGenerationStore.tags) {
      metadata.fetchTags = staticGenerationStore.tags.join(',')
    }

    // If force static is specifically set to false, we should not revalidate
    // the page.
    if (staticGenerationStore.forceStatic === false) {
      staticGenerationStore.revalidate = 0
    }

    // Copy the revalidation value onto the render result metadata.
    metadata.revalidate =
      staticGenerationStore.revalidate ?? ctx.defaultRevalidate

    // provide bailout info for debugging
    if (metadata.revalidate === 0) {
      metadata.staticBailoutInfo = {
        description: staticGenerationStore.dynamicUsageDescription,
        stack: staticGenerationStore.dynamicUsageStack,
      }
    }

    return new RenderResult(await streamToString(response.stream), options)
  } else {
    // We're rendering dynamically
    if (isRSCRequest) {
      return generateDynamicFlightRenderResult(req, ctx)
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

    let formState: null | any = null
    if (isActionRequest) {
      // For action requests, we handle them differently with a special render result.
      const actionRequestResult = await handleAction({
        req,
        res,
        ComponentMod,
        serverModuleMap,
        generateFlight: generateDynamicFlightRenderResult,
        staticGenerationStore,
        requestStore,
        serverActions,
        ctx,
      })

      if (actionRequestResult) {
        if (actionRequestResult.type === 'not-found') {
          const notFoundLoaderTree = createNotFoundLoaderTree(loaderTree)
          const asNotFound = true
          const stream = await renderToStreamWithTracing(
            req,
            res,
            ctx,
            asNotFound,
            notFoundLoaderTree,
            formState
          )

          return new RenderResult(stream, { metadata })
        } else if (actionRequestResult.type === 'done') {
          if (actionRequestResult.result) {
            actionRequestResult.result.assignMetadata(metadata)
            return actionRequestResult.result
          } else if (actionRequestResult.formState) {
            formState = actionRequestResult.formState
          }
        }
      }
    }

    const options: RenderResultOptions = {
      metadata,
    }

    const asNotFound = isNotFoundPath
    const stream = await renderToStreamWithTracing(
      req,
      res,
      ctx,
      asNotFound,
      loaderTree,
      formState
    )

    // If we have pending revalidates, wait until they are all resolved.
    if (staticGenerationStore.pendingRevalidates) {
      options.waitUntil = Promise.all([
        staticGenerationStore.incrementalCache?.revalidateTag(
          staticGenerationStore.revalidatedTags || []
        ),
        ...Object.values(staticGenerationStore.pendingRevalidates || {}),
      ])
    }

    addImplicitTags(staticGenerationStore, requestStore)

    if (staticGenerationStore.tags) {
      metadata.fetchTags = staticGenerationStore.tags.join(',')
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
  renderOpts: RenderOpts,
  serverComponentsHmrCache?: ServerComponentsHmrCache
) => Promise<RenderResult<AppPageRenderResultMetadata>>

export const renderToHTMLOrFlight: AppPageRender = (
  req,
  res,
  pagePath,
  query,
  renderOpts,
  serverComponentsHmrCache
) => {
  if (!req.url) {
    throw new Error('Invalid URL')
  }

  const url = parseRelativeUrl(req.url, undefined, false)

  // We read these values from the request object as, in certain cases,
  // base-server will strip them to opt into different rendering behavior.
  const parsedRequestHeaders = parseRequestHeaders(req.headers, {
    isRoutePPREnabled: renderOpts.experimental.isRoutePPREnabled === true,
  })

  const { isHmrRefresh } = parsedRequestHeaders

  const requestEndedState = { ended: false }

  return withRequestStore(
    renderOpts.ComponentMod.requestAsyncStorage,
    {
      req,
      url,
      res,
      renderOpts,
      isHmrRefresh,
      serverComponentsHmrCache,
    },
    (requestStore) =>
      withStaticGenerationStore(
        renderOpts.ComponentMod.staticGenerationAsyncStorage,
        {
          page: renderOpts.routeModule.definition.page,
          renderOpts,
          requestEndedState,
        },
        (staticGenerationStore) =>
          renderToHTMLOrFlightImpl(
            req,
            res,
            pagePath,
            query,
            renderOpts,
            requestStore,
            staticGenerationStore,
            parsedRequestHeaders,
            requestEndedState
          )
      )
  )
}

async function renderToStream(
  req: BaseNextRequest,
  res: BaseNextResponse,
  ctx: AppRenderContext,

  asNotFound: boolean,
  tree: LoaderTree,
  formState: any
): Promise<ReadableStream<Uint8Array>> {
  const renderOpts = ctx.renderOpts
  const ComponentMod = renderOpts.ComponentMod
  // TODO: fix this typescript
  const clientReferenceManifest = renderOpts.clientReferenceManifest!

  const { ServerInsertedHTMLProvider, renderServerInsertedHTML } =
    createServerInsertedHTML()

  const tracingMetadata = getTracedMetadata(
    getTracer().getTracePropagationData(),
    renderOpts.experimental.clientTraceMetadata
  )

  const polyfills: JSX.IntrinsicElements['script'][] =
    renderOpts.buildManifest.polyfillFiles
      .filter(
        (polyfill) =>
          polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
      )
      .map((polyfill) => ({
        src: `${ctx.assetPrefix}/_next/${polyfill}${getAssetQueryString(
          ctx,
          false
        )}`,
        integrity: renderOpts.subresourceIntegrityManifest?.[polyfill],
        crossOrigin: renderOpts.crossOrigin,
        noModule: true,
        nonce: ctx.nonce,
      }))

  const [preinitScripts, bootstrapScript] = getRequiredScripts(
    renderOpts.buildManifest,
    // Why is assetPrefix optional on renderOpts?
    // @TODO make it default empty string on renderOpts and get rid of it from ctx
    ctx.assetPrefix,
    renderOpts.crossOrigin,
    renderOpts.subresourceIntegrityManifest,
    getAssetQueryString(ctx, true),
    ctx.nonce,
    renderOpts.page
  )

  const reactServerErrorsByDigest: Map<string, DigestedError> = new Map()
  const silenceLogger = false
  const serverComponentsErrorHandler = createHTMLReactServerErrorHandler(
    !!renderOpts.dev,
    !!renderOpts.nextExport,
    reactServerErrorsByDigest,
    silenceLogger,
    // RSC rendering error will report as SSR error
    // @TODO we should report RSC errors where they happen for instrumentation purposes
    // and should omit the error reporter in the SSR layer instead
    undefined
  )
  function onServerRenderError(err: DigestedError) {
    const renderSource = reactServerErrorsByDigest.has(err.digest)
      ? 'react-server-components'
      : 'server-rendering'
    return renderOpts.onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, renderSource)
    )
  }
  const allCapturedErrors: Array<unknown> = []
  const htmlRendererErrorHandler = createHTMLErrorHandler(
    !!renderOpts.dev,
    !!renderOpts.nextExport,
    reactServerErrorsByDigest,
    allCapturedErrors,
    silenceLogger,
    onServerRenderError
  )

  let primaryRenderReactServerStream: null | ReadableStream<Uint8Array> = null

  const setHeader = res.setHeader.bind(res)

  try {
    // This is a dynamic render. We don't do dynamic tracking because we're not prerendering
    const RSCPayload = await getRSCPayload(tree, ctx, asNotFound)
    const reactServerStream = ComponentMod.renderToReadableStream(
      RSCPayload,
      clientReferenceManifest.clientModules,
      {
        onError: serverComponentsErrorHandler,
        nonce: ctx.nonce,
      }
    )
    primaryRenderReactServerStream = reactServerStream

    // If provided, the postpone state should be parsed as JSON so it can be
    // provided to React.
    if (typeof renderOpts.postponed === 'string') {
      let postponedState: PostponedState | null = null

      // We are resuming a partial prerender
      try {
        postponedState = JSON.parse(renderOpts.postponed)
      } catch {
        // If we failed to parse the postponed state, we should default to
        // performing a dynamic data render.
        postponedState = DYNAMIC_DATA
      }
      if (postponedState === DYNAMIC_DATA) {
        // We have a complete HTML Document in the prerender but we need to
        // still include the new server component render because it was not included
        // in the static prelude.
        const inlinedReactServerDataStream = createInlinedDataReadableStream(
          reactServerStream,
          ctx.nonce,
          formState
        )

        return chainStreams(
          inlinedReactServerDataStream,
          createDocumentClosingStream()
        )
      } else if (postponedState) {
        // We assume we have dynamic HTML requiring a resume render to complete
        const postponed = getPostponedFromState(postponedState)

        const [reactServerRenderStream, reactServerDataStream] =
          reactServerStream.tee()
        primaryRenderReactServerStream = reactServerDataStream

        const resume = require('react-dom/server.edge')
          .resume as (typeof import('react-dom/server.edge'))['resume']

        const htmlStream = await resume(
          <App
            reactServerStream={reactServerRenderStream}
            preinitScripts={preinitScripts}
            clientReferenceManifest={clientReferenceManifest}
            ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
            nonce={ctx.nonce}
          />,
          postponed,
          {
            onError: htmlRendererErrorHandler,
            nonce: ctx.nonce,
          }
        )

        const getServerInsertedHTML = makeGetServerInsertedHTML({
          polyfills,
          renderServerInsertedHTML,
          serverCapturedErrors: allCapturedErrors,
          basePath: renderOpts.basePath,
          tracingMetadata: tracingMetadata,
        })
        return await continueDynamicHTMLResume(htmlStream, {
          inlinedDataStream: createInlinedDataReadableStream(
            reactServerDataStream,
            ctx.nonce,
            formState
          ),
          getServerInsertedHTML,
        })
      }
    }

    // This is a regular dynamic render
    const [
      // stream for rendering SSR
      reactServerRenderStream,
      // stream for inlining data and persisting static RSC response
      reactServerDataStream,
    ] = reactServerStream.tee()
    // If we error we'll use this stream to render the error page
    primaryRenderReactServerStream = reactServerDataStream

    const renderToReadableStream = require('react-dom/server.edge')
      .renderToReadableStream as (typeof import('react-dom/server.edge'))['renderToReadableStream']

    const htmlStream = await renderToReadableStream(
      <App
        reactServerStream={reactServerRenderStream}
        preinitScripts={preinitScripts}
        clientReferenceManifest={clientReferenceManifest}
        ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
        nonce={ctx.nonce}
      />,
      {
        onError: htmlRendererErrorHandler,
        nonce: ctx.nonce,
        onHeaders: (headers: Headers) => {
          headers.forEach((value, key) => {
            setHeader(key, value)
          })
        },
        maxHeadersLength: renderOpts.reactMaxHeadersLength,
        // When debugging the static shell, client-side rendering should be
        // disabled to prevent blanking out the page.
        bootstrapScripts: renderOpts.isDebugStaticShell
          ? []
          : [bootstrapScript],
        formState,
      }
    )

    const getServerInsertedHTML = makeGetServerInsertedHTML({
      polyfills,
      renderServerInsertedHTML,
      serverCapturedErrors: allCapturedErrors,
      basePath: renderOpts.basePath,
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
     *        ensure they aren't e.g. requesting dynamic HTML for an AMP page.
     *
     * These rules help ensure that other existing features like request caching,
     * coalescing, and ISR continue working as intended.
     */
    const generateStaticHTML = renderOpts.supportsDynamicResponse !== true
    const validateRootLayout = renderOpts.dev
    return await continueFizzStream(htmlStream, {
      inlinedDataStream: createInlinedDataReadableStream(
        reactServerDataStream,
        ctx.nonce,
        formState
      ),
      isStaticGeneration: generateStaticHTML,
      getServerInsertedHTML,
      serverInsertedHTMLToHead: true,
      validateRootLayout,
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
        `${err.reason} should be wrapped in a suspense boundary at page "${ctx.pagePath}". Read more: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout\n${stack}`
      )

      throw err
    }

    if (isNotFoundError(err)) {
      res.statusCode = 404
    }
    let hasRedirectError = false
    if (isRedirectError(err)) {
      hasRedirectError = true
      res.statusCode = getRedirectStatusCodeFromError(err)
      if (err.mutableCookies) {
        const headers = new Headers()

        // If there were mutable cookies set, we need to set them on the
        // response.
        if (appendMutableCookies(headers, err.mutableCookies)) {
          setHeader('set-cookie', Array.from(headers.values()))
        }
      }
      const redirectUrl = addPathPrefix(
        getURLFromRedirectError(err),
        renderOpts.basePath
      )
      setHeader('Location', redirectUrl)
    }

    const is404 = res.statusCode === 404
    if (!is404 && !hasRedirectError && !shouldBailoutToCSR) {
      res.statusCode = 500
    }

    const errorType = is404
      ? 'not-found'
      : hasRedirectError
        ? 'redirect'
        : undefined

    const [errorPreinitScripts, errorBootstrapScript] = getRequiredScripts(
      renderOpts.buildManifest,
      ctx.assetPrefix,
      renderOpts.crossOrigin,
      renderOpts.subresourceIntegrityManifest,
      getAssetQueryString(ctx, false),
      ctx.nonce,
      '/_not-found/page'
    )

    const errorRSCPayload = await getErrorRSCPayload(tree, ctx, errorType)

    const errorServerStream = ComponentMod.renderToReadableStream(
      errorRSCPayload,
      clientReferenceManifest.clientModules,
      {
        onError: serverComponentsErrorHandler,
        nonce: ctx.nonce,
      }
    )

    if (primaryRenderReactServerStream === null) {
      // We errored when we did not have an RSC stream to read from. This is not just a render
      // error, we need to throw early
      throw err
    }

    try {
      const fizzStream = await renderToInitialFizzStream({
        ReactDOMServer: require('react-dom/server.edge'),
        element: (
          <AppWithoutContext
            reactServerStream={errorServerStream}
            preinitScripts={errorPreinitScripts}
            clientReferenceManifest={clientReferenceManifest}
            nonce={ctx.nonce}
          />
        ),
        streamOptions: {
          nonce: ctx.nonce,
          // Include hydration scripts in the HTML
          bootstrapScripts: [errorBootstrapScript],
          formState,
        },
      })

      /**
       * Rules of Static & Dynamic HTML:
       *
       *    1.) We must generate static HTML unless the caller explicitly opts
       *        in to dynamic HTML support.
       *
       *    2.) If dynamic HTML support is requested, we must honor that request
       *        or throw an error. It is the sole responsibility of the caller to
       *        ensure they aren't e.g. requesting dynamic HTML for an AMP page.
       *
       * These rules help ensure that other existing features like request caching,
       * coalescing, and ISR continue working as intended.
       */
      const generateStaticHTML = renderOpts.supportsDynamicResponse !== true
      const validateRootLayout = renderOpts.dev
      return await continueFizzStream(fizzStream, {
        inlinedDataStream: createInlinedDataReadableStream(
          // This is intentionally using the readable datastream from the
          // main render rather than the flight data from the error page
          // render
          primaryRenderReactServerStream,
          ctx.nonce,
          formState
        ),
        isStaticGeneration: generateStaticHTML,
        getServerInsertedHTML: makeGetServerInsertedHTML({
          polyfills,
          renderServerInsertedHTML,
          serverCapturedErrors: [],
          basePath: renderOpts.basePath,
          tracingMetadata: tracingMetadata,
        }),
        serverInsertedHTMLToHead: true,
        validateRootLayout,
      })
    } catch (finalErr: any) {
      if (process.env.NODE_ENV === 'development' && isNotFoundError(finalErr)) {
        const bailOnNotFound: typeof import('../../client/components/dev-root-not-found-boundary').bailOnNotFound =
          require('../../client/components/dev-root-not-found-boundary').bailOnNotFound
        bailOnNotFound()
      }
      throw finalErr
    }
  }
}

type PrenderToStringResult = {
  stream: ReadableStream<Uint8Array>
  digestErrorsMap: Map<string, DigestedError>
  dynamicTracking?: null | DynamicTrackingState
  err?: unknown
}

async function prerenderToStream(
  req: BaseNextRequest,
  res: BaseNextResponse,
  ctx: AppRenderContext,
  metadata: AppPageRenderResultMetadata,
  staticGenerationStore: StaticGenerationStore,

  asNotFound: boolean,
  tree: LoaderTree
): Promise<PrenderToStringResult> {
  // When prerendering formState is always null. We still include it
  // because some shared APIs expect a formState value and this is slightly
  // more explicit than making it an optional function argument
  const formState = null

  const renderOpts = ctx.renderOpts
  const ComponentMod = renderOpts.ComponentMod
  // TODO: fix this typescript
  const clientReferenceManifest = renderOpts.clientReferenceManifest!

  const { ServerInsertedHTMLProvider, renderServerInsertedHTML } =
    createServerInsertedHTML()

  const tracingMetadata = getTracedMetadata(
    getTracer().getTracePropagationData(),
    renderOpts.experimental.clientTraceMetadata
  )

  const polyfills: JSX.IntrinsicElements['script'][] =
    renderOpts.buildManifest.polyfillFiles
      .filter(
        (polyfill) =>
          polyfill.endsWith('.js') && !polyfill.endsWith('.module.js')
      )
      .map((polyfill) => ({
        src: `${ctx.assetPrefix}/_next/${polyfill}${getAssetQueryString(
          ctx,
          false
        )}`,
        integrity: renderOpts.subresourceIntegrityManifest?.[polyfill],
        crossOrigin: renderOpts.crossOrigin,
        noModule: true,
        nonce: ctx.nonce,
      }))

  const [preinitScripts, bootstrapScript] = getRequiredScripts(
    renderOpts.buildManifest,
    // Why is assetPrefix optional on renderOpts?
    // @TODO make it default empty string on renderOpts and get rid of it from ctx
    ctx.assetPrefix,
    renderOpts.crossOrigin,
    renderOpts.subresourceIntegrityManifest,
    getAssetQueryString(ctx, true),
    ctx.nonce,
    renderOpts.page
  )

  const reactServerErrorsByDigest: Map<string, DigestedError> = new Map()
  // We don't report errors during prerendering through our instrumentation hooks
  const silenceLogger = !!renderOpts.experimental.isRoutePPREnabled
  const serverComponentsErrorHandler = createHTMLReactServerErrorHandler(
    !!renderOpts.dev,
    !!renderOpts.nextExport,
    reactServerErrorsByDigest,
    silenceLogger,
    // RSC rendering error will report as SSR error
    // @TODO we should report RSC errors where they happen for instrumentation purposes
    // and should omit the error reporter in the SSR layer instead
    undefined
  )
  function onServerRenderError(err: DigestedError) {
    const renderSource = reactServerErrorsByDigest.has(err.digest)
      ? 'react-server-components'
      : 'server-rendering'
    return renderOpts.onInstrumentationRequestError?.(
      err,
      req,
      createErrorContext(ctx, renderSource)
    )
  }
  const allCapturedErrors: Array<unknown> = []
  const htmlRendererErrorHandler = createHTMLErrorHandler(
    !!renderOpts.dev,
    !!renderOpts.nextExport,
    reactServerErrorsByDigest,
    allCapturedErrors,
    silenceLogger,
    onServerRenderError
  )

  let dynamicTracking: null | DynamicTrackingState = null
  let primaryRenderReactServerStream: null | ReadableStream<Uint8Array> = null
  const setHeader = (name: string, value: string | string[]) => {
    res.setHeader(name, value)

    metadata.headers ??= {}
    metadata.headers[name] = res.getHeader(name)

    return res
  }

  try {
    if (renderOpts.experimental.isRoutePPREnabled) {
      // We're statically generating with PPR and need to do dynamic tracking
      dynamicTracking = createDynamicTrackingState(
        renderOpts.isDebugDynamicAccesses
      )
      const reactServerPrerenderStore = {
        dynamicTracking,
      }
      const RSCPayload = await getRSCPayload(tree, ctx, asNotFound)
      const reactServerStream: ReadableStream<Uint8Array> =
        prerenderAsyncStorage.run(
          reactServerPrerenderStore,
          ComponentMod.renderToReadableStream,
          // ... the arguments for the function to run
          RSCPayload,
          clientReferenceManifest.clientModules,
          {
            onError: serverComponentsErrorHandler,
            nonce: ctx.nonce,
          }
        )

      const [
        // stream for rendering SSR
        reactServerRenderStream,
        // stream for inlining data and persisting static RSC response
        reactServerDataStream,
      ] = reactServerStream.tee()
      // If we error we'll use this stream to render the error page
      primaryRenderReactServerStream = reactServerDataStream

      const ssrPrerenderStore = {
        dynamicTracking,
      }

      const prerender = require('react-dom/static.edge')
        .prerender as (typeof import('react-dom/static.edge'))['prerender']
      const { prelude, postponed } = await prerenderAsyncStorage.run(
        ssrPrerenderStore,
        prerender,
        <App
          reactServerStream={reactServerRenderStream}
          preinitScripts={preinitScripts}
          clientReferenceManifest={clientReferenceManifest}
          ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
          nonce={ctx.nonce}
        />,
        {
          onError: htmlRendererErrorHandler,
          onHeaders: (headers: Headers) => {
            headers.forEach((value, key) => {
              setHeader(key, value)
            })
          },
          maxHeadersLength: renderOpts.reactMaxHeadersLength,
          // When debugging the static shell, client-side rendering should be
          // disabled to prevent blanking out the page.
          bootstrapScripts: renderOpts.isDebugStaticShell
            ? []
            : [bootstrapScript],
        }
      )
      const getServerInsertedHTML = makeGetServerInsertedHTML({
        polyfills,
        renderServerInsertedHTML,
        serverCapturedErrors: allCapturedErrors,
        basePath: renderOpts.basePath,
        tracingMetadata: tracingMetadata,
      })

      const [persistedReactServerDataStream, inlinedReactServerDataStream] =
        reactServerDataStream.tee()

      // After awaiting here we've waited for the entire RSC render to complete. Crucially this means
      // that when we detect whether we've used dynamic APIs below we know we'll have picked up even
      // parts of the React Server render that might not be used in the SSR render.
      metadata.flightData = await streamToBuffer(persistedReactServerDataStream)

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
      if (usedDynamicAPIs(dynamicTracking)) {
        if (postponed != null) {
          // Dynamic HTML case.
          metadata.postponed = JSON.stringify(
            getDynamicHTMLPostponedState(postponed)
          )
        } else {
          // Dynamic Data case.
          metadata.postponed = JSON.stringify(getDynamicDataPostponedState())
        }
        // Regardless of whether this is the Dynamic HTML or Dynamic Data case we need to ensure we include
        // server inserted html in the static response because the html that is part of the prerender may depend on it
        // It is possible in the set of stream transforms for Dynamic HTML vs Dynamic Data may differ but currently both states
        // require the same set so we unify the code path here
        return {
          digestErrorsMap: reactServerErrorsByDigest,
          stream: await continueDynamicPrerender(prelude, {
            getServerInsertedHTML,
          }),
          dynamicTracking,
        }
      } else {
        // Static case
        // We still have not used any dynamic APIs. At this point we can produce an entirely static prerender response
        if (staticGenerationStore.forceDynamic) {
          throw new StaticGenBailoutError(
            'Invariant: a Page with `dynamic = "force-dynamic"` did not trigger the dynamic pathway. This is a bug in Next.js'
          )
        }

        let htmlStream = prelude
        if (postponed != null) {
          // We postponed but nothing dynamic was used. We resume the render now and immediately abort it
          // so we can set all the postponed boundaries to client render mode before we store the HTML response
          const resume = require('react-dom/server.edge')
            .resume as (typeof import('react-dom/server.edge'))['resume']

          // We don't actually want to render anything so we just pass a stream
          // that never resolves. The resume call is going to abort immediately anyway
          const foreverStream = new ReadableStream<Uint8Array>()

          const resumeStream = await resume(
            <App
              reactServerStream={foreverStream}
              preinitScripts={() => {}}
              clientReferenceManifest={clientReferenceManifest}
              ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
              nonce={ctx.nonce}
            />,
            JSON.parse(JSON.stringify(postponed)),
            {
              signal: createPostponedAbortSignal('static prerender resume'),
              onError: htmlRendererErrorHandler,
              nonce: ctx.nonce,
            }
          )

          // First we write everything from the prerender, then we write everything from the aborted resume render
          htmlStream = chainStreams(prelude, resumeStream)
        }

        return {
          digestErrorsMap: reactServerErrorsByDigest,
          stream: await continueStaticPrerender(htmlStream, {
            inlinedDataStream: createInlinedDataReadableStream(
              inlinedReactServerDataStream,
              ctx.nonce,
              formState
            ),
            getServerInsertedHTML,
          }),
          dynamicTracking,
        }
      }
    } else {
      // This is a regular static generation. We don't do dynamic tracking because we rely on
      // the old-school dynamic error handling to bail out of static generation
      const RSCPayload = await getRSCPayload(tree, ctx, asNotFound)
      const reactServerStream = ComponentMod.renderToReadableStream(
        RSCPayload,
        clientReferenceManifest.clientModules,
        {
          onError: serverComponentsErrorHandler,
          nonce: ctx.nonce,
        }
      )

      const [
        // stream for rendering SSR
        reactServerRenderStream,
        // stream for inlining data and persisting static RSC response
        reactServerDataStream,
      ] = reactServerStream.tee()
      // If we error we'll use this stream to render the error page
      primaryRenderReactServerStream = reactServerDataStream

      const renderToReadableStream = require('react-dom/server.edge')
        .renderToReadableStream as (typeof import('react-dom/server.edge'))['renderToReadableStream']

      const htmlStream = await renderToReadableStream(
        <App
          reactServerStream={reactServerRenderStream}
          preinitScripts={preinitScripts}
          clientReferenceManifest={clientReferenceManifest}
          ServerInsertedHTMLProvider={ServerInsertedHTMLProvider}
          nonce={ctx.nonce}
        />,
        {
          onError: htmlRendererErrorHandler,
          nonce: ctx.nonce,
          // When debugging the static shell, client-side rendering should be
          // disabled to prevent blanking out the page.
          bootstrapScripts: renderOpts.isDebugStaticShell
            ? []
            : [bootstrapScript],
        }
      )

      const [persistedReactServerDataStream, inlinedReactServerDataStream] =
        reactServerDataStream.tee()

      metadata.flightData = await streamToBuffer(persistedReactServerDataStream)

      const getServerInsertedHTML = makeGetServerInsertedHTML({
        polyfills,
        renderServerInsertedHTML,
        serverCapturedErrors: allCapturedErrors,
        basePath: renderOpts.basePath,
        tracingMetadata: tracingMetadata,
      })
      return {
        digestErrorsMap: reactServerErrorsByDigest,
        stream: await continueFizzStream(htmlStream, {
          inlinedDataStream: createInlinedDataReadableStream(
            inlinedReactServerDataStream,
            ctx.nonce,
            formState
          ),
          isStaticGeneration: true,
          getServerInsertedHTML,
          serverInsertedHTMLToHead: true,
        }),
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
        `${err.reason} should be wrapped in a suspense boundary at page "${ctx.pagePath}". Read more: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout\n${stack}`
      )

      throw err
    }

    if (isNotFoundError(err)) {
      res.statusCode = 404
    }
    let hasRedirectError = false
    if (isRedirectError(err)) {
      hasRedirectError = true
      res.statusCode = getRedirectStatusCodeFromError(err)
      if (err.mutableCookies) {
        const headers = new Headers()

        // If there were mutable cookies set, we need to set them on the
        // response.
        if (appendMutableCookies(headers, err.mutableCookies)) {
          setHeader('set-cookie', Array.from(headers.values()))
        }
      }
      const redirectUrl = addPathPrefix(
        getURLFromRedirectError(err),
        renderOpts.basePath
      )
      setHeader('Location', redirectUrl)
    }

    const is404 = res.statusCode === 404
    if (!is404 && !hasRedirectError && !shouldBailoutToCSR) {
      res.statusCode = 500
    }

    const errorType = is404
      ? 'not-found'
      : hasRedirectError
        ? 'redirect'
        : undefined

    const [errorPreinitScripts, errorBootstrapScript] = getRequiredScripts(
      renderOpts.buildManifest,
      ctx.assetPrefix,
      renderOpts.crossOrigin,
      renderOpts.subresourceIntegrityManifest,
      getAssetQueryString(ctx, false),
      ctx.nonce,
      '/_not-found/page'
    )

    const errorRSCPayload = await getErrorRSCPayload(tree, ctx, errorType)

    const errorServerStream = ComponentMod.renderToReadableStream(
      errorRSCPayload,
      clientReferenceManifest.clientModules,
      {
        onError: serverComponentsErrorHandler,
        nonce: ctx.nonce,
      }
    )

    if (primaryRenderReactServerStream === null) {
      // We errored when we did not have an RSC stream to read from. This is not just a render
      // error, we need to throw early
      throw err
    }

    try {
      const fizzStream = await renderToInitialFizzStream({
        ReactDOMServer: require('react-dom/server.edge'),
        element: (
          <AppWithoutContext
            reactServerStream={errorServerStream}
            preinitScripts={errorPreinitScripts}
            clientReferenceManifest={clientReferenceManifest}
            nonce={ctx.nonce}
          />
        ),
        streamOptions: {
          nonce: ctx.nonce,
          // Include hydration scripts in the HTML
          bootstrapScripts: [errorBootstrapScript],
          formState,
        },
      })

      const [persistedReactServerDataStream, inlinedReactServerDataStream] =
        primaryRenderReactServerStream.tee()
      const flightRenderResult = new FlightRenderResult(
        persistedReactServerDataStream
      )
      metadata.flightData = await flightRenderResult.toUnchunkedBuffer(true)

      const validateRootLayout = renderOpts.dev
      return {
        // Returning the error that was thrown so it can be used to handle
        // the response in the caller.
        err,
        digestErrorsMap: reactServerErrorsByDigest,
        stream: await continueFizzStream(fizzStream, {
          inlinedDataStream: createInlinedDataReadableStream(
            // This is intentionally using the readable datastream from the
            // main render rather than the flight data from the error page
            // render
            inlinedReactServerDataStream,
            ctx.nonce,
            formState
          ),
          isStaticGeneration: true,
          getServerInsertedHTML: makeGetServerInsertedHTML({
            polyfills,
            renderServerInsertedHTML,
            serverCapturedErrors: [],
            basePath: renderOpts.basePath,
            tracingMetadata: tracingMetadata,
          }),
          serverInsertedHTMLToHead: true,
          validateRootLayout,
        }),
        dynamicTracking,
      }
    } catch (finalErr: any) {
      if (process.env.NODE_ENV === 'development' && isNotFoundError(finalErr)) {
        const bailOnNotFound: typeof import('../../client/components/dev-root-not-found-boundary').bailOnNotFound =
          require('../../client/components/dev-root-not-found-boundary').bailOnNotFound
        bailOnNotFound()
      }
      throw finalErr
    }
  }
}
