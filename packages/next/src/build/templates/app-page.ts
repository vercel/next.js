import type { LoaderTree } from '../../server/lib/app-dir-module'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FallbackRouteParam } from '../static-paths/types'

import {
  AppPageRouteModule,
  type AppPageRouteHandlerContext,
} from '../../server/route-modules/app-page/module.compiled' with { 'turbopack-transition': 'next-ssr' }

import { RouteKind } from '../../server/route-kind' with { 'turbopack-transition': 'next-server-utility' }

import { getRevalidateReason } from '../../server/instrumentation/utils' with { 'turbopack-transition': 'next-server-utility' }
import {
  getTracer,
  SpanKind,
  type Span,
} from '../../server/lib/trace/tracer' with { 'turbopack-transition': 'next-server-utility' }
import type { RequestMeta } from '../../server/request-meta'
import {
  addRequestMeta,
  getRequestMeta,
  setRequestMeta,
} from '../../server/request-meta' with { 'turbopack-transition': 'next-server-utility' }
import { BaseServerSpan } from '../../server/lib/trace/constants' with { 'turbopack-transition': 'next-server-utility' }
import { interopDefault } from '../../server/app-render/interop-default' with { 'turbopack-transition': 'next-server-utility' }
import { stripFlightHeaders } from '../../server/app-render/strip-flight-headers' with { 'turbopack-transition': 'next-server-utility' }
import {
  NodeNextRequest,
  NodeNextResponse,
} from '../../server/base-http/node' with { 'turbopack-transition': 'next-server-utility' }
import { checkIsAppPPREnabled } from '../../server/lib/experimental/ppr' with { 'turbopack-transition': 'next-server-utility' }
import { isRSCRequestHeader } from '../../server/lib/is-rsc-request' with { 'turbopack-transition': 'next-server-utility' }
import {
  getFallbackRouteParams,
  getPlaceholderFallbackRouteParams,
  buildDynamicSegmentPlaceholder,
  createOpaqueFallbackRouteParams,
  type OpaqueFallbackRouteParams,
} from '../../server/request/fallback-params' with { 'turbopack-transition': 'next-server-utility' }
import { setManifestsSingleton } from '../../server/app-render/manifests-singleton' with { 'turbopack-transition': 'next-server-utility' }
import {
  isHtmlBotRequest,
  shouldServeStreamingMetadata,
} from '../../server/lib/streaming-metadata' with { 'turbopack-transition': 'next-server-utility' }
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths' with { 'turbopack-transition': 'next-server-utility' }
import { getIsPossibleServerAction } from '../../server/lib/server-action-request-meta' with { 'turbopack-transition': 'next-server-utility' }
import {
  RSC_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_INSTANT_TEST_COOKIE,
  NEXT_IS_PRERENDER_HEADER,
  NEXT_DID_POSTPONE_HEADER,
  RSC_CONTENT_TYPE_HEADER,
} from '../../client/components/app-router-headers' with { 'turbopack-transition': 'next-server-utility' }
import {
  getBotType,
  isBot,
} from '../../shared/lib/router/utils/is-bot' with { 'turbopack-transition': 'next-server-utility' }
import {
  CachedRouteKind,
  IncrementalCacheKind,
  type CachedAppPageValue,
  type CachedPageValue,
  type ResponseCacheEntry,
  type ResponseGenerator,
} from '../../server/response-cache' with { 'turbopack-transition': 'next-server-utility' }
import {
  FallbackMode,
  parseFallbackField,
} from '../../lib/fallback' with { 'turbopack-transition': 'next-server-utility' }
import RenderResult from '../../server/render-result' with { 'turbopack-transition': 'next-server-utility' }
import {
  CACHE_ONE_YEAR_SECONDS,
  HTML_CONTENT_TYPE_HEADER,
  NEXT_CACHE_TAGS_HEADER,
  NEXT_NAV_DEPLOYMENT_ID_HEADER,
  NEXT_RESUME_HEADER,
  NEXT_RESUME_STATE_LENGTH_HEADER,
} from '../../lib/constants' with { 'turbopack-transition': 'next-server-utility' }
import type { CacheControl } from '../../server/lib/cache-control'
import { ENCODED_TAGS } from '../../server/stream-utils/encoded-tags' with { 'turbopack-transition': 'next-server-utility' }
import { createInstantTestScriptInsertionTransformStream } from '../../server/stream-utils/node-web-streams-helper' with { 'turbopack-transition': 'next-server-utility' }
import { sendRenderResult } from '../../server/send-payload' with { 'turbopack-transition': 'next-server-utility' }
import { NoFallbackError } from '../../shared/lib/no-fallback-error.external' with { 'turbopack-transition': 'next-server-utility' }
import { parseMaxPostponedStateSize } from '../../shared/lib/size-limit' with { 'turbopack-transition': 'next-server-utility' }
import {
  getMaxPostponedStateSize,
  getPostponedStateExceededErrorMessage,
  readBodyWithSizeLimit,
} from '../../server/lib/postponed-request-body' with { 'turbopack-transition': 'next-server-utility' }
import { parseUrl } from '../../lib/url' with { 'turbopack-transition': 'next-server-utility' }

// These are injected by the loader afterwards.

