import type { IncomingMessage, ServerResponse } from 'http'
import type {
  ActionResult,
  DynamicParamTypesShort,
  FlightData,
  FlightRouterState,
  FlightSegmentPath,
  RenderOpts,
  Segment,
  CacheNodeSeedData,
} from './types'
import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import type { RequestStore } from '../../client/components/request-async-storage.external'
import type { NextParsedUrlQuery } from '../request-meta'
import type { LoaderTree } from '../lib/app-dir-module'
import type { AppPageModule } from '../future/route-modules/app-page/module'
import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'
import type { Revalidate } from '../lib/revalidate'

import React from 'react'

import RenderResult, {
  type AppPageRenderResultMetadata,
  type RenderResultOptions,
  type RenderResultResponse,
} from '../render-result'
import {
  chainStreams,
  renderToInitialFizzStream,
  continueFizzStream,
  continueDynamicPrerender,
  continueStaticPrerender,
  continueDynamicHTMLResume,
  continueDynamicDataResume,
} from '../stream-utils/node-web-streams-helper'
import { canSegmentBeOverridden } from '../../client/components/match-segments'
import { stripInternalQueries } from '../internal-utils'
import {
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_STATE_TREE,
  NEXT_URL,
  RSC_HEADER,
} from '../../client/components/app-router-headers'
import { createMetadataComponents } from '../../lib/metadata/metadata'
import { RequestAsyncStorageWrapper } from '../async-storage/request-async-storage-wrapper'
import { StaticGenerationAsyncStorageWrapper } from '../async-storage/static-generation-async-storage-wrapper'
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
  createErrorHandler,
  ErrorHandlerSource,
  type ErrorHandler,
} from './create-error-handler'
import {
  getShortDynamicParamType,
  dynamicParamTypes,
} from './get-short-dynamic-param-type'
import { getSegmentParam } from './get-segment-param'
import { getScriptNonceFromHeader } from './get-script-nonce-from-header'
import { parseAndValidateFlightRouterState } from './parse-and-validate-flight-router-state'
import { validateURL } from './validate-url'
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
import { createComponentTree } from './create-component-tree'
import { getAssetQueryString } from './get-asset-query-string'
import { setReferenceManifestsSingleton } from './action-encryption-utils'
import {
  createStaticRenderer,
  getDynamicDataPostponedState,
  getDynamicHTMLPostponedState,
} from './static/static-renderer'
import { isDynamicServerError } from '../../client/components/hooks-server-context'
import {
  useFlightStream,
  createInlinedDataReadableStream,
  flightRenderComplete,
} from './use-flight-response'
import {
  StaticGenBailoutError,
  isStaticGenBailoutError,
} from '../../client/components/static-generation-bailout'
import { isInterceptionRouteAppPath } from '../future/helpers/interception-routes'
import { getStackWithoutErrorMessage } from '../../lib/format-server-error'
import {
  usedDynamicAPIs,
  createPostponedAbortSignal,
} from './dynamic-rendering'
import {
  getClientComponentLoaderMetrics,
  wrapClientComponentLoader,
} from '../client-component-renderer-logger'
import { createServerModuleMap } from './action-utils'

export type GetDynamicParamFromSegment = (
  // [slug] / [[slug]] / [...slug]
  segment: string
) => {
  param: string
  value: string | string[] | null
  treeSegment: Segment
  type: DynamicParamTypesShort
} | null

type AppRenderBaseContext = {
  staticGenerationStore: StaticGenerationStore
  requestStore: RequestStore
  componentMod: AppPageModule
  renderOpts: RenderOpts
}

export type GenerateFlight = typeof generateFlight

export type AppRenderContext = AppRenderBaseContext & {
  getDynamicParamFromSegment: GetDynamicParamFromSegment
  query: NextParsedUrlQuery
  isPrefetch: boolean
  requestTimestamp: number
  appUsingSizeAdjustment: boolean
  providedFlightRouterState?: FlightRouterState
  requestId: string
  defaultRevalidate: Revalidate
  pagePath: string
  clientReferenceManifest: ClientReferenceManifest
  assetPrefix: string
  flightDataRendererErrorHandler: ErrorHandler
  serverComponentsErrorHandler: ErrorHandler
  isNotFoundPath: boolean
  res: ServerResponse
}

function createNotFoundLoaderTree(loaderTree: LoaderTree): LoaderTree {
  // Align the segment with parallel-route-default in next-app-loader
  return ['', {}, loaderTree[2]]
}

