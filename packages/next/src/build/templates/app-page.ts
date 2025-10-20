import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  AppPageRouteModule,
  type AppPageRouteHandlerContext,
} from '../../server/route-modules/app-page/module.compiled' with { 'turbopack-transition': 'next-ssr' }

import { RouteKind } from '../../server/route-kind' with { 'turbopack-transition': 'next-server-utility' }

import { getRevalidateReason } from '../../server/instrumentation/utils'
import { getTracer, SpanKind, type Span } from '../../server/lib/trace/tracer'
import { addRequestMeta, getRequestMeta } from '../../server/request-meta'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import { interopDefault } from '../../server/app-render/interop-default'
import { stripFlightHeaders } from '../../server/app-render/strip-flight-headers'
import { NodeNextRequest, NodeNextResponse } from '../../server/base-http/node'
import { checkIsAppPPREnabled } from '../../server/lib/experimental/ppr'
import {
  getFallbackRouteParams,
  createOpaqueFallbackRouteParams,
  type OpaqueFallbackRouteParams,
} from '../../server/request/fallback-params'
import { setReferenceManifestsSingleton } from '../../server/app-render/encryption-utils'
import {
  isHtmlBotRequest,
  shouldServeStreamingMetadata,
} from '../../server/lib/streaming-metadata'
import { createServerModuleMap } from '../../server/app-render/action-utils'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { getIsPossibleServerAction } from '../../server/lib/server-action-request-meta'
import {
  RSC_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_IS_PRERENDER_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  RSC_CONTENT_TYPE_HEADER,
} from '../../client/components/app-router-headers'
import { getBotType, isBot } from '../../shared/lib/router/utils/is-bot'
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedAppPageValue,
  type CachedPageValue,
  type ResponseCacheEntry,
  type ResponseGenerator,
} from '../../server/response-cache'
import { FallbackMode, parseFallbackField } from '../../lib/fallback'
import RenderResult from '../../server/render-result'
import {
  CACHE_ONE_YEAR,
  HTML_CONTENT_TYPE_HEADER,
  NEXT_CACHE_TAGS_HEADER,
} from '../../lib/constants'
import type { CacheControl } from '../../server/lib/cache-control'
import { ENCODED_TAGS } from '../../server/stream-utils/encoded-tags'
import { sendRenderResult } from '../../server/send-payload'
import { NoFallbackError } from '../../shared/lib/no-fallback-error.external'

// These are injected by the loader afterwards.

/**
 * The tree created in next-app-loader that holds component segments and modules
 * and I've updated it.
 */
declare const tree: LoaderTree

// We inject the tree and pages here so that we can use them in the route
// module.
// INJECT:tree

import GlobalError from 'VAR_MODULE_GLOBAL_ERROR' with { 'turbopack-transition': 'next-server-utility' }

export { GlobalError }

// These are injected by the loader afterwards.
declare const __next_app_require__: (id: string | number) => unknown
declare const __next_app_load_chunk__: (id: string | number) => Promise<unknown>

// INJECT:__next_app_require__
// INJECT:__next_app_load_chunk__

export const __next_app__ = {
  require: __next_app_require__,
  loadChunk: __next_app_load_chunk__,
}

import * as entryBase from '../../server/app-render/entry-base' with { 'turbopack-transition': 'next-server-utility' }
import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import { InvariantError } from '../../shared/lib/invariant-error'
import { scheduleOnNextTick } from '../../lib/scheduler'
import { isInterceptionRouteAppPath } from '../../shared/lib/router/utils/interception-routes'

export * from '../../server/app-render/entry-base' with { 'turbopack-transition': 'next-server-utility' }

// Create and export the route module that will be consumed.
export const routeModule = new AppPageRouteModule({
  definition: {
    kind: RouteKind.APP_PAGE,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    // The following aren't used in production.
    bundlePath: '',
    filename: '',
    appPaths: [],
  },
  userland: {
    loaderTree: tree,
  },
  distDir: process.env.__NEXT_RELATIVE_DIST_DIR || '',
  relativeProjectDir: process.env.__NEXT_RELATIVE_PROJECT_DIR || '',
})