/**
 * The tree created in next-app-loader that holds component segments and modules
 * and I've updated it.
 */
declare const tree: LoaderTree

// These are injected by the loader afterwards.
declare const __next_app_require__: (id: string | number) => unknown
declare const __next_app_load_chunk__: (id: string | number) => Promise<unknown>

// We inject the tree and pages here so that we can use them in the route
// module.
// INJECT:tree
// INJECT:__next_app_require__
// INJECT:__next_app_load_chunk__

export const __next_app__ = {
  require: __next_app_require__,
  loadChunk: __next_app_load_chunk__,
}

import * as entryBase from '../../server/app-render/entry-base' with { 'turbopack-transition': 'next-server-utility' }
import { RedirectStatusCode } from '../../client/components/redirect-status-code' with { 'turbopack-transition': 'next-server-utility' }
import { InvariantError } from '../../shared/lib/invariant-error' with { 'turbopack-transition': 'next-server-utility' }
import { scheduleOnNextTick } from '../../lib/scheduler' with { 'turbopack-transition': 'next-server-utility' }
import { isInterceptionRouteAppPath } from '../../shared/lib/router/utils/interception-routes' with { 'turbopack-transition': 'next-server-utility' }
import { getSegmentParam } from '../../shared/lib/router/utils/get-segment-param' with { 'turbopack-transition': 'next-server-utility' }

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

/**
 * Builds the cache key for the most complete prerenderable shell we can derive
 * from the shell that matched this request. Only params that can still be
 * filled by `generateStaticParams` are substituted; fully dynamic params stay
 * as placeholders so a request like `/c/foo` can complete `/[one]/[two]` into
 * `/c/[two]` rather than `/c/foo`.
 */
function buildCompletedShellCacheKey(
  fallbackPathname: string,
  remainingPrerenderableParams: readonly FallbackRouteParam[],
  params: Record<string, undefined | string | string[]> | undefined
): string {
  const prerenderableParamsByName = new Map(
    remainingPrerenderableParams.map((param) => [param.paramName, param])
  )

  return (
    fallbackPathname
      .split('/')
      .map((segment) => {
        const segmentParam = getSegmentParam(segment)
        if (!segmentParam) {
          return segment
        }

        const remainingParam = prerenderableParamsByName.get(
          segmentParam.paramName
        )
        if (!remainingParam) {
          return segment
        }

        const value = params?.[remainingParam.paramName]
        if (!value) {
          return segment
        }

        const encodedValue = Array.isArray(value)
          ? value.map((item) => encodeURIComponent(item)).join('/')
          : encodeURIComponent(value)

        return segment.replace(
          buildDynamicSegmentPlaceholder(remainingParam),
          encodedValue
        )
      })
      .join('/') || '/'
  )
}