/* This method is important for intercepted routes to function:
 * when a route is intercepted, e.g. /blog/[slug], it will be rendered
 * with the layout of the previous page, e.g. /profile/[id]. The problem is
 * that the loader tree needs to know the dynamic param in order to render (id and slug in the example).
 * Normally they are read from the path but since we are intercepting the route, the path would not contain id,
 * so we need to read it from the router state.
 */
function findDynamicParamFromRouterState(
  providedFlightRouterState: FlightRouterState | undefined,
  segment: string
): {
  param: string
  value: string | string[] | null
  treeSegment: Segment
  type: DynamicParamTypesShort
} | null {
  if (!providedFlightRouterState) {
    return null
  }

  const treeSegment = providedFlightRouterState[0]

  if (canSegmentBeOverridden(segment, treeSegment)) {
    if (!Array.isArray(treeSegment) || Array.isArray(segment)) {
      return null
    }

    return {
      param: treeSegment[0],
      value: treeSegment[1],
      treeSegment: treeSegment,
      type: treeSegment[2],
    }
  }

  for (const parallelRouterState of Object.values(
    providedFlightRouterState[1]
  )) {
    const maybeDynamicParam = findDynamicParamFromRouterState(
      parallelRouterState,
      segment
    )
    if (maybeDynamicParam) {
      return maybeDynamicParam
    }
  }

  return null
}

export type CreateSegmentPath = (child: FlightSegmentPath) => FlightSegmentPath

/**
 * Returns a function that parses the dynamic segment and return the associated value.
 */