export async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil: (prom: Promise<void>) => void
  }
) {
  if (routeModule.isDev) {
    addRequestMeta(req, 'devRequestTimingInternalsEnd', process.hrtime.bigint())
  }
  let srcPage = 'VAR_DEFINITION_PAGE'

  // turbopack doesn't normalize `/index` in the page name
  // so we need to to process dynamic routes properly
  // TODO: fix turbopack providing differing value from webpack
  if (process.env.TURBOPACK) {
    srcPage = srcPage.replace(/\/index$/, '') || '/'
  } else if (srcPage === '/index') {
    // we always normalize /index specifically
    srcPage = '/'
  }
  const multiZoneDraftMode = process.env
    .__NEXT_MULTI_ZONE_DRAFT_MODE as any as boolean

  // TODO: replace with more specific flags
  const minimalMode = getRequestMeta(req, 'minimalMode')

  const prepareResult = await routeModule.prepare(req, res, {
    srcPage,
    multiZoneDraftMode,
  })

  if (!prepareResult) {
    res.statusCode = 400
    res.end('Bad Request')
    ctx.waitUntil?.(Promise.resolve())
    return null
  }

  const {
    buildId,
    query,
    params,
    pageIsDynamic,
    buildManifest,
    nextFontManifest,
    reactLoadableManifest,
    serverActionsManifest,
    clientReferenceManifest,
    subresourceIntegrityManifest,
    prerenderManifest,
    isDraftMode,
    resolvedPathname,
    revalidateOnlyGenerated,
    routerServerContext,
    nextConfig,
    interceptionRoutePatterns,
  } = prepareResult

  const normalizedSrcPage = normalizeAppPath(srcPage)

  let { isOnDemandRevalidate } = prepareResult

  // We use the resolvedPathname instead of the parsedUrl.pathname because it
  // is not rewritten as resolvedPathname is. This will ensure that the correct
  // prerender info is used instead of using the original pathname as the
  // source. If however PPR is enabled and cacheComponents is disabled, we
  // treat the pathname as dynamic. Currently, there's a bug in the PPR
  // implementation that incorrectly leaves %%drp placeholders in the output of
  // parallel routes. This is addressed with cacheComponents.
  const prerenderInfo =
    nextConfig.experimental.ppr &&
    !nextConfig.cacheComponents &&
    isInterceptionRouteAppPath(resolvedPathname)
      ? null
      : routeModule.match(resolvedPathname, prerenderManifest)

  const isPrerendered = !!prerenderManifest.routes[resolvedPathname]

  const userAgent = req.headers['user-agent'] || ''
  const botType = getBotType(userAgent)
  const isHtmlBot = isHtmlBotRequest(req)

  /**
   * If true, this indicates that the request being made is for an app
   * prefetch request.
   */
  const isPrefetchRSCRequest =
    getRequestMeta(req, 'isPrefetchRSCRequest') ??
    req.headers[NEXT_ROUTER_PREFETCH_HEADER] === '1' // exclude runtime prefetches, which use '2'

  // NOTE: Don't delete headers[RSC] yet, it still needs to be used in renderToHTML later

  const isRSCRequest =
    getRequestMeta(req, 'isRSCRequest') ?? Boolean(req.headers[RSC_HEADER])

  const isPossibleServerAction = getIsPossibleServerAction(req)

  /**
   * If the route being rendered is an app page, and the ppr feature has been
   * enabled, then the given route _could_ support PPR.
   */
  const couldSupportPPR: boolean = checkIsAppPPREnabled(
    nextConfig.experimental.ppr
  )

  // When enabled, this will allow the use of the `?__nextppronly` query to
  // enable debugging of the static shell.
  const hasDebugStaticShellQuery =
    process.env.__NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING === '1' &&
    typeof query.__nextppronly !== 'undefined' &&
    couldSupportPPR

  // When enabled, this will allow the use of the `?__nextppronly` query
  // to enable debugging of the fallback shell.
  const hasDebugFallbackShellQuery =
    hasDebugStaticShellQuery && query.__nextppronly === 'fallback'

  // This page supports PPR if it is marked as being `PARTIALLY_STATIC` in the
  // prerender manifest and this is an app page.
  const isRoutePPREnabled: boolean =
    couldSupportPPR &&
    ((
      prerenderManifest.routes[normalizedSrcPage] ??
      prerenderManifest.dynamicRoutes[normalizedSrcPage]
    )?.renderingMode === 'PARTIALLY_STATIC' ||
      // Ideally we'd want to check the appConfig to see if this page has PPR
      // enabled or not, but that would require plumbing the appConfig through
      // to the server during development. We assume that the page supports it
      // but only during development.
      (hasDebugStaticShellQuery &&
        (routeModule.isDev === true ||
          routerServerContext?.experimentalTestProxy === true)))

  const isDebugStaticShell: boolean =
    hasDebugStaticShellQuery && isRoutePPREnabled

  // We should enable debugging dynamic accesses when the static shell
  // debugging has been enabled and we're also in development mode.
  const isDebugDynamicAccesses =
    isDebugStaticShell && routeModule.isDev === true

  const isDebugFallbackShell = hasDebugFallbackShellQuery && isRoutePPREnabled

  // If we're in minimal mode, then try to get the postponed information from
  // the request metadata. If available, use it for resuming the postponed
  // render.
  const minimalPostponed = isRoutePPREnabled
    ? getRequestMeta(req, 'postponed')
    : undefined

  // If PPR is enabled, and this is a RSC request (but not a prefetch), then
  // we can use this fact to only generate the flight data for the request
  // because we can't cache the HTML (as it's also dynamic).
  const isDynamicRSCRequest =
    isRoutePPREnabled && isRSCRequest && !isPrefetchRSCRequest

  // Need to read this before it's stripped by stripFlightHeaders. We don't
  // need to transfer it to the request meta because it's only read
  // within this function; the static segment data should have already been
  // generated, so we will always either return a static response or a 404.
  const segmentPrefetchHeader = getRequestMeta(req, 'segmentPrefetchRSCRequest')

  // TODO: investigate existing bug with shouldServeStreamingMetadata always
  // being true for a revalidate due to modifying the base-server this.renderOpts
  // when fixing this to correct logic it causes hydration issue since we set
  // serveStreamingMetadata to true during export
  const serveStreamingMetadata =
    isHtmlBot && isRoutePPREnabled
      ? false
      : !userAgent
        ? true
        : shouldServeStreamingMetadata(userAgent, nextConfig.htmlLimitedBots)

  const isSSG = Boolean(
    (prerenderInfo ||
      isPrerendered ||
      prerenderManifest.routes[normalizedSrcPage]) &&
      // If this is a html bot request and PPR is enabled, then we don't want
      // to serve a static response.
      !(isHtmlBot && isRoutePPREnabled)
  )

  // When a page supports cacheComponents, we can support RDC for Navigations
  const supportsRDCForNavigations =
    isRoutePPREnabled && nextConfig.cacheComponents === true

  // In development, we always want to generate dynamic HTML.
  const supportsDynamicResponse: boolean =
    // If we're in development, we always support dynamic HTML, unless it's
    // a data request, in which case we only produce static HTML.
    routeModule.isDev === true ||
    // If this is not SSG or does not have static paths, then it supports
    // dynamic HTML.
    !isSSG ||
    // If this request has provided postponed data, it supports dynamic
    // HTML.
    typeof minimalPostponed === 'string' ||
    // If this handler supports onCacheEntryV2, then we can only support
    // dynamic responses if it's a dynamic RSC request and not in minimal mode. If it
    // doesn't support it we must fallback to the default behavior.
    (supportsRDCForNavigations && getRequestMeta(req, 'onCacheEntryV2')
      ? // In minimal mode, we'll always want to generate a static response
        // which will generate the RDC for the route. When resuming a Dynamic
        // RSC request, we'll pass the minimal postponed data to the render
        // which will trigger the `supportsDynamicResponse` to be true.
        isDynamicRSCRequest && !minimalMode
      : // Otherwise, we can support dynamic responses if it's a dynamic RSC request.
        isDynamicRSCRequest)

  // When html bots request PPR page, perform the full dynamic rendering.
  const shouldWaitOnAllReady = isHtmlBot && isRoutePPREnabled

  let ssgCacheKey: string | null = null
  if (
    !isDraftMode &&
    isSSG &&
    !supportsDynamicResponse &&
    !isPossibleServerAction &&
    !minimalPostponed &&
    !isDynamicRSCRequest
  ) {
    ssgCacheKey = resolvedPathname
  }

  // the staticPathKey differs from ssgCacheKey since
  // ssgCacheKey is null in dev since we're always in "dynamic"
  // mode in dev to bypass the cache, but we still need to honor
  // dynamicParams = false in dev mode
  let staticPathKey = ssgCacheKey
  if (!staticPathKey && routeModule.isDev) {
    staticPathKey = resolvedPathname
  }

  // If this is a request for an app path that should be statically generated
  // and we aren't in the edge runtime, strip the flight headers so it will
  // generate the static response.
  if (
    !routeModule.isDev &&
    !isDraftMode &&
    isSSG &&
    isRSCRequest &&
    !isDynamicRSCRequest
  ) {
    stripFlightHeaders(req.headers)
  }

  const ComponentMod = {
    ...entryBase,
    tree,
    GlobalError,
    handler,
    routeModule,
    __next_app__,
  }

  // Before rendering (which initializes component tree modules), we have to
  // set the reference manifests to our global store so Server Action's
  // encryption util can access to them at the top level of the page module.
  if (serverActionsManifest && clientReferenceManifest) {
    setReferenceManifestsSingleton({
      page: srcPage,
      clientReferenceManifest,
      serverActionsManifest,
      serverModuleMap: createServerModuleMap({
        serverActionsManifest,
      }),
    })
  }

  const method = req.method || 'GET'
  const tracer = getTracer()
  const activeSpan = tracer.getActiveScopeSpan()

  try {
    const varyHeader = routeModule.getVaryHeader(
      resolvedPathname,
      interceptionRoutePatterns
    )
    res.setHeader('Vary', varyHeader)
    const invokeRouteModule = async (
      span: Span | undefined,
      context: AppPageRouteHandlerContext
    ) => {
      const nextReq = new NodeNextRequest(req)
      const nextRes = new NodeNextResponse(res)

      return routeModule.render(nextReq, nextRes, context).finally(() => {
        if (!span) return

        span.setAttributes({
          'http.status_code': res.statusCode,
          'next.rsc': false,
        })

        const rootSpanAttributes = tracer.getRootSpanAttributes()
        // We were unable to get attributes, probably OTEL is not enabled
        if (!rootSpanAttributes) {
          return
        }

        if (
          rootSpanAttributes.get('next.span_type') !==
          BaseServerSpan.handleRequest
        ) {
          console.warn(
            `Unexpected root span type '${rootSpanAttributes.get(
              'next.span_type'
            )}'. Please report this Next.js issue https://github.com/vercel/next.js`
          )
          return
        }

        const route = rootSpanAttributes.get('next.route')
        if (route) {
          const name = `${method} ${route}`

          span.setAttributes({
            'next.route': route,
            'http.route': route,
            'next.span_name': name,
          })
          span.updateName(name)
        } else {
          span.updateName(`${method} ${srcPage}`)
        }
      })
    }

    const incrementalCache = getRequestMeta(req, 'incrementalCache')

    const doRender = async ({
      span,
      postponed,
      fallbackRouteParams,
      forceStaticRender,
    }: {
      span?: Span

      /**
       * The postponed data for this render. This is only provided when resuming
       * a render that has been postponed.
       */
      postponed: string | undefined

      /**
       * The unknown route params for this render.
       */
      fallbackRouteParams: OpaqueFallbackRouteParams | null

      /**
       * When true, this indicates that the response generator is being called
       * in a context where the response must be generated statically.
       *
       * CRITICAL: This should only currently be used when revalidating due to a
       * dynamic RSC request.
       */
      forceStaticRender: boolean
    }): Promise<ResponseCacheEntry> => {
      const context: AppPageRouteHandlerContext = {
        query,
        params,
        page: normalizedSrcPage,
        sharedContext: {
          buildId,
        },
        serverComponentsHmrCache: getRequestMeta(
          req,
          'serverComponentsHmrCache'
        ),
        fallbackRouteParams,
        renderOpts: {
          App: () => null,
          Document: () => null,
          pageConfig: {},
          ComponentMod,
          Component: interopDefault(ComponentMod),

          params,
          routeModule,
          page: srcPage,
          postponed,
          shouldWaitOnAllReady,
          serveStreamingMetadata,
          supportsDynamicResponse:
            typeof postponed === 'string' || supportsDynamicResponse,
          buildManifest,
          nextFontManifest,
          reactLoadableManifest,
          subresourceIntegrityManifest,
          serverActionsManifest,
          clientReferenceManifest,
          setCacheStatus: routerServerContext?.setCacheStatus,
          setIsrStatus: routerServerContext?.setIsrStatus,
          setReactDebugChannel: routerServerContext?.setReactDebugChannel,

          dir:
            process.env.NEXT_RUNTIME === 'nodejs'
              ? (require('path') as typeof import('path')).join(
                  /* turbopackIgnore: true */
                  process.cwd(),
                  routeModule.relativeProjectDir
                )
              : `${process.cwd()}/${routeModule.relativeProjectDir}`,
          isDraftMode,
          botType,
          isOnDemandRevalidate,
          isPossibleServerAction,
          assetPrefix: nextConfig.assetPrefix,
          nextConfigOutput: nextConfig.output,
          crossOrigin: nextConfig.crossOrigin,
          trailingSlash: nextConfig.trailingSlash,
          images: nextConfig.images,
          previewProps: prerenderManifest.preview,
          deploymentId: nextConfig.deploymentId,
          enableTainting: nextConfig.experimental.taint,
          htmlLimitedBots: nextConfig.htmlLimitedBots,
          reactMaxHeadersLength: nextConfig.reactMaxHeadersLength,

          multiZoneDraftMode,
          incrementalCache,
          cacheLifeProfiles: nextConfig.cacheLife,
          basePath: nextConfig.basePath,
          serverActions: nextConfig.experimental.serverActions,

          ...(isDebugStaticShell ||
          isDebugDynamicAccesses ||
          isDebugFallbackShell
            ? {
                nextExport: true,
                supportsDynamicResponse: false,
                isStaticGeneration: true,
                isDebugDynamicAccesses: isDebugDynamicAccesses,
              }
            : {}),
          cacheComponents: Boolean(nextConfig.cacheComponents),
          experimental: {
            isRoutePPREnabled,
            expireTime: nextConfig.expireTime,
            staleTimes: nextConfig.experimental.staleTimes,
            clientSegmentCache: Boolean(
              nextConfig.experimental.clientSegmentCache
            ),
            dynamicOnHover: Boolean(nextConfig.experimental.dynamicOnHover),
            inlineCss: Boolean(nextConfig.experimental.inlineCss),
            authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
            clientTraceMetadata:
              nextConfig.experimental.clientTraceMetadata || ([] as any),
            clientParamParsingOrigins:
              nextConfig.experimental.clientParamParsingOrigins,
          },

          waitUntil: ctx.waitUntil,
          onClose: (cb) => {
            res.on('close', cb)
          },
          onAfterTaskError: () => {},

          onInstrumentationRequestError: (error, _request, errorContext) =>
            routeModule.onRequestError(
              req,
              error,
              errorContext,
              routerServerContext
            ),
          err: getRequestMeta(req, 'invokeError'),
          dev: routeModule.isDev,
        },
      }

      if (isDebugStaticShell || isDebugDynamicAccesses) {
        context.renderOpts.nextExport = true
        context.renderOpts.supportsDynamicResponse = false
        context.renderOpts.isDebugDynamicAccesses = isDebugDynamicAccesses
      }

      // When we're revalidating in the background, we should not allow dynamic
      // responses.
      if (forceStaticRender) {
        context.renderOpts.supportsDynamicResponse = false
      }

      const result = await invokeRouteModule(span, context)

      const { metadata } = result

      const {
        cacheControl,
        headers = {},
        // Add any fetch tags that were on the page to the response headers.
        fetchTags: cacheTags,
        fetchMetrics,
      } = metadata

      if (cacheTags) {
        headers[NEXT_CACHE_TAGS_HEADER] = cacheTags
      }

      // Pull any fetch metrics from the render onto the request.
      ;(req as any).fetchMetrics = fetchMetrics

      // we don't throw static to dynamic errors in dev as isSSG
      // is a best guess in dev since we don't have the prerender pass
      // to know whether the path is actually static or not
      if (
        isSSG &&
        cacheControl?.revalidate === 0 &&
        !routeModule.isDev &&
        !isRoutePPREnabled
      ) {
        const staticBailoutInfo = metadata.staticBailoutInfo

        const err = new Error(
          `Page changed from static to dynamic at runtime ${resolvedPathname}${
            staticBailoutInfo?.description
              ? `, reason: ${staticBailoutInfo.description}`
              : ``
          }` +
            `\nsee more here https://nextjs.org/docs/messages/app-static-to-dynamic-error`
        )

        if (staticBailoutInfo?.stack) {
          const stack = staticBailoutInfo.stack
          err.stack = err.message + stack.substring(stack.indexOf('\n'))
        }

        throw err
      }

      return {
        value: {
          kind: CachedRouteKind.APP_PAGE,
          html: result,
          headers,
          rscData: metadata.flightData,
          postponed: metadata.postponed,
          status: metadata.statusCode,
          segmentData: metadata.segmentData,
        } satisfies CachedAppPageValue,
        cacheControl,
      } satisfies ResponseCacheEntry
    }

    const responseGenerator: ResponseGenerator = async ({
      hasResolved,
      previousCacheEntry: previousIncrementalCacheEntry,
      isRevalidating,
      span,
      forceStaticRender = false,
    }) => {
      const isProduction = routeModule.isDev === false
      const didRespond = hasResolved || res.writableEnded

      // skip on-demand revalidate if cache is not present and
      // revalidate-if-generated is set
      if (
        isOnDemandRevalidate &&
        revalidateOnlyGenerated &&
        !previousIncrementalCacheEntry &&
        !minimalMode
      ) {
        if (routerServerContext?.render404) {
          await routerServerContext.render404(req, res)
        } else {
          res.statusCode = 404
          res.end('This page could not be found')
        }
        return null
      }

      let fallbackMode: FallbackMode | undefined

      if (prerenderInfo) {
        fallbackMode = parseFallbackField(prerenderInfo.fallback)
      }

      // When serving a HTML bot request, we want to serve a blocking render and
      // not the prerendered page. This ensures that the correct content is served
      // to the bot in the head.
      if (fallbackMode === FallbackMode.PRERENDER && isBot(userAgent)) {
        if (!isRoutePPREnabled || isHtmlBot) {
          fallbackMode = FallbackMode.BLOCKING_STATIC_RENDER
        }
      }

      if (previousIncrementalCacheEntry?.isStale === -1) {
        isOnDemandRevalidate = true
      }

      // TODO: adapt for PPR
      // only allow on-demand revalidate for fallback: true/blocking
      // or for prerendered fallback: false paths
      if (
        isOnDemandRevalidate &&
        (fallbackMode !== FallbackMode.NOT_FOUND ||
          previousIncrementalCacheEntry)
      ) {
        fallbackMode = FallbackMode.BLOCKING_STATIC_RENDER
      }

      if (
        !minimalMode &&
        fallbackMode !== FallbackMode.BLOCKING_STATIC_RENDER &&
        staticPathKey &&
        !didRespond &&
        !isDraftMode &&
        pageIsDynamic &&
        (isProduction || !isPrerendered)
      ) {
        // if the page has dynamicParams: false and this pathname wasn't
        // prerendered trigger the no fallback handling
        if (
          // In development, fall through to render to handle missing
          // getStaticPaths.
          (isProduction || prerenderInfo) &&
          // When fallback isn't present, abort this render so we 404
          fallbackMode === FallbackMode.NOT_FOUND
        ) {
          throw new NoFallbackError()
        }

        // When cacheComponents is enabled, we can use the fallback
        // response if the request is not a dynamic RSC request because the
        // RSC data when this feature flag is enabled does not contain any
        // param references. Without this feature flag enabled, the RSC data
        // contains param references, and therefore we can't use the fallback.
        if (
          isRoutePPREnabled &&
          (nextConfig.cacheComponents ? !isDynamicRSCRequest : !isRSCRequest)
        ) {
          const cacheKey =
            isProduction && typeof prerenderInfo?.fallback === 'string'
              ? prerenderInfo.fallback
              : normalizedSrcPage

          const fallbackRouteParams =
            // If we're in production and we have fallback route params, then we
            // can use the manifest fallback route params.
            isProduction && prerenderInfo?.fallbackRouteParams
              ? createOpaqueFallbackRouteParams(
                  prerenderInfo.fallbackRouteParams
                )
              : // Otherwise, if we're debugging the fallback shell, then we
                // have to manually generate the fallback route params.
                isDebugFallbackShell
                ? getFallbackRouteParams(normalizedSrcPage, routeModule)
                : null

          // We use the response cache here to handle the revalidation and
          // management of the fallback shell.
          const fallbackResponse = await routeModule.handleResponse({
            cacheKey,
            req,
            nextConfig,
            routeKind: RouteKind.APP_PAGE,
            isFallback: true,
            prerenderManifest,
            isRoutePPREnabled,
            responseGenerator: async () =>
              doRender({
                span,
                // We pass `undefined` as rendering a fallback isn't resumed
                // here.
                postponed: undefined,
                fallbackRouteParams,
                forceStaticRender: false,
              }),
            waitUntil: ctx.waitUntil,
          })

          // If the fallback response was set to null, then we should return null.
          if (fallbackResponse === null) return null

          // Otherwise, if we did get a fallback response, we should return it.
          if (fallbackResponse) {
            // Remove the cache control from the response to prevent it from being
            // used in the surrounding cache.
            delete fallbackResponse.cacheControl

            return fallbackResponse
          }
        }
      }

      // Only requests that aren't revalidating can be resumed. If we have the
      // minimal postponed data, then we should resume the render with it.
      let postponed =
        !isOnDemandRevalidate && !isRevalidating && minimalPostponed
          ? minimalPostponed
          : undefined

      // If this is a dynamic RSC request, we should use the postponed data from
      // the static render (if available). This ensures that we can utilize the
      // resume data cache (RDC) from the static render to ensure that the data
      // is consistent between the static and dynamic renders.
      if (
        // Only enable RDC for Navigations if the feature is enabled.
        supportsRDCForNavigations &&
        process.env.NEXT_RUNTIME !== 'edge' &&
        !minimalMode &&
        incrementalCache &&
        isDynamicRSCRequest &&
        // We don't typically trigger an on-demand revalidation for dynamic RSC
        // requests, as we're typically revalidating the page in the background
        // instead. However, if the cache entry is stale, we should trigger a
        // background revalidation on dynamic RSC requests. This prevents us
        // from entering an infinite loop of revalidations.
        !forceStaticRender
      ) {
        const incrementalCacheEntry = await incrementalCache.get(
          resolvedPathname,
          {
            kind: IncrementalCacheKind.APP_PAGE,
            isRoutePPREnabled: true,
            isFallback: false,
          }
        )

        // If the cache entry is found, we should use the postponed data from
        // the cache.
        if (
          incrementalCacheEntry &&
          incrementalCacheEntry.value &&
          incrementalCacheEntry.value.kind === CachedRouteKind.APP_PAGE
        ) {
          // CRITICAL: we're assigning the postponed data from the cache entry
          // here as we're using the RDC to resume the render.
          postponed = incrementalCacheEntry.value.postponed

          // If the cache entry is stale, we should trigger a background
          // revalidation so that subsequent requests will get a fresh response.
          if (
            incrementalCacheEntry &&
            // We want to trigger this flow if the cache entry is stale and if
            // the requested revalidation flow is either foreground or
            // background.
            (incrementalCacheEntry.isStale === -1 ||
              incrementalCacheEntry.isStale === true)
          ) {
            // We want to schedule this on the next tick to ensure that the
            // render is not blocked on it.
            scheduleOnNextTick(async () => {
              const responseCache = routeModule.getResponseCache(req)

              try {
                await responseCache.revalidate(
                  resolvedPathname,
                  incrementalCache,
                  isRoutePPREnabled,
                  false,
                  (c) =>
                    responseGenerator({
                      ...c,
                      // CRITICAL: we need to set this to true as we're
                      // revalidating in the background and typically this dynamic
                      // RSC request is not treated as static.
                      forceStaticRender: true,
                    }),
                  // CRITICAL: we need to pass null here because passing the
                  // previous cache entry here (which is stale) will switch on
                  // isOnDemandRevalidate and break the prerendering.
                  null,
                  hasResolved,
                  ctx.waitUntil
                )
              } catch (err) {
                console.error(
                  'Error revalidating the page in the background',
                  err
                )
              }
            })
          }
        }
      }

      // When we're in minimal mode, if we're trying to debug the static shell,
      // we should just return nothing instead of resuming the dynamic render.
      if (
        (isDebugStaticShell || isDebugDynamicAccesses) &&
        typeof postponed !== 'undefined'
      ) {
        return {
          cacheControl: { revalidate: 1, expire: undefined },
          value: {
            kind: CachedRouteKind.PAGES,
            html: RenderResult.EMPTY,
            pageData: {},
            headers: undefined,
            status: undefined,
          } satisfies CachedPageValue,
        }
      }

      const fallbackRouteParams =
        // If we're in production and we have fallback route params, then we
        // can use the manifest fallback route params if we need to render the
        // fallback shell.
        isProduction &&
        prerenderInfo?.fallbackRouteParams &&
        getRequestMeta(req, 'renderFallbackShell')
          ? createOpaqueFallbackRouteParams(prerenderInfo.fallbackRouteParams)
          : // Otherwise, if we're debugging the fallback shell, then we have to
            // manually generate the fallback route params.
            isDebugFallbackShell
            ? getFallbackRouteParams(normalizedSrcPage, routeModule)
            : null

      // Perform the render.
      return doRender({
        span,
        postponed,
        fallbackRouteParams,
        forceStaticRender,
      })
    }

    const handleResponse = async (span?: Span): Promise<null | void> => {
      const cacheEntry = await routeModule.handleResponse({
        cacheKey: ssgCacheKey,
        responseGenerator: (c) =>
          responseGenerator({
            span,
            ...c,
          }),
        routeKind: RouteKind.APP_PAGE,
        isOnDemandRevalidate,
        isRoutePPREnabled,
        req,
        nextConfig,
        prerenderManifest,
        waitUntil: ctx.waitUntil,
      })

      if (isDraftMode) {
        res.setHeader(
          'Cache-Control',
          'private, no-cache, no-store, max-age=0, must-revalidate'
        )
      }

      // In dev, we should not cache pages for any reason.
      if (routeModule.isDev) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate')
      }

      if (!cacheEntry) {
        if (ssgCacheKey) {
          // A cache entry might not be generated if a response is written
          // in `getInitialProps` or `getServerSideProps`, but those shouldn't
          // have a cache key. If we do have a cache key but we don't end up
          // with a cache entry, then either Next.js or the application has a
          // bug that needs fixing.
          throw new Error('invariant: cache entry required but not generated')
        }
        return null
      }

      if (cacheEntry.value?.kind !== CachedRouteKind.APP_PAGE) {
        throw new Error(
          `Invariant app-page handler received invalid cache entry ${cacheEntry.value?.kind}`
        )
      }

      const didPostpone = typeof cacheEntry.value.postponed === 'string'

      if (
        isSSG &&
        // We don't want to send a cache header for requests that contain dynamic
        // data. If this is a Dynamic RSC request or wasn't a Prefetch RSC
        // request, then we should set the cache header.
        !isDynamicRSCRequest &&
        (!didPostpone || isPrefetchRSCRequest)
      ) {
        if (!minimalMode) {
          // set x-nextjs-cache header to match the header
          // we set for the image-optimizer
          res.setHeader(
            'x-nextjs-cache',
            isOnDemandRevalidate
              ? 'REVALIDATED'
              : cacheEntry.isMiss
                ? 'MISS'
                : cacheEntry.isStale
                  ? 'STALE'
                  : 'HIT'
          )
        }
        // Set a header used by the client router to signal the response is static
        // and should respect the `static` cache staleTime value.
        res.setHeader(NEXT_IS_PRERENDER_HEADER, '1')
      }
      const { value: cachedData } = cacheEntry

      // Coerce the cache control parameter from the render.
      let cacheControl: CacheControl | undefined

      // If this is a resume request in minimal mode it is streamed with dynamic
      // content and should not be cached.
      if (minimalPostponed) {
        cacheControl = { revalidate: 0, expire: undefined }
      }

      // If this is in minimal mode and this is a flight request that isn't a
      // prefetch request while PPR is enabled, it cannot be cached as it contains
      // dynamic content.
      else if (isDynamicRSCRequest) {
        cacheControl = { revalidate: 0, expire: undefined }
      } else if (!routeModule.isDev) {
        // If this is a preview mode request, we shouldn't cache it
        if (isDraftMode) {
          cacheControl = { revalidate: 0, expire: undefined }
        }

        // If this isn't SSG, then we should set change the header only if it is
        // not set already.
        else if (!isSSG) {
          if (!res.getHeader('Cache-Control')) {
            cacheControl = { revalidate: 0, expire: undefined }
          }
        } else if (cacheEntry.cacheControl) {
          // If the cache entry has a cache control with a revalidate value that's
          // a number, use it.
          if (typeof cacheEntry.cacheControl.revalidate === 'number') {
            if (cacheEntry.cacheControl.revalidate < 1) {
              throw new Error(
                `Invalid revalidate configuration provided: ${cacheEntry.cacheControl.revalidate} < 1`
              )
            }

            cacheControl = {
              revalidate: cacheEntry.cacheControl.revalidate,
              expire: cacheEntry.cacheControl?.expire ?? nextConfig.expireTime,
            }
          }
          // Otherwise if the revalidate value is false, then we should use the
          // cache time of one year.
          else {
            cacheControl = { revalidate: CACHE_ONE_YEAR, expire: undefined }
          }
        }
      }

      cacheEntry.cacheControl = cacheControl

      if (
        typeof segmentPrefetchHeader === 'string' &&
        cachedData?.kind === CachedRouteKind.APP_PAGE &&
        cachedData.segmentData
      ) {
        // This is a prefetch request issued by the client Segment Cache. These
        // should never reach the application layer (lambda). We should either
        // respond from the cache (HIT) or respond with 204 No Content (MISS).

        // Set a header to indicate that PPR is enabled for this route. This
        // lets the client distinguish between a regular cache miss and a cache
        // miss due to PPR being disabled. In other contexts this header is used
        // to indicate that the response contains dynamic data, but here we're
        // only using it to indicate that the feature is enabled — the segment
        // response itself contains whether the data is dynamic.
        res.setHeader(NEXT_DID_POSTPONE_HEADER, '2')

        // Add the cache tags header to the response if it exists and we're in
        // minimal mode while rendering a static page.
        const tags = cachedData.headers?.[NEXT_CACHE_TAGS_HEADER]
        if (minimalMode && isSSG && tags && typeof tags === 'string') {
          res.setHeader(NEXT_CACHE_TAGS_HEADER, tags)
        }

        const matchedSegment = cachedData.segmentData.get(segmentPrefetchHeader)
        if (matchedSegment !== undefined) {
          // Cache hit
          return sendRenderResult({
            req,
            res,
            generateEtags: nextConfig.generateEtags,
            poweredByHeader: nextConfig.poweredByHeader,
            result: RenderResult.fromStatic(
              matchedSegment,
              RSC_CONTENT_TYPE_HEADER
            ),
            cacheControl: cacheEntry.cacheControl,
          })
        }

        // Cache miss. Either a cache entry for this route has not been generated
        // (which technically should not be possible when PPR is enabled, because
        // at a minimum there should always be a fallback entry) or there's no
        // match for the requested segment. Respond with a 204 No Content. We
        // don't bother to respond with 404, because these requests are only
        // issued as part of a prefetch.
        res.statusCode = 204
        return sendRenderResult({
          req,
          res,
          generateEtags: nextConfig.generateEtags,
          poweredByHeader: nextConfig.poweredByHeader,
          result: RenderResult.EMPTY,
          cacheControl: cacheEntry.cacheControl,
        })
      }

      // If there's a callback for `onCacheEntry`, call it with the cache entry
      // and the revalidate options. If we support RDC for Navigations, we
      // prefer the `onCacheEntryV2` callback. Once RDC for Navigations is the
      // default, we can remove the fallback to `onCacheEntry` as
      // `onCacheEntryV2` is now fully supported.
      const onCacheEntry = supportsRDCForNavigations
        ? (getRequestMeta(req, 'onCacheEntryV2') ??
          getRequestMeta(req, 'onCacheEntry'))
        : getRequestMeta(req, 'onCacheEntry')
      if (onCacheEntry) {
        const finished = await onCacheEntry(cacheEntry, {
          url: getRequestMeta(req, 'initURL') ?? req.url,
        })
        if (finished) return null
      }

      if (cachedData.headers) {
        const headers = { ...cachedData.headers }

        if (!minimalMode || !isSSG) {
          delete headers[NEXT_CACHE_TAGS_HEADER]
        }

        for (let [key, value] of Object.entries(headers)) {
          if (typeof value === 'undefined') continue

          if (Array.isArray(value)) {
            for (const v of value) {
              res.appendHeader(key, v)
            }
          } else if (typeof value === 'number') {
            value = value.toString()
            res.appendHeader(key, value)
          } else {
            res.appendHeader(key, value)
          }
        }
      }

      // Add the cache tags header to the response if it exists and we're in
      // minimal mode while rendering a static page.
      const tags = cachedData.headers?.[NEXT_CACHE_TAGS_HEADER]
      if (minimalMode && isSSG && tags && typeof tags === 'string') {
        res.setHeader(NEXT_CACHE_TAGS_HEADER, tags)
      }

      // If the request is a data request, then we shouldn't set the status code
      // from the response because it should always be 200. This should be gated
      // behind the experimental PPR flag.
      if (cachedData.status && (!isRSCRequest || !isRoutePPREnabled)) {
        res.statusCode = cachedData.status
      }

      // Redirect information is encoded in RSC payload, so we don't need to use redirect status codes
      if (
        !minimalMode &&
        cachedData.status &&
        RedirectStatusCode[cachedData.status] &&
        isRSCRequest
      ) {
        res.statusCode = 200
      }

      // Mark that the request did postpone.
      if (didPostpone && !isDynamicRSCRequest) {
        res.setHeader(NEXT_DID_POSTPONE_HEADER, '1')
      }

      // we don't go through this block when preview mode is true
      // as preview mode is a dynamic request (bypasses cache) and doesn't
      // generate both HTML and payloads in the same request so continue to just
      // return the generated payload
      if (isRSCRequest && !isDraftMode) {
        // If this is a dynamic RSC request, then stream the response.
        if (typeof cachedData.rscData === 'undefined') {
          // If the response is not an RSC response, then we can't serve it.
          if (cachedData.html.contentType !== RSC_CONTENT_TYPE_HEADER) {
            if (nextConfig.cacheComponents) {
              res.statusCode = 404
              return sendRenderResult({
                req,
                res,
                generateEtags: nextConfig.generateEtags,
                poweredByHeader: nextConfig.poweredByHeader,
                result: RenderResult.EMPTY,
                cacheControl: cacheEntry.cacheControl,
              })
            } else {
              // Otherwise this case is not expected.
              throw new InvariantError(
                `Expected RSC response, got ${cachedData.html.contentType}`
              )
            }
          }

          return sendRenderResult({
            req,
            res,
            generateEtags: nextConfig.generateEtags,
            poweredByHeader: nextConfig.poweredByHeader,
            result: cachedData.html,
            cacheControl: cacheEntry.cacheControl,
          })
        }

        // As this isn't a prefetch request, we should serve the static flight
        // data.
        return sendRenderResult({
          req,
          res,
          generateEtags: nextConfig.generateEtags,
          poweredByHeader: nextConfig.poweredByHeader,
          result: RenderResult.fromStatic(
            cachedData.rscData,
            RSC_CONTENT_TYPE_HEADER
          ),
          cacheControl: cacheEntry.cacheControl,
        })
      }

      // This is a request for HTML data.
      const body = cachedData.html

      // If there's no postponed state, we should just serve the HTML. This
      // should also be the case for a resume request because it's completed
      // as a server render (rather than a static render).
      if (!didPostpone || minimalMode || isRSCRequest) {
        // If we're in test mode, we should add a sentinel chunk to the response
        // that's between the static and dynamic parts so we can compare the
        // chunks and add assertions.
        if (
          process.env.__NEXT_TEST_MODE &&
          minimalMode &&
          isRoutePPREnabled &&
          body.contentType === HTML_CONTENT_TYPE_HEADER
        ) {
          // As we're in minimal mode, the static part would have already been
          // streamed first. The only part that this streams is the dynamic part
          // so we should FIRST stream the sentinel and THEN the dynamic part.
          body.unshift(createPPRBoundarySentinel())
        }

        return sendRenderResult({
          req,
          res,
          generateEtags: nextConfig.generateEtags,
          poweredByHeader: nextConfig.poweredByHeader,
          result: body,
          cacheControl: cacheEntry.cacheControl,
        })
      }

      // If we're debugging the static shell or the dynamic API accesses, we
      // should just serve the HTML without resuming the render. The returned
      // HTML will be the static shell so all the Dynamic API's will be used
      // during static generation.
      if (isDebugStaticShell || isDebugDynamicAccesses) {
        // Since we're not resuming the render, we need to at least add the
        // closing body and html tags to create valid HTML.
        body.push(
          new ReadableStream({
            start(controller) {
              controller.enqueue(ENCODED_TAGS.CLOSED.BODY_AND_HTML)
              controller.close()
            },
          })
        )

        return sendRenderResult({
          req,
          res,
          generateEtags: nextConfig.generateEtags,
          poweredByHeader: nextConfig.poweredByHeader,
          result: body,
          cacheControl: { revalidate: 0, expire: undefined },
        })
      }

      // If we're in test mode, we should add a sentinel chunk to the response
      // that's between the static and dynamic parts so we can compare the
      // chunks and add assertions.
      if (process.env.__NEXT_TEST_MODE) {
        body.push(createPPRBoundarySentinel())
      }

      // This request has postponed, so let's create a new transformer that the
      // dynamic data can pipe to that will attach the dynamic data to the end
      // of the response.
      const transformer = new TransformStream<Uint8Array, Uint8Array>()
      body.push(transformer.readable)

      // Perform the render again, but this time, provide the postponed state.
      // We don't await because we want the result to start streaming now, and
      // we've already chained the transformer's readable to the render result.
      doRender({
        span,
        postponed: cachedData.postponed,
        // This is a resume render, not a fallback render, so we don't need to
        // set this.
        fallbackRouteParams: null,
        forceStaticRender: false,
      })
        .then(async (result) => {
          if (!result) {
            throw new Error('Invariant: expected a result to be returned')
          }

          if (result.value?.kind !== CachedRouteKind.APP_PAGE) {
            throw new Error(
              `Invariant: expected a page response, got ${result.value?.kind}`
            )
          }

          // Pipe the resume result to the transformer.
          await result.value.html.pipeTo(transformer.writable)
        })
        .catch((err) => {
          // An error occurred during piping or preparing the render, abort
          // the transformers writer so we can terminate the stream.
          transformer.writable.abort(err).catch((e) => {
            console.error("couldn't abort transformer", e)
          })
        })

      return sendRenderResult({
        req,
        res,
        generateEtags: nextConfig.generateEtags,
        poweredByHeader: nextConfig.poweredByHeader,
        result: body,
        // We don't want to cache the response if it has postponed data because
        // the response being sent to the client it's dynamic parts are streamed
        // to the client on the same request.
        cacheControl: { revalidate: 0, expire: undefined },
      })
    }

    // TODO: activeSpan code path is for when wrapped by
    // next-server can be removed when this is no longer used
    if (activeSpan) {
      await handleResponse(activeSpan)
    } else {
      return await tracer.withPropagatedContext(req.headers, () =>
        tracer.trace(
          BaseServerSpan.handleRequest,
          {
            spanName: `${method} ${srcPage}`,
            kind: SpanKind.SERVER,
            attributes: {
              'http.method': method,
              'http.target': req.url,
            },
          },
          handleResponse
        )
      )
    }
  } catch (err) {
    if (!(err instanceof NoFallbackError)) {
      await routeModule.onRequestError(
        req,
        err,
        {
          routerKind: 'App Router',
          routePath: srcPage,
          routeType: 'render',
          revalidateReason: getRevalidateReason({
            isStaticGeneration: isSSG,
            isOnDemandRevalidate,
          }),
        },
        routerServerContext
      )
    }

    // rethrow so that we can handle serving error page
    throw err
  }
}

// TODO: omit this from production builds, only test builds should include it
/**
 * Creates a readable stream that emits a PPR boundary sentinel.
 *
 * @returns A readable stream that emits a PPR boundary sentinel.
 */
function createPPRBoundarySentinel() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode('<!-- PPR_BOUNDARY_SENTINEL -->')
      )
      controller.close()
    },
  })
}