export async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
    requestMeta?: RequestMeta
  }
) {
  if (ctx.requestMeta) {
    setRequestMeta(req, ctx.requestMeta)
  }

  if (routeModule.isDev) {
    addRequestMeta(req, 'devRequestTimingInternalsEnd', process.hrtime.bigint())
  }
  const isMinimalMode = Boolean(getRequestMeta(req, 'minimalMode'))

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
    prefetchHintsManifest,
    isDraftMode,
    resolvedPathname,
    revalidateOnlyGenerated,
    routerServerContext,
    nextConfig,
    parsedUrl,
    interceptionRoutePatterns,
    deploymentId,
    clientAssetToken,
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
  const prerenderMatch =
    nextConfig.experimental.ppr &&
    !nextConfig.cacheComponents &&
    isInterceptionRouteAppPath(resolvedPathname)
      ? null
      : routeModule.match(resolvedPathname, prerenderManifest)
  const prerenderInfo = prerenderMatch?.route ?? null

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
    getRequestMeta(req, 'isRSCRequest') ??
    isRSCRequestHeader(req.headers[RSC_HEADER])

  const isPossibleServerAction = getIsPossibleServerAction(req)

  /**
   * If the route being rendered is an app page, and the ppr feature has been
   * enabled, then the given route _could_ support PPR.
   */
  const couldSupportPPR: boolean = checkIsAppPPREnabled(
    nextConfig.experimental.ppr
  )

  // Stash postponed state for server actions when in minimal mode.
  // We extract it here so the RDC is available for the re-render after the action completes.
  const resumeStateLengthHeader = req.headers[NEXT_RESUME_STATE_LENGTH_HEADER]
  if (
    !getRequestMeta(req, 'postponed') &&
    isMinimalMode &&
    couldSupportPPR &&
    isPossibleServerAction &&
    resumeStateLengthHeader &&
    typeof resumeStateLengthHeader === 'string'
  ) {
    const stateLength = parseInt(resumeStateLengthHeader, 10)
    const { maxPostponedStateSize, maxPostponedStateSizeBytes } =
      getMaxPostponedStateSize(nextConfig.experimental.maxPostponedStateSize)

    if (!isNaN(stateLength) && stateLength > 0) {
      if (stateLength > maxPostponedStateSizeBytes) {
        res.statusCode = 413
        res.end(getPostponedStateExceededErrorMessage(maxPostponedStateSize))
        ctx.waitUntil?.(Promise.resolve())
        return null
      }

      // Calculate max total body size to prevent buffering excessively large
      // payloads before the action handler checks. We use stateLength (not
      // maxPostponedStateSizeBytes) so the postponed state doesn't eat into
      // the action body budget - it's already validated above.
      const defaultActionBodySizeLimit = '1 MB'
      const actionBodySizeLimit =
        nextConfig.experimental.serverActions?.bodySizeLimit ??
        defaultActionBodySizeLimit
      const actionBodySizeLimitBytes =
        actionBodySizeLimit !== defaultActionBodySizeLimit
          ? (
              require('next/dist/compiled/bytes') as typeof import('next/dist/compiled/bytes')
            ).parse(actionBodySizeLimit)
          : 1024 * 1024 // 1 MB
      const maxTotalBodySize = stateLength + actionBodySizeLimitBytes

      const fullBody = await readBodyWithSizeLimit(req, maxTotalBodySize)
      if (fullBody === null) {
        res.statusCode = 413
        res.end(
          `Request body exceeded limit. ` +
            `To configure the body size limit for Server Actions, see: https://nextjs.org/docs/app/api-reference/next-config-js/serverActions#bodysizelimit`
        )
        ctx.waitUntil?.(Promise.resolve())
        return null
      }

      if (fullBody.length >= stateLength) {
        // Extract postponed state from the beginning
        const postponedState = fullBody
          .subarray(0, stateLength)
          .toString('utf8')
        addRequestMeta(req, 'postponed', postponedState)

        // Store the remaining action body for the action handler
        const actionBody = fullBody.subarray(stateLength)
        addRequestMeta(req, 'actionBody', actionBody)
      } else {
        throw new Error(
          `invariant: expected ${stateLength} bytes of postponed state but only received ${fullBody.length} bytes`
        )
      }
    }
  }

  if (
    !getRequestMeta(req, 'postponed') &&
    couldSupportPPR &&
    req.headers[NEXT_RESUME_HEADER] === '1' &&
    req.method === 'POST'
  ) {
    const { maxPostponedStateSize, maxPostponedStateSizeBytes } =
      getMaxPostponedStateSize(nextConfig.experimental.maxPostponedStateSize)

    // Decode the postponed state from the request body, it will come as
    // an array of buffers, so collect them and then concat them to form
    // the string.
    const body = await readBodyWithSizeLimit(req, maxPostponedStateSizeBytes)
    if (body === null) {
      res.statusCode = 413
      res.end(getPostponedStateExceededErrorMessage(maxPostponedStateSize))
      ctx.waitUntil?.(Promise.resolve())
      return null
    }
    const postponed = body.toString('utf8')

    addRequestMeta(req, 'postponed', postponed)
  }

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

  // Whether the testing API is exposed (dev mode or explicit flag)
  const exposeTestingApi =
    routeModule.isDev === true ||
    nextConfig.experimental.exposeTestingApiInProductionBuild === true

  // Enable the Instant Navigation Testing API. Renders only the prefetched
  // portion of the page, excluding dynamic content. This allows tests to
  // assert on the prefetched UI state deterministically.
  //
  // The instant test cookie is sent automatically with all requests while a
  // navigation lock is held. We treat a request as a test render when the
  // cookie is present and either:
  // - it's a document request (no RSC header) — covers MPA navigations
  // - it's a prefetch RSC request — covers client-side prefetches
  // Regular RSC navigation requests proceed normally even during a locked
  // scope; blocking happens on the client side.
  const isInstantNavigationTest =
    exposeTestingApi &&
    typeof req.headers.cookie === 'string' &&
    req.headers.cookie.includes(NEXT_INSTANT_TEST_COOKIE + '=') &&
    (!isRSCRequestHeader(req.headers[RSC_HEADER]) ||
      req.headers[NEXT_ROUTER_PREFETCH_HEADER] === '1')

  // This page supports PPR if it is marked as being `PARTIALLY_STATIC` in the
  // prerender manifest and this is an app page.
  const isRoutePPREnabled: boolean =
    // When the instant navigation testing API is active, enable the PPR
    // prerender path even without Cache Components. In dev mode without CC,
    // static pages need this path to produce buffered segment data (the
    // legacy prerender path hangs in dev mode).
    (couldSupportPPR || isInstantNavigationTest) &&
    ((
      prerenderManifest.routes[normalizedSrcPage] ??
      prerenderManifest.dynamicRoutes[normalizedSrcPage]
    )?.renderingMode === 'PARTIALLY_STATIC' ||
      // Ideally we'd want to check the appConfig to see if this page has PPR
      // enabled or not, but that would require plumbing the appConfig through
      // to the server during development. We assume that the page supports it
      // but only during development or when the testing API is exposed.
      ((hasDebugStaticShellQuery || isInstantNavigationTest) &&
        (exposeTestingApi ||
          routerServerContext?.experimentalTestProxy === true)))

  const isDebugStaticShell: boolean =
    (hasDebugStaticShellQuery || isInstantNavigationTest) && isRoutePPREnabled

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
  const staticPrefetchDataRoute =
    prerenderManifest.routes[resolvedPathname]?.prefetchDataRoute

  let isDynamicRSCRequest =
    isRoutePPREnabled &&
    isRSCRequest &&
    !isPrefetchRSCRequest &&
    // If generated at build time, treat the RSC request as static
    // so we can serve the prebuilt .rsc without a dynamic render.
    // Only do this for routes that have a concrete prefetchDataRoute.
    !staticPrefetchDataRoute

  // During a PPR revalidation, the RSC request is not dynamic if we do not have the postponed data.
  // We only attach the postponed data during a resume. If there's no postponed data, then it must be a revalidation.
  // This is to ensure that we don't bypass the cache during a revalidation.
  if (isMinimalMode) {
    isDynamicRSCRequest = isDynamicRSCRequest && !!minimalPostponed
  }

  // Need to read this before it's stripped by stripFlightHeaders. We don't
  // need to transfer it to the request meta because it's only read
  // within this function; the static segment data should have already been
  // generated, so we will always either return a static response or a 404.
  const rawSegmentPrefetchHeader =
    req.headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]
  const segmentPrefetchHeader =
    getRequestMeta(req, 'segmentPrefetchRSCRequest') ??
    (isPrefetchRSCRequest
      ? typeof rawSegmentPrefetchHeader === 'string'
        ? rawSegmentPrefetchHeader
        : Array.isArray(rawSegmentPrefetchHeader)
          ? rawSegmentPrefetchHeader[0]
          : undefined
      : undefined)

  // TODO: investigate existing bug with shouldServeStreamingMetadata always
  // being true for a revalidate due to modifying the base-server this.renderOpts
  // when fixing this to correct logic it causes hydration issue since we set
  // serveStreamingMetadata to true during export
  const serveStreamingMetadata =
    botType && isRoutePPREnabled
      ? false
      : !userAgent
        ? true
        : shouldServeStreamingMetadata(userAgent, nextConfig.htmlLimitedBots)

  const isSSG = Boolean(
    (prerenderInfo ||
      isPrerendered ||
      prerenderManifest.routes[normalizedSrcPage]) &&
      // If this is a bot request and PPR is enabled, then we don't want
      // to serve a static response. This applies to both DOM bots (like Googlebot)
      // and HTML-limited bots.
      !(botType && isRoutePPREnabled)
  )

  // When a page supports cacheComponents, we can support RDC for Navigations
  const supportsRDCForNavigations =
    isRoutePPREnabled && nextConfig.cacheComponents === true

  // In development, we always want to generate dynamic HTML.
  const supportsDynamicResponse: boolean =
    // If we're in development, we always support dynamic HTML, unless it's
    // a data request, in which case we only produce static HTML.
    routeModule.isDev === true ||
    // If this is a draft mode request, it supports dynamic HTML.
    isDraftMode ||
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
        isDynamicRSCRequest && !isMinimalMode
      : // Otherwise, we can support dynamic responses if it's a dynamic RSC request.
        isDynamicRSCRequest)

  // When bots request PPR page, perform the full dynamic rendering.
  // This applies to both DOM bots (like Googlebot) and HTML-limited bots.
  const shouldWaitOnAllReady = Boolean(botType) && isRoutePPREnabled
  const remainingPrerenderableParams =
    prerenderInfo?.remainingPrerenderableParams ?? []
  // Concrete optional routes like `/optional-catchall` can still match their
  // generic shell entry (eg /optional-catchall/[[...slug]]) in the prerender manifest.
  // If the omitted param already resolved to a real prerendered path, keep serving that concrete result.
  const hasOmittedConcreteFallbackParam =
    isPrerendered &&
    remainingPrerenderableParams.some((param) => {
      const value = params?.[param.paramName]
      return value == null || (Array.isArray(value) && value.length === 0)
    })
  const hasUnresolvedRootFallbackParams =
    prerenderInfo?.fallback === null &&
    (prerenderInfo.fallbackRootParams?.length ?? 0) > 0

  let ssgCacheKey: string | null = null
  if (
    !isDraftMode &&
    isSSG &&
    !supportsDynamicResponse &&
    !isPossibleServerAction &&
    !minimalPostponed &&
    !isDynamicRSCRequest
  ) {
    // For normal SSG routes we cache by the fully resolved pathname. For
    // partial fallbacks we instead derive the cache key from the shell
    // that matched this request so `/prefix/[one]/[two]` can specialize into
    // `/prefix/c/[two]` without promoting all the way to `/prefix/c/foo`.
    const fallbackPathname = prerenderMatch
      ? typeof prerenderInfo?.fallback === 'string'
        ? prerenderInfo.fallback
        : prerenderMatch.source
      : null

    if (
      fallbackPathname &&
      prerenderInfo?.fallbackRouteParams?.length &&
      !hasUnresolvedRootFallbackParams
    ) {
      if (remainingPrerenderableParams.length > 0) {
        const completedShellCacheKey = buildCompletedShellCacheKey(
          fallbackPathname,
          remainingPrerenderableParams,
          params
        )

        // If applying the current request params doesn't make the shell any
        // more complete, then this shell is already at its most complete
        // form and should remain shared rather than creating a new cache entry.
        ssgCacheKey =
          completedShellCacheKey !== fallbackPathname
            ? completedShellCacheKey
            : null
      }
    } else {
      ssgCacheKey = resolvedPathname
    }
  }

  // the staticPathKey differs from ssgCacheKey since
  // ssgCacheKey is null in dev since we're always in "dynamic"
  // mode in dev to bypass the cache. It can also be null for partial
  // fallback shells that should remain shared and must not create a
  // param-specific ISR entry, but we still need to honor fallback handling.
  let staticPathKey = ssgCacheKey
  if (
    !staticPathKey &&
    (routeModule.isDev ||
      (isSSG &&
        pageIsDynamic &&
        prerenderInfo?.fallbackRouteParams?.length &&
        // Server action requests must not get a staticPathKey, otherwise they
        // enter the fallback rendering block below and return the cached HTML
        // shell with the action result appended, instead of responding with
        // just the RSC action result.
        !isPossibleServerAction))
  ) {
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
    handler,
    routeModule,
    __next_app__,
  }

  // Before rendering (which initializes component tree modules), we have to
  // set the reference manifests to our global store so Server Action's
  // encryption util can access to them at the top level of the page module.
  if (serverActionsManifest && clientReferenceManifest) {
    setManifestsSingleton({
      page: srcPage,
      clientReferenceManifest,
      serverActionsManifest,
    })
  }

  const method = req.method || 'GET'
  const tracer = getTracer()
  const activeSpan = tracer.getActiveScopeSpan()
  const isWrappedByNextServer = Boolean(
    routerServerContext?.isWrappedByNextServer
  )
  const remainingFallbackRouteParams =
    remainingPrerenderableParams.length > 0
      ? (prerenderInfo?.fallbackRouteParams?.filter(
          (param) =>
            !remainingPrerenderableParams.some(
              (prerenderableParam) =>
                prerenderableParam.paramName === param.paramName
            )
        ) ?? [])
      : []

  const render404 = async () => {
    // TODO: should route-module itself handle rendering the 404
    if (routerServerContext?.render404) {
      await routerServerContext.render404(req, res, parsedUrl, false)
    } else {
      res.end('This page could not be found')
    }
    return null
  }

  try {
    const varyHeader = routeModule.getVaryHeader(
      resolvedPathname,
      interceptionRoutePatterns
    )
    res.setHeader('Vary', varyHeader)
    let parentSpan: Span | undefined
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

        const route = rootSpanAttributes.get('next.route') || normalizedSrcPage
        const name = `${method} ${route}`

        span.setAttributes({
          'next.route': route,
          'http.route': route,
          'next.span_name': name,
        })
        span.updateName(name)

        // Propagate http.route to the parent span if one exists (e.g.
        // a platform-created HTTP span in adapter deployments).
        if (parentSpan && parentSpan !== span) {
          parentSpan.setAttribute('http.route', route)
          parentSpan.updateName(name)
        }
      })
    }

    const incrementalCache =
      getRequestMeta(req, 'incrementalCache') ||
      (await routeModule.getIncrementalCache(
        req,
        nextConfig,
        prerenderManifest,
        isMinimalMode
      ))

    incrementalCache?.resetRequestCache()
    ;(globalThis as any).__incrementalCache = incrementalCache

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
          deploymentId,
          clientAssetToken,
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
          setCacheStatus: routerServerContext?.setCacheStatus,
          setIsrStatus: routerServerContext?.setIsrStatus,
          setReactDebugChannel: routerServerContext?.setReactDebugChannel,
          sendErrorsToBrowser: routerServerContext?.sendErrorsToBrowser,

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
          enableTainting: nextConfig.experimental.taint,
          htmlLimitedBots: nextConfig.htmlLimitedBots,
          reactMaxHeadersLength: nextConfig.reactMaxHeadersLength,

          multiZoneDraftMode,
          prefetchHints: prefetchHintsManifest,
          incrementalCache,
          cacheLifeProfiles: nextConfig.cacheLife,
          staticPageGenerationTimeout: nextConfig.staticPageGenerationTimeout,
          basePath: nextConfig.basePath,
          serverActions: nextConfig.experimental.serverActions,
          logServerFunctions:
            typeof nextConfig.logging === 'object' &&
            Boolean(nextConfig.logging.serverFunctions),

          ...(isDebugStaticShell ||
          isDebugDynamicAccesses ||
          isDebugFallbackShell
            ? {
                isBuildTimePrerendering: true,
                supportsDynamicResponse: false,
                isStaticGeneration: true,
                isDebugDynamicAccesses: isDebugDynamicAccesses,
              }
            : {}),
          cacheComponents: Boolean(nextConfig.cacheComponents),
          validationLevel:
            nextConfig.experimental.instantInsights.validationLevel,
          experimental: {
            isRoutePPREnabled,
            expireTime: nextConfig.expireTime,
            staleTimes: nextConfig.experimental.staleTimes,
            dynamicOnHover: Boolean(nextConfig.experimental.dynamicOnHover),
            optimisticRouting: Boolean(
              nextConfig.experimental.optimisticRouting
            ),
            inlineCss: Boolean(nextConfig.experimental.inlineCss),
            prefetchInlining: nextConfig.experimental.prefetchInlining ?? false,
            authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
            useCacheTimeout: nextConfig.experimental.useCacheTimeout,
            cachedNavigations: Boolean(
              nextConfig.experimental.cachedNavigations
            ),
            clientTraceMetadata:
              nextConfig.experimental.clientTraceMetadata || ([] as any),
            clientParamParsingOrigins:
              nextConfig.experimental.clientParamParsingOrigins,
            maxPostponedStateSizeBytes: parseMaxPostponedStateSize(
              nextConfig.experimental.maxPostponedStateSize
            ),
          },

          waitUntil: ctx.waitUntil,
          onClose: (cb) => {
            res.on('close', cb)
          },
          onAfterTaskError: () => {},

          onInstrumentationRequestError: (
            error,
            _request,
            errorContext,
            silenceLog
          ) =>
            routeModule.onRequestError(
              req,
              error,
              errorContext,
              silenceLog,
              routerServerContext
            ),
          err: getRequestMeta(req, 'invokeError'),
        },
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

      // Apply the `expireTime` fallback as soon as we have the render's
      // `cacheControl`, so every downstream consumer (the cache stored via
      // `incrementalCache.set`, the response Cache-Control header, the outgoing
      // entry returned to `handleResponse`) sees a finalized `cacheControl`
      // with a populated `expire`. This mirrors the build-time fallback in
      // `build/index.ts` so we don't apply an expire to routes that opt out of
      // revalidation entirely (`revalidate: false`) or that are dynamic
      // (`revalidate: 0`).
      if (
        cacheControl &&
        cacheControl.revalidate !== false &&
        cacheControl.revalidate > 0 &&
        cacheControl.expire === undefined
      ) {
        cacheControl.expire = nextConfig.expireTime
      }

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

      try {
        // skip on-demand revalidate if cache is not present and
        // revalidate-if-generated is set
        if (
          isOnDemandRevalidate &&
          revalidateOnlyGenerated &&
          !previousIncrementalCacheEntry &&
          !isMinimalMode
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

        if (
          prerenderInfo?.fallback === null &&
          !hasOmittedConcreteFallbackParam &&
          !hasUnresolvedRootFallbackParams &&
          remainingPrerenderableParams.length > 0
        ) {
          // Generic source shells without unresolved root params don't have a
          // concrete fallback file of their own, so they're marked as blocking.
          // When we can complete the shell into a more specific
          // prerendered shell for this request, treat it like a prerender
          // fallback so we can serve that shell instead of blocking on the full
          // route. Root-param shells stay blocking, since unknown root branches
          // should not inherit a shell from another generated branch.
          fallbackMode = FallbackMode.PRERENDER
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
          !isMinimalMode &&
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
            if (nextConfig.adapterPath) {
              return await render404()
            }
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

            let fallbackRouteParams: OpaqueFallbackRouteParams | null
            if (isProduction) {
              // In production, rely on the prerender manifest's fallback
              // entry — the authoritative set computed at build time by
              // `buildAppStaticPaths`.
              if (prerenderInfo?.fallbackRouteParams) {
                fallbackRouteParams = createOpaqueFallbackRouteParams(
                  prerenderInfo.fallbackRouteParams
                )
              } else if (isDebugFallbackShell) {
                fallbackRouteParams = getFallbackRouteParams(
                  normalizedSrcPage,
                  routeModule
                )
              } else {
                fallbackRouteParams = null
              }
            } else {
              // In dev, the prerender manifest isn't populated for ad-hoc
              // prefetches. The outer `!isPrerendered` guard means every URL
              // reaching this block has params not covered by
              // `generateStaticParams`, so the worst-case fallback set —
              // every dynamic segment from the loader tree — matches what a
              // static prerender would use. This keeps the prefetch response
              // from baking resolved param values into the shell.
              //
              // `isDebugStaticShell` covers the `?__nextppronly=1` query and
              // the Instant Navigation testing cookie; `isDebugFallbackShell`
              // is the explicit fallback-shell debug flow.
              if (isDebugStaticShell || isDebugFallbackShell) {
                fallbackRouteParams = getFallbackRouteParams(
                  normalizedSrcPage,
                  routeModule
                )
              } else {
                fallbackRouteParams = null
              }
            }

            // When rendering a debug static shell, override the fallback
            // params on the request so that the staged rendering correctly
            // defers params that are not statically known.
            if (isDebugStaticShell && fallbackRouteParams) {
              addRequestMeta(req, 'fallbackParams', fallbackRouteParams)
            }

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
                  // Always serve the shell that matched this request
                  // immediately. If there are still prerenderable params left,
                  // the background path below will complete the shell into a
                  // more specific cache entry for later requests.
                  fallbackRouteParams,
                  forceStaticRender: true,
                }),
              waitUntil: ctx.waitUntil,
              isMinimalMode,
            })

            // If the fallback response was set to null, then we should return null.
            if (fallbackResponse === null) return null

            // Otherwise, if we did get a fallback response, we should return it.
            if (fallbackResponse) {
              if (
                !isMinimalMode &&
                isRoutePPREnabled &&
                // Match the build-time contract: only fallback shells that can
                // still be completed with prerenderable params should upgrade.
                remainingPrerenderableParams.length > 0 &&
                ssgCacheKey &&
                incrementalCache &&
                !isOnDemandRevalidate &&
                !isDebugFallbackShell &&
                // The testing API relies on deterministic shell behavior, so
                // don't upgrade fallback shells in the background when it's
                // exposed.
                !exposeTestingApi &&
                // Instant Navigation Testing API requests intentionally keep
                // the route in shell mode; don't upgrade these in background.
                !isInstantNavigationTest
              ) {
                scheduleOnNextTick(async () => {
                  const responseCache = routeModule.getResponseCache(req)

                  try {
                    // Only the params that were just specialized should be
                    // removed from the fallback render. Any remaining fallback
                    // params stay deferred so the revalidated result is a more
                    // specific shell (e.g. `/prefix/c/[two]`), not a fully
                    // concrete route (`/prefix/c/foo`).
                    await responseCache.revalidate(
                      ssgCacheKey,
                      incrementalCache,
                      isRoutePPREnabled,
                      false,
                      (c) => {
                        return doRender({
                          span: c.span,
                          postponed: undefined,
                          fallbackRouteParams:
                            remainingFallbackRouteParams.length > 0
                              ? createOpaqueFallbackRouteParams(
                                  remainingFallbackRouteParams
                                )
                              : null,
                          forceStaticRender: true,
                        })
                      },
                      // We don't have a prior entry for this param-specific shell.
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

        if (
          // If this is a dynamic RSC request or a server action request, we should
          // use the postponed data from the static render (if available). This
          // ensures that we can utilize the resume data cache (RDC) from the static
          // render to ensure that the data is consistent between the static and
          // dynamic renders (for navigations) or when re-rendering after a server
          // action.
          // Only enable RDC for Navigations if the feature is enabled.
          supportsRDCForNavigations &&
          process.env.NEXT_RUNTIME !== 'edge' &&
          !isMinimalMode &&
          incrementalCache &&
          // Include both dynamic RSC requests (navigations) and server actions
          (isDynamicRSCRequest || isPossibleServerAction) &&
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

        const placeholderFallbackRouteParams =
          // When a request carries dynamic placeholder values (e.g. "[slug]"),
          // defer only the unresolved subset instead of forcing all fallback
          // params to suspend.
          !routeModule.isDev &&
          pageIsDynamic &&
          prerenderInfo?.fallbackRouteParams
            ? getPlaceholderFallbackRouteParams(
                params as
                  | Record<string, undefined | string | string[]>
                  | undefined,
                prerenderInfo.fallbackRouteParams
              )
            : null

        const fallbackRouteParamsForRender =
          placeholderFallbackRouteParams &&
          placeholderFallbackRouteParams.length > 0
            ? placeholderFallbackRouteParams
            : prerenderInfo?.fallbackRouteParams

        const hasPlaceholderFallbackRouteParams =
          placeholderFallbackRouteParams != null &&
          placeholderFallbackRouteParams.length > 0

        // When route-module.ts resolved partial nxtP* params during
        // background revalidation, filter fallbackRouteParams to only the
        // params that are still unresolved. This lets doRender produce an
        // intermediate PPR shell that suspends only for those params.
        let effectiveFallbackRouteParams: FallbackRouteParam[] | null = null
        if (nextConfig.cacheComponents && prerenderInfo?.fallbackRouteParams) {
          const resolvedKeys = getRequestMeta(req, 'resolvedRouteParamKeys')
          if (resolvedKeys && resolvedKeys.size > 0) {
            effectiveFallbackRouteParams =
              prerenderInfo.fallbackRouteParams.filter(
                (param) => !resolvedKeys.has(param.paramName)
              )
          }
        }

        const fallbackRouteParams =
          // In production or when debugging the static shell for a
          // non-prerendered URL, use the prerender manifest's fallback route
          // params which correctly identifies which params are unknown.
          ((isProduction && getRequestMeta(req, 'renderFallbackShell')) ||
            hasPlaceholderFallbackRouteParams ||
            (isDebugStaticShell && !isPrerendered)) &&
          fallbackRouteParamsForRender
            ? createOpaqueFallbackRouteParams(fallbackRouteParamsForRender)
            : // For intermediate shells where some params are resolved and
              // others still have placeholders, use the filtered subset so the
              // prerender suspends only for the unresolved params.
              effectiveFallbackRouteParams &&
                effectiveFallbackRouteParams.length > 0 &&
                effectiveFallbackRouteParams.length <
                  (prerenderInfo?.fallbackRouteParams?.length ?? 0)
              ? createOpaqueFallbackRouteParams(effectiveFallbackRouteParams)
              : isDebugFallbackShell
                ? getFallbackRouteParams(normalizedSrcPage, routeModule)
                : null

        // For staged dynamic rendering (Cached Navigations) and debug static
        // shell rendering, pass the fallback params via request meta so the
        // RequestStore knows which params to defer. We don't pass them as
        // fallbackRouteParams because that would replace actual param values
        // with opaque placeholders during segment resolution.
        if (
          (isProduction || isDebugStaticShell) &&
          nextConfig.cacheComponents &&
          !isPrerendered &&
          prerenderInfo?.fallbackRouteParams
        ) {
          const fallbackParams = createOpaqueFallbackRouteParams(
            fallbackRouteParamsForRender ?? prerenderInfo.fallbackRouteParams
          )

          if (fallbackParams) {
            addRequestMeta(req, 'fallbackParams', fallbackParams)
          }
        }

        // Perform the render.
        return doRender({
          span,
          postponed,
          fallbackRouteParams,
          forceStaticRender,
        })
      } catch (err) {
        // if this is a background revalidate we need to report
        // the request error here as it won't be bubbled
        if (previousIncrementalCacheEntry?.isStale) {
          const silenceLog = false
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
            silenceLog,
            routerServerContext
          )
        }
        throw err
      }
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
        isMinimalMode,
      })

      if (isDraftMode) {
        res.setHeader(
          'Cache-Control',
          'private, no-cache, no-store, max-age=0, must-revalidate'
        )
      }

      // In dev, we should not cache pages for any reason.
      if (routeModule.isDev) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate')
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

      // Set the build ID header for RSC navigation requests when deploymentId is configured. This
      // corresponds with maybeAppendBuildIdToRSCPayload in app-render.tsx which omits the build ID
      // from the RSC payload when deploymentId is set (relying on this header instead). Server
      // actions are excluded here because action redirect responses get the deployment ID header
      // from the pre-fetched redirect target (via createRedirectRenderResult in action-handler.ts
      // which copies headers from the internal RSC fetch).
      // For static prerenders served from CDN, routes-manifest.json adds a header.
      if (isRSCRequest && !isPossibleServerAction && deploymentId) {
        res.setHeader(NEXT_NAV_DEPLOYMENT_ID_HEADER, deploymentId)
      }

      if (
        isSSG &&
        // We don't want to send a cache header for requests that contain dynamic
        // data. If this is a Dynamic RSC request or wasn't a Prefetch RSC
        // request, then we should set the cache header.
        !isDynamicRSCRequest &&
        (!didPostpone || isPrefetchRSCRequest)
      ) {
        if (!isMinimalMode) {
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
              expire: cacheEntry.cacheControl.expire,
            }
          }
          // Otherwise if the revalidate value is false, then we should use the
          // cache time of one year.
          else {
            cacheControl = {
              revalidate: CACHE_ONE_YEAR_SECONDS,
              expire: undefined,
            }
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
        // respond from the cache (HIT) or respond with 404 (MISS).

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
        if (isMinimalMode && isSSG && tags && typeof tags === 'string') {
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
        // match for the requested segment. Respond with a 404.
        res.statusCode = 404
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
        const rawCacheEntryUrl = getRequestMeta(req, 'initURL') ?? req.url
        const cacheEntryUrl = rawCacheEntryUrl
          ? (parseUrl(rawCacheEntryUrl)?.pathname ?? rawCacheEntryUrl)
          : undefined

        const finished = await onCacheEntry(cacheEntry, {
          url: cacheEntryUrl,
        })

        if (finished) return null
      }

      if (cachedData.headers) {
        const headers = { ...cachedData.headers }

        if (!isMinimalMode || !isSSG) {
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
      if (isMinimalMode && isSSG && tags && typeof tags === 'string') {
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
        !isMinimalMode &&
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

      // Instant Navigation Testing API: serve the static shell with an
      // injected script that sets self.__next_instant_test and kicks off a
      // static RSC fetch for hydration. The transform stream also appends
      // closing </body></html> tags so the browser can parse the full document.
      // In dev mode, also inject self.__next_r so the HMR WebSocket and
      // debug channel can initialize.
      if (isInstantNavigationTest && isDebugStaticShell) {
        const instantTestRequestId =
          routeModule.isDev === true ? crypto.randomUUID() : null
        body.pipeThrough(
          await createInstantTestScriptInsertionTransformStream(
            instantTestRequestId
          )
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

      // If there's no postponed state, we should just serve the HTML. This
      // should also be the case for a resume request because it's completed
      // as a server render (rather than a static render).
      if (!didPostpone || isMinimalMode || isRSCRequest) {
        // If we're in test mode, we should add a sentinel chunk to the response
        // that's between the static and dynamic parts so we can compare the
        // chunks and add assertions.
        if (
          process.env.__NEXT_TEST_MODE &&
          isMinimalMode &&
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

      // Plumb fallback params via request meta so the RequestStore created
      // downstream in app-render.tsx knows which params to defer during the
      // resume. We don't pass them as `fallbackRouteParams` because that
      // would replace actual param values with opaque placeholders during
      // segment resolution; the resolved values are baked into the URL and
      // already interpolated into the postponed state.
      if (nextConfig.cacheComponents && prerenderInfo?.fallbackRouteParams) {
        const fallbackParams = createOpaqueFallbackRouteParams(
          prerenderInfo.fallbackRouteParams
        )
        if (fallbackParams) {
          addRequestMeta(req, 'fallbackParams', fallbackParams)
        }
      }

      // Perform the render again, but this time, provide the postponed state.
      // We don't await because we want the result to start streaming now, and
      // we've already chained the transformer's readable to the render result.
      doRender({
        span,
        postponed: cachedData.postponed,
        // This is a resume render, not a fallback render. Fallback params
        // (for cacheComponents routes) are plumbed via request meta above.
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
    if (isWrappedByNextServer && activeSpan) {
      await handleResponse(activeSpan)
    } else {
      parentSpan = tracer.getActiveScopeSpan()
      return await tracer.withPropagatedContext(
        req.headers,
        () =>
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
          ),
        undefined,
        !isWrappedByNextServer
      )
    }
  } catch (err) {
    if (!(err instanceof NoFallbackError)) {
      const silenceLog = false
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
        silenceLog,
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