function makeGetDynamicParamFromSegment(
  params: { [key: string]: any },
  providedFlightRouterState: FlightRouterState | undefined
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

    // this is a special marker that will be present for interception routes
    if (value === '__NEXT_EMPTY_PARAM__') {
      value = undefined
    }

    if (Array.isArray(value)) {
      value = value.map((i) => encodeURIComponent(i))
    } else if (typeof value === 'string') {
      value = encodeURIComponent(value)
    }

    if (!value) {
      // Handle case where optional catchall does not have a value, e.g. `/dashboard/[...slug]` when requesting `/dashboard`
      if (segmentParam.type === 'optional-catchall') {
        const type = dynamicParamTypes[segmentParam.type]
        return {
          param: key,
          value: null,
          type: type,
          // This value always has to be a string.
          treeSegment: [key, '', type],
        }
      }
      return findDynamicParamFromRouterState(providedFlightRouterState, segment)
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

// Handle Flight render request. This is only used when client-side navigating. E.g. when you `router.push('/dashboard')` or `router.reload()`.
async function generateFlight(
  ctx: AppRenderContext,
  options?: {
    actionResult: ActionResult
    skipFlight: boolean
    asNotFound?: boolean
  }
): Promise<RenderResult> {
  // Flight data that is going to be passed to the browser.
  // Currently a single item array but in the future multiple patches might be combined in a single request.
  let flightData: FlightData | null = null

  const {
    componentMod: {
      tree: loaderTree,
      renderToReadableStream,
      createDynamicallyTrackedSearchParams,
    },
    getDynamicParamFromSegment,
    appUsingSizeAdjustment,
    staticGenerationStore: { urlPathname },
    query,
    requestId,
    providedFlightRouterState,
  } = ctx

  if (!options?.skipFlight) {
    const [MetadataTree, MetadataOutlet] = createMetadataComponents({
      tree: loaderTree,
      pathname: urlPathname,
      trailingSlash: ctx.renderOpts.trailingSlash,
      query,
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
        flightRouterState: providedFlightRouterState,
        isFirst: true,
        // For flight, render metadata inside leaf page
        rscPayloadHead: (
          // Adding requestId as react key to make metadata remount for each render
          <MetadataTree key={requestId} />
        ),
        injectedCSS: new Set(),
        injectedJS: new Set(),
        injectedFontPreloadTags: new Set(),
        rootLayoutIncluded: false,
        asNotFound: ctx.isNotFoundPath || options?.asNotFound,
        metadataOutlet: <MetadataOutlet />,
      })
    ).map((path) => path.slice(1)) // remove the '' (root) segment
  }

  const buildIdFlightDataPair = [ctx.renderOpts.buildId, flightData]

  // For app dir, use the bundled version of Flight server renderer (renderToReadableStream)
  // which contains the subset React.
  const flightReadableStream = renderToReadableStream(
    options
      ? [options.actionResult, buildIdFlightDataPair]
      : buildIdFlightDataPair,
    ctx.clientReferenceManifest.clientModules,
    {
      onError: ctx.flightDataRendererErrorHandler,
    }
  )

  return new FlightRenderResult(flightReadableStream)
}

type RenderToStreamResult = {
  stream: RenderResultResponse
  err?: unknown
}

type RenderToStreamOptions = {
  /**
   * This option is used to indicate that the page should be rendered as
   * if it was not found. When it's enabled, instead of rendering the
   * page component, it renders the not-found segment.
   *
   */
  asNotFound: boolean
  tree: LoaderTree
  formState: any
}

/**
 * Creates a resolver that eagerly generates a flight payload that is then
 * resolved when the resolver is called.
 */
function createFlightDataResolver(ctx: AppRenderContext) {
  // Generate the flight data and as soon as it can, convert it into a string.
  const promise = generateFlight(ctx)
    .then(async (result) => ({
      flightData: await result.toUnchunkedString(true),
    }))
    // Otherwise if it errored, return the error.
    .catch((err) => ({ err }))

  return async () => {
    // Resolve the promise to get the flight data or error.
    const result = await promise

    // If the flight data failed to render due to an error, re-throw the error
    // here.
    if ('err' in result) {
      throw result.err
    }

    // Otherwise, return the flight data.
    return result.flightData
  }
}

type ReactServerAppProps = {
  tree: LoaderTree
  ctx: AppRenderContext
  asNotFound: boolean
}
// This is the root component that runs in the RSC context
async function ReactServerApp({ tree, ctx, asNotFound }: ReactServerAppProps) {
  // Create full component tree from root to leaf.
  const injectedCSS = new Set<string>()
  const injectedJS = new Set<string>()
  const injectedFontPreloadTags = new Set<string>()
  const missingSlots = new Set<string>()
  const {
    getDynamicParamFromSegment,
    query,
    appUsingSizeAdjustment,
    componentMod: {
      AppRouter,
      GlobalError,
      createDynamicallyTrackedSearchParams,
    },
    staticGenerationStore: { urlPathname },
  } = ctx
  const initialTree = createFlightRouterStateFromLoaderTree(
    tree,
    getDynamicParamFromSegment,
    query
  )

  const [MetadataTree, MetadataOutlet] = createMetadataComponents({
    tree,
    errorType: asNotFound ? 'not-found' : undefined,
    pathname: urlPathname,
    trailingSlash: ctx.renderOpts.trailingSlash,
    query,
    getDynamicParamFromSegment: getDynamicParamFromSegment,
    appUsingSizeAdjustment: appUsingSizeAdjustment,
    createDynamicallyTrackedSearchParams,
  })

  const { seedData, styles } = await createComponentTree({
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
    metadataOutlet: <MetadataOutlet />,
    missingSlots,
  })

  // When the `vary` response header is present with `Next-URL`, that means there's a chance
  // it could respond differently if there's an interception route. We provide this information
  // to `AppRouter` so that it can properly seed the prefetch cache with a prefix, if needed.
  const varyHeader = ctx.res.getHeader('vary')
  const couldBeIntercepted =
    typeof varyHeader === 'string' && varyHeader.includes(NEXT_URL)

  return (
    <>
      {styles}
      <AppRouter
        buildId={ctx.renderOpts.buildId}
        assetPrefix={ctx.assetPrefix}
        initialCanonicalUrl={urlPathname}
        // This is the router state tree.
        initialTree={initialTree}
        // This is the tree of React nodes that are seeded into the cache
        initialSeedData={seedData}
        couldBeIntercepted={couldBeIntercepted}
        initialHead={
          <>
            {ctx.res.statusCode > 400 && (
              <meta name="robots" content="noindex" />
            )}
            {/* Adding requestId as react key to make metadata remount for each render */}
            <MetadataTree key={ctx.requestId} />
          </>
        }
        globalErrorComponent={GlobalError}
        // This is used to provide debug information (when in development mode)
        // about which slots were not filled by page components while creating the component tree.
        missingSlots={missingSlots}
      />
    </>
  )
}

type ReactServerErrorProps = {
  tree: LoaderTree
  ctx: AppRenderContext
  errorType: 'not-found' | 'redirect' | undefined
}
// This is the root component that runs in the RSC context
async function ReactServerError({
  tree,
  ctx,
  errorType,
}: ReactServerErrorProps) {
  const {
    getDynamicParamFromSegment,
    query,
    appUsingSizeAdjustment,
    componentMod: {
      AppRouter,
      GlobalError,
      createDynamicallyTrackedSearchParams,
    },
    staticGenerationStore: { urlPathname },
    requestId,
    res,
  } = ctx

  const [MetadataTree] = createMetadataComponents({
    tree,
    pathname: urlPathname,
    trailingSlash: ctx.renderOpts.trailingSlash,
    errorType,
    query,
    getDynamicParamFromSegment,
    appUsingSizeAdjustment,
    createDynamicallyTrackedSearchParams,
  })

  const head = (
    <>
      {/* Adding requestId as react key to make metadata remount for each render */}
      <MetadataTree key={requestId} />
      {res.statusCode >= 400 && <meta name="robots" content="noindex" />}
      {process.env.NODE_ENV === 'development' && (
        <meta name="next-error" content="not-found" />
      )}
    </>
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
  ]
  return (
    <AppRouter
      buildId={ctx.renderOpts.buildId}
      assetPrefix={ctx.assetPrefix}
      initialCanonicalUrl={urlPathname}
      initialTree={initialTree}
      initialHead={head}
      globalErrorComponent={GlobalError}
      initialSeedData={initialSeedData}
      missingSlots={new Set()}
    />
  )
}

// This component must run in an SSR context. It will render the RSC root component
function ReactServerEntrypoint<T>({
  reactServerStream,
  preinitScripts,
  clientReferenceManifest,
  nonce,
}: {
  reactServerStream: BinaryStreamOf<T>
  preinitScripts: () => void
  clientReferenceManifest: NonNullable<RenderOpts['clientReferenceManifest']>
  nonce?: string
}): T {
  preinitScripts()
  const response = useFlightStream(
    reactServerStream,
    clientReferenceManifest,
    nonce
  )
  return React.use(response)
}

// We use a trick with TS Generics to branch streams with a type so we can
// consume the parsed value of a Readable Stream if it was constructed with a
// certain object shape. The generic type is not used directly in the type so it
// requires a disabling of the eslint rule disallowing unused vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type BinaryStreamOf<T> = ReadableStream<Uint8Array>

async function renderToHTMLOrFlightImpl(
  req: IncomingMessage,
  res: ServerResponse,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  baseCtx: AppRenderBaseContext
) {
  const isNotFoundPath = pagePath === '/404'

  // A unique request timestamp used by development to ensure that it's
  // consistent and won't change during this request. This is important to
  // avoid that resources can be deduped by React Float if the same resource is
  // rendered or preloaded multiple times: `<link href="a.css?v={Date.now()}"/>`.
  const requestTimestamp = Date.now()

  const {
    buildManifest,
    subresourceIntegrityManifest,
    serverActionsManifest,
    ComponentMod,
    dev,
    nextFontManifest,
    supportsDynamicHTML,
    serverActions,
    appDirDevErrorLogger,
    assetPrefix = '',
    enableTainting,
  } = renderOpts

  // We need to expose the bundled `require` API globally for
  // react-server-dom-webpack. This is a hack until we find a better way.
  if (ComponentMod.__next_app__) {
    const instrumented = wrapClientComponentLoader(ComponentMod)
    // @ts-ignore
    globalThis.__next_require__ = instrumented.require
    // @ts-ignore
    globalThis.__next_chunk_load__ = instrumented.loadChunk
  }

  if (typeof req.on === 'function') {
    req.on('end', () => {
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

  const digestErrorsMap: Map<string, Error> = new Map()
  const allCapturedErrors: Error[] = []
  const isNextExport = !!renderOpts.nextExport
  const { staticGenerationStore, requestStore } = baseCtx
  const { isStaticGeneration } = staticGenerationStore
  // when static generation fails during PPR, we log the errors separately. We intentionally
  // silence the error logger in this case to avoid double logging.
  const silenceStaticGenerationErrors =
    renderOpts.experimental.ppr && isStaticGeneration

  const serverComponentsErrorHandler = createErrorHandler({
    source: ErrorHandlerSource.serverComponents,
    dev,
    isNextExport,
    errorLogger: appDirDevErrorLogger,
    digestErrorsMap,
    silenceLogger: silenceStaticGenerationErrors,
  })
  const flightDataRendererErrorHandler = createErrorHandler({
    source: ErrorHandlerSource.flightData,
    dev,
    isNextExport,
    errorLogger: appDirDevErrorLogger,
    digestErrorsMap,
    silenceLogger: silenceStaticGenerationErrors,
  })
  const htmlRendererErrorHandler = createErrorHandler({
    source: ErrorHandlerSource.html,
    dev,
    isNextExport,
    errorLogger: appDirDevErrorLogger,
    digestErrorsMap,
    allCapturedErrors,
    silenceLogger: silenceStaticGenerationErrors,
  })

  ComponentMod.patchFetch()

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
  const generateStaticHTML = supportsDynamicHTML !== true

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

  const isRSCRequest = req.headers[RSC_HEADER.toLowerCase()] !== undefined

  const isPrefetchRSCRequest =
    isRSCRequest &&
    req.headers[NEXT_ROUTER_PREFETCH_HEADER.toLowerCase()] !== undefined

  /**
   * Router state provided from the client-side router. Used to handle rendering
   * from the common layout down. This value will be undefined if the request
   * is not a client-side navigation request or if the request is a prefetch
   * request (except when it's a prefetch request for an interception route
   * which is always dynamic).
   */
  const shouldProvideFlightRouterState =
    isRSCRequest &&
    (!isPrefetchRSCRequest ||
      !renderOpts.experimental.ppr ||
      // Interception routes currently depend on the flight router state to
      // extract dynamic params.
      isInterceptionRouteAppPath(pagePath))

  let providedFlightRouterState = shouldProvideFlightRouterState
    ? parseAndValidateFlightRouterState(
        req.headers[NEXT_ROUTER_STATE_TREE.toLowerCase()]
      )
    : undefined

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
    providedFlightRouterState
  )

  const ctx: AppRenderContext = {
    ...baseCtx,
    getDynamicParamFromSegment,
    query,
    isPrefetch: isPrefetchRSCRequest,
    requestTimestamp,
    appUsingSizeAdjustment,
    providedFlightRouterState,
    requestId,
    defaultRevalidate: false,
    pagePath,
    clientReferenceManifest,
    assetPrefix,
    flightDataRendererErrorHandler,
    serverComponentsErrorHandler,
    isNotFoundPath,
    res,
  }

  if (isRSCRequest && !isStaticGeneration) {
    return generateFlight(ctx)
  }

  // Create the resolver that can get the flight payload when it's ready or
  // throw the error if it occurred. If we are not generating static HTML, we
  // don't need to generate the flight payload because it's a dynamic request
  // which means we're either getting the flight payload only or just the
  // regular HTML.
  const flightDataResolver = isStaticGeneration
    ? createFlightDataResolver(ctx)
    : null

  // Get the nonce from the incoming request if it has one.
  const csp =
    req.headers['content-security-policy'] ||
    req.headers['content-security-policy-report-only']
  let nonce: string | undefined
  if (csp && typeof csp === 'string') {
    nonce = getScriptNonceFromHeader(csp)
  }

  const validateRootLayout = dev
    ? {
        assetPrefix: renderOpts.assetPrefix,
        getTree: () =>
          createFlightRouterStateFromLoaderTree(
            loaderTree,
            getDynamicParamFromSegment,
            query
          ),
      }
    : undefined

  const { HeadManagerContext } =
    require('../../shared/lib/head-manager-context.shared-runtime') as typeof import('../../shared/lib/head-manager-context.shared-runtime')

  // On each render, create a new `ServerInsertedHTML` context to capture
  // injected nodes from user code (`useServerInsertedHTML`).
  const { ServerInsertedHTMLProvider, renderServerInsertedHTML } =
    createServerInsertedHTML()

  getTracer().getRootSpanAttributes()?.set('next.route', pagePath)

  const renderToStream = getTracer().wrap(
    AppRenderSpan.getBodyResult,
    {
      spanName: `render route (app) ${pagePath}`,
      attributes: {
        'next.route': pagePath,
      },
    },
    async ({
      asNotFound,
      tree,
      formState,
    }: RenderToStreamOptions): Promise<RenderToStreamResult> => {
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
            crossOrigin: renderOpts.crossOrigin,
            noModule: true,
            nonce,
          }))

      const [preinitScripts, bootstrapScript] = getRequiredScripts(
        buildManifest,
        assetPrefix,
        renderOpts.crossOrigin,
        subresourceIntegrityManifest,
        getAssetQueryString(ctx, true),
        nonce
      )

      // We kick off the Flight Request (render) here. It is ok to initiate the render in an arbitrary
      // place however it is critical that we only construct the Flight Response inside the SSR
      // render so that directives like preloads are correctly piped through
      const serverStream = ComponentMod.renderToReadableStream(
        <ReactServerApp tree={tree} ctx={ctx} asNotFound={asNotFound} />,
        clientReferenceManifest.clientModules,
        {
          onError: serverComponentsErrorHandler,
        }
      )

      // We are going to consume this render both for SSR and for inlining the flight data
      let [renderStream, dataStream] = serverStream.tee()

      const children = (
        <HeadManagerContext.Provider
          value={{
            appDir: true,
            nonce,
          }}
        >
          <ServerInsertedHTMLProvider>
            <ReactServerEntrypoint
              reactServerStream={renderStream}
              preinitScripts={preinitScripts}
              clientReferenceManifest={clientReferenceManifest}
              nonce={nonce}
            />
          </ServerInsertedHTMLProvider>
        </HeadManagerContext.Provider>
      )

      const isResume = !!renderOpts.postponed

      const onHeaders = staticGenerationStore.prerenderState
        ? // During prerender we write headers to metadata
          (headers: Headers) => {
            headers.forEach((value, key) => {
              metadata.headers ??= {}
              metadata.headers[key] = value
            })
          }
        : isStaticGeneration || isResume
        ? // During static generation and during resumes we don't
          // ask React to emit headers. For Resume this is just not supported
          // For static generation we know there will be an entire HTML document
          // output and so moving from tag to header for preloading can only
          // server to alter preloading priorities in unwanted ways
          undefined
        : // During dynamic renders that are not resumes we write
          // early headers to the response
          (headers: Headers) => {
            headers.forEach((value, key) => {
              res.appendHeader(key, value)
            })
          }

      const getServerInsertedHTML = makeGetServerInsertedHTML({
        polyfills,
        renderServerInsertedHTML,
        serverCapturedErrors: allCapturedErrors,
        basePath: renderOpts.basePath,
      })

      const renderer = createStaticRenderer({
        ppr: renderOpts.experimental.ppr,
        isStaticGeneration,
        // If provided, the postpone state should be parsed as JSON so it can be
        // provided to React.
        postponed:
          typeof renderOpts.postponed === 'string'
            ? JSON.parse(renderOpts.postponed)
            : null,
        streamOptions: {
          onError: htmlRendererErrorHandler,
          onHeaders,
          maxHeadersLength: 600,
          nonce,
          bootstrapScripts: [bootstrapScript],
          formState,
        },
      })

      try {
        let { stream, postponed, resumed } = await renderer.render(children)

        const prerenderState = staticGenerationStore.prerenderState
        if (prerenderState) {
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
          if (usedDynamicAPIs(prerenderState)) {
            if (postponed != null) {
              // This is the Dynamic HTML case.
              metadata.postponed = JSON.stringify(
                getDynamicHTMLPostponedState(postponed)
              )
            } else {
              // This is the Dynamic Data case
              metadata.postponed = JSON.stringify(
                getDynamicDataPostponedState()
              )
            }
            // Regardless of whether this is the Dynamic HTML or Dynamic Data case we need to ensure we include
            // server inserted html in the static response because the html that is part of the prerender may depend on it
            // It is possible in the set of stream transforms for Dynamic HTML vs Dynamic Data may differ but currently both states
            // require the same set so we unify the code path here
            return {
              stream: await continueDynamicPrerender(stream, {
                getServerInsertedHTML,
              }),
            }
          } else {
            // We may still be rendering the RSC stream even though the HTML is finished.
            // We wait for the RSC stream to complete and check again if dynamic was used
            const [original, flightSpy] = dataStream.tee()
            dataStream = original

            await flightRenderComplete(flightSpy)

            if (usedDynamicAPIs(prerenderState)) {
              // This is the same logic above just repeated after ensuring the RSC stream itself has completed
              if (postponed != null) {
                // This is the Dynamic HTML case.
                metadata.postponed = JSON.stringify(
                  getDynamicHTMLPostponedState(postponed)
                )
              } else {
                // This is the Dynamic Data case
                metadata.postponed = JSON.stringify(
                  getDynamicDataPostponedState()
                )
              }
              // Regardless of whether this is the Dynamic HTML or Dynamic Data case we need to ensure we include
              // server inserted html in the static response because the html that is part of the prerender may depend on it
              // It is possible in the set of stream transforms for Dynamic HTML vs Dynamic Data may differ but currently both states
              // require the same set so we unify the code path here
              return {
                stream: await continueDynamicPrerender(stream, {
                  getServerInsertedHTML,
                }),
              }
            } else {
              // This is the Static case
              // We still have not used any dynamic APIs. At this point we can produce an entirely static prerender response
              let renderedHTMLStream = stream

              if (staticGenerationStore.forceDynamic) {
                throw new StaticGenBailoutError(
                  'Invariant: a Page with `dynamic = "force-dynamic"` did not trigger the dynamic pathway. This is a bug in Next.js'
                )
              }

              if (postponed != null) {
                // We postponed but nothing dynamic was used. We resume the render now and immediately abort it
                // so we can set all the postponed boundaries to client render mode before we store the HTML response
                const resumeRenderer = createStaticRenderer({
                  ppr: true,
                  isStaticGeneration: false,
                  postponed: getDynamicHTMLPostponedState(postponed),
                  streamOptions: {
                    signal: createPostponedAbortSignal(
                      'static prerender resume'
                    ),
                    onError: htmlRendererErrorHandler,
                    nonce,
                  },
                })

                // We don't actually want to render anything so we just pass a stream
                // that never resolves. The resume call is going to abort immediately anyway
                const foreverStream = new ReadableStream<Uint8Array>()

                const resumeChildren = (
                  <HeadManagerContext.Provider
                    value={{
                      appDir: true,
                      nonce,
                    }}
                  >
                    <ServerInsertedHTMLProvider>
                      <ReactServerEntrypoint
                        reactServerStream={foreverStream}
                        preinitScripts={() => {}}
                        clientReferenceManifest={clientReferenceManifest}
                        nonce={nonce}
                      />
                    </ServerInsertedHTMLProvider>
                  </HeadManagerContext.Provider>
                )

                const { stream: resumeStream } = await resumeRenderer.render(
                  resumeChildren
                )
                // First we write everything from the prerender, then we write everything from the aborted resume render
                renderedHTMLStream = chainStreams(stream, resumeStream)
              }

              return {
                stream: await continueStaticPrerender(renderedHTMLStream, {
                  inlinedDataStream: createInlinedDataReadableStream(
                    dataStream,
                    nonce,
                    formState
                  ),
                  getServerInsertedHTML,
                }),
              }
            }
          }
        } else if (renderOpts.postponed) {
          // This is a continuation of either an Incomplete or Dynamic Data Prerender.
          const inlinedDataStream = createInlinedDataReadableStream(
            dataStream,
            nonce,
            formState
          )
          if (resumed) {
            // We have new HTML to stream and we also need to include server inserted HTML
            return {
              stream: await continueDynamicHTMLResume(stream, {
                inlinedDataStream,
                getServerInsertedHTML,
              }),
            }
          } else {
            // We are continuing a Dynamic Data Prerender and simply need to append new inlined flight data
            return {
              stream: await continueDynamicDataResume(stream, {
                inlinedDataStream,
              }),
            }
          }
        } else {
          // This may be a static render or a dynamic render
          // @TODO factor this further to make the render types more clearly defined and remove
          // the deluge of optional params that passed to configure the various behaviors
          return {
            stream: await continueFizzStream(stream, {
              inlinedDataStream: createInlinedDataReadableStream(
                dataStream,
                nonce,
                formState
              ),
              isStaticGeneration: isStaticGeneration || generateStaticHTML,
              getServerInsertedHTML,
              serverInsertedHTMLToHead: true,
              validateRootLayout,
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
        if (isStaticGeneration && isDynamicServerError(err)) {
          throw err
        }

        // If a bailout made it to this point, it means it wasn't wrapped inside
        // a suspense boundary.
        const shouldBailoutToCSR = isBailoutToCSRError(err)
        if (shouldBailoutToCSR) {
          const stack = getStackWithoutErrorMessage(err)
          if (renderOpts.experimental.missingSuspenseWithCSRBailout) {
            error(
              `${err.reason} should be wrapped in a suspense boundary at page "${pagePath}". Read more: https://nextjs.org/docs/messages/missing-suspense-with-csr-bailout\n${stack}`
            )

            throw err
          }

          warn(
            `Entire page "${pagePath}" deopted into client-side rendering due to "${err.reason}". Read more: https://nextjs.org/docs/messages/deopted-into-client-rendering\n${stack}`
          )
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
              res.setHeader('set-cookie', Array.from(headers.values()))
            }
          }
          const redirectUrl = addPathPrefix(
            getURLFromRedirectError(err),
            renderOpts.basePath
          )
          res.setHeader('Location', redirectUrl)
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
          buildManifest,
          assetPrefix,
          renderOpts.crossOrigin,
          subresourceIntegrityManifest,
          getAssetQueryString(ctx, false),
          nonce
        )

        const errorServerStream = ComponentMod.renderToReadableStream(
          <ReactServerError tree={tree} ctx={ctx} errorType={errorType} />,
          clientReferenceManifest.clientModules,
          {
            onError: serverComponentsErrorHandler,
          }
        )

        try {
          const fizzStream = await renderToInitialFizzStream({
            ReactDOMServer: require('react-dom/server.edge'),
            element: (
              <ReactServerEntrypoint
                reactServerStream={errorServerStream}
                preinitScripts={errorPreinitScripts}
                clientReferenceManifest={clientReferenceManifest}
                nonce={nonce}
              />
            ),
            streamOptions: {
              nonce,
              // Include hydration scripts in the HTML
              bootstrapScripts: [errorBootstrapScript],
              formState,
            },
          })

          return {
            // Returning the error that was thrown so it can be used to handle
            // the response in the caller.
            err,
            stream: await continueFizzStream(fizzStream, {
              inlinedDataStream: createInlinedDataReadableStream(
                // This is intentionally using the readable datastream from the
                // main render rather than the flight data from the error page
                // render
                dataStream,
                nonce,
                formState
              ),
              isStaticGeneration,
              getServerInsertedHTML: makeGetServerInsertedHTML({
                polyfills,
                renderServerInsertedHTML,
                serverCapturedErrors: [],
                basePath: renderOpts.basePath,
              }),
              serverInsertedHTMLToHead: true,
              validateRootLayout,
            }),
          }
        } catch (finalErr: any) {
          if (
            process.env.NODE_ENV === 'development' &&
            isNotFoundError(finalErr)
          ) {
            const bailOnNotFound: typeof import('../../client/components/dev-root-not-found-boundary').bailOnNotFound =
              require('../../client/components/dev-root-not-found-boundary').bailOnNotFound
            bailOnNotFound()
          }
          throw finalErr
        }
      }
    }
  )

  // For action requests, we handle them differently with a special render result.
  const actionRequestResult = await handleAction({
    req,
    res,
    ComponentMod,
    serverModuleMap,
    generateFlight,
    staticGenerationStore,
    requestStore,
    serverActions,
    ctx,
  })

  let formState: null | any = null
  if (actionRequestResult) {
    if (actionRequestResult.type === 'not-found') {
      const notFoundLoaderTree = createNotFoundLoaderTree(loaderTree)
      const response = await renderToStream({
        asNotFound: true,
        tree: notFoundLoaderTree,
        formState,
      })

      return new RenderResult(response.stream, { metadata })
    } else if (actionRequestResult.type === 'done') {
      if (actionRequestResult.result) {
        actionRequestResult.result.assignMetadata(metadata)
        return actionRequestResult.result
      } else if (actionRequestResult.formState) {
        formState = actionRequestResult.formState
      }
    }
  }

  const options: RenderResultOptions = {
    metadata,
  }

  let response = await renderToStream({
    asNotFound: isNotFoundPath,
    tree: loaderTree,
    formState,
  })

  // If we have pending revalidates, wait until they are all resolved.
  if (staticGenerationStore.pendingRevalidates) {
    options.waitUntil = Promise.all(
      Object.values(staticGenerationStore.pendingRevalidates)
    )
  }

  addImplicitTags(staticGenerationStore)

  if (staticGenerationStore.tags) {
    metadata.fetchTags = staticGenerationStore.tags.join(',')
  }

  // Create the new render result for the response.
  const result = new RenderResult(response.stream, options)

  // If we aren't performing static generation, we can return the result now.
  if (!isStaticGeneration) {
    return result
  }

  // If this is static generation, we should read this in now rather than
  // sending it back to be sent to the client.
  response.stream = await result.toUnchunkedString(true)

  const buildFailingError =
    digestErrorsMap.size > 0 ? digestErrorsMap.values().next().value : null

  if (!flightDataResolver) {
    throw new Error(
      'Invariant: Flight data resolver is missing when generating static HTML'
    )
  }

  // If we encountered any unexpected errors during build we fail the
  // prerendering phase and the build.
  if (buildFailingError) {
    throw buildFailingError
  }

  // Wait for and collect the flight payload data if we don't have it
  // already
  const flightData = await flightDataResolver()
  if (flightData) {
    metadata.flightData = flightData
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

  return new RenderResult(response.stream, options)
}

export type AppPageRender = (
  req: IncomingMessage,
  res: ServerResponse,
  pagePath: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts
) => Promise<RenderResult<AppPageRenderResultMetadata>>

export const renderToHTMLOrFlight: AppPageRender = (
  req,
  res,
  pagePath,
  query,
  renderOpts
) => {
  // TODO: this includes query string, should it?
  const pathname = validateURL(req.url)

  return RequestAsyncStorageWrapper.wrap(
    renderOpts.ComponentMod.requestAsyncStorage,
    { req, res, renderOpts },
    (requestStore) =>
      StaticGenerationAsyncStorageWrapper.wrap(
        renderOpts.ComponentMod.staticGenerationAsyncStorage,
        {
          urlPathname: pathname,
          renderOpts,
          postpone: React.unstable_postpone,
        },
        (staticGenerationStore) =>
          renderToHTMLOrFlightImpl(req, res, pagePath, query, renderOpts, {
            requestStore,
            staticGenerationStore,
            componentMod: renderOpts.ComponentMod,
            renderOpts,
          })
      )
  )
}
