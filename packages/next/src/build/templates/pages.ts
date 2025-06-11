import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ParsedUrlQuery } from 'node:querystring'
import { PagesRouteModule } from '../../server/route-modules/pages/module.compiled'
import { RouteKind } from '../../server/route-kind'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import { getTracer, SpanKind, type Span } from '../../server/lib/trace/tracer'
import { formatUrl } from '../../shared/lib/router/utils/format-url'
import { addRequestMeta, getRequestMeta } from '../../server/request-meta'
import { interopDefault } from '../../server/app-render/interop-default'
import { getRevalidateReason } from '../../server/instrumentation/utils'
import { normalizeDataPath } from '../../shared/lib/page-path/normalize-data-path'
import {
  CachedRouteKind,
  type CachedPageValue,
  type CachedRedirectValue,
  type ResponseCacheEntry,
  type ResponseGenerator,
} from '../../server/response-cache'

import { hoist } from './helpers'

// Import the app and document modules.
import * as document from 'VAR_MODULE_DOCUMENT'
import * as app from 'VAR_MODULE_APP'

// Import the userland code.
import * as userland from 'VAR_USERLAND'
import {
  getCacheControlHeader,
  type CacheControl,
} from '../../server/lib/cache-control'
import { normalizeRepeatedSlashes } from '../../shared/lib/utils'
import { getRedirectStatus } from '../../lib/redirect-status'
import { CACHE_ONE_YEAR } from '../../lib/constants'
import { sendRenderResult } from '../../server/send-payload'
import RenderResult from '../../server/render-result'
import { decodePathParams } from '../../server/lib/router-utils/decode-path-params'
import { toResponseCacheEntry } from '../../server/response-cache/utils'
import { NoFallbackError } from '../../shared/lib/no-fallback-error.external'
import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import { isBot } from '../../shared/lib/router/utils/is-bot'
import { addPathPrefix } from '../../shared/lib/router/utils/add-path-prefix'
import { removeTrailingSlash } from '../../shared/lib/router/utils/remove-trailing-slash'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'

// Re-export the component (should be the default export).
export default hoist(userland, 'default')

// Re-export methods.
export const getStaticProps = hoist(userland, 'getStaticProps')
export const getStaticPaths = hoist(userland, 'getStaticPaths')
export const getServerSideProps = hoist(userland, 'getServerSideProps')
export const config = hoist(userland, 'config')
export const reportWebVitals = hoist(userland, 'reportWebVitals')

// Re-export legacy methods.
export const unstable_getStaticProps = hoist(
  userland,
  'unstable_getStaticProps'
)
export const unstable_getStaticPaths = hoist(
  userland,
  'unstable_getStaticPaths'
)
export const unstable_getStaticParams = hoist(
  userland,
  'unstable_getStaticParams'
)
export const unstable_getServerProps = hoist(
  userland,
  'unstable_getServerProps'
)
export const unstable_getServerSideProps = hoist(
  userland,
  'unstable_getServerSideProps'
)

// Create and export the route module that will be consumed.
export const routeModule = new PagesRouteModule({
  definition: {
    kind: RouteKind.PAGES,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    // The following aren't used in production.
    bundlePath: '',
    filename: '',
  },
  distDir: process.env.__NEXT_RELATIVE_DIST_DIR || '',
  projectDir: process.env.__NEXT_RELATIVE_PROJECT_DIR || '',
  components: {
    // default export might not exist when optimized for data only
    App: app.default,
    Document: document.default,
  },
  userland,
})

export async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil: (prom: Promise<void>) => void
  }
): Promise<void> {
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
    return
  }

  const {
    buildId,
    query,
    params,
    parsedUrl,
    originalQuery,
    originalPathname,
    buildManifest,
    nextFontManifest,
    serverFilesManifest,
    reactLoadableManifest,
    prerenderManifest,
    isDraftMode,
    isOnDemandRevalidate,
    revalidateOnlyGenerated,
    locale,
    locales,
    defaultLocale,
    routerServerContext,
    nextConfig,
  } = prepareResult

  const isExperimentalCompile =
    serverFilesManifest?.config?.experimental?.isExperimentalCompile

  const hasServerProps = Boolean(getServerSideProps)
  const hasStaticProps = Boolean(getStaticProps)
  const hasStaticPaths = Boolean(getStaticPaths)
  const hasGetInitialProps = Boolean(
    (userland.default || userland).getInitialProps
  )
  const isAmp = query.amp && config.amp
  let cacheKey: null | string = null
  let isIsrFallback = Boolean(getRequestMeta(req, 'isIsrFallback'))
  let isNextDataRequest =
    prepareResult.isNextDataRequest && (hasStaticProps || hasServerProps)

  const is404Page = srcPage === '/404'
  const is500Page = srcPage === '/500'
  const isErrorPage = srcPage === '/_error'
  const pathname = parsedUrl.pathname || '/'

  // TODO: rework this to not be necessary as a middleware
  // rewrite should not need to pass this context like this
  // maybe we rely on rewrite header instead
  let resolvedPathname = getRequestMeta(req, 'rewroteURL')

  if (resolvedPathname) {
    if (pathHasPrefix(resolvedPathname, '/_next/data/')) {
      resolvedPathname = normalizeDataPath(resolvedPathname)
    }

    if (locale) {
      resolvedPathname = normalizeLocalePath(
        resolvedPathname,
        nextConfig.i18n?.locales || []
      ).pathname
    }
  } else {
    resolvedPathname = pathname
  }

  if (resolvedPathname === '/index') {
    resolvedPathname = '/'
  }

  if (!routeModule.isDev && !isDraftMode && hasStaticProps) {
    cacheKey = `${locale ? `/${locale}` : ''}${
      (srcPage === '/' || resolvedPathname === '/') && locale
        ? ''
        : resolvedPathname
    }${isAmp ? '.amp' : ''}`

    if (is404Page || is500Page || isErrorPage) {
      cacheKey = `${locale ? `/${locale}` : ''}${srcPage}${isAmp ? '.amp' : ''}`
    }

    cacheKey = decodePathParams(cacheKey)

    // ensure /index and / is normalized to one key
    cacheKey = cacheKey === '/index' ? '/' : cacheKey
  }

  if (hasStaticPaths && !isDraftMode) {
    const decodedPathname = removeTrailingSlash(
      decodePathParams(
        locale
          ? addPathPrefix(resolvedPathname, `/${locale}`)
          : resolvedPathname
      )
    )
    const isPrerendered =
      Boolean(prerenderManifest.routes[decodedPathname]) ||
      prerenderManifest.notFoundRoutes.includes(decodedPathname)

    const prerenderInfo = prerenderManifest.dynamicRoutes[srcPage]

    if (prerenderInfo) {
      if (prerenderInfo.fallback === false && !isPrerendered) {
        throw new NoFallbackError()
      }

      if (
        typeof prerenderInfo.fallback === 'string' &&
        !isPrerendered &&
        !isNextDataRequest
      ) {
        isIsrFallback = true
      }
    }
  }

  // When serving a bot request, we want to serve a blocking render and not
  // the prerendered page. This ensures that the correct content is served
  // to the bot in the head.
  if (
    (isIsrFallback && isBot(req.headers['user-agent'] || '')) ||
    getRequestMeta(req, 'minimalMode')
  ) {
    isIsrFallback = false
  }

  const tracer = getTracer()
  const activeSpan = tracer.getActiveScopeSpan()

  try {
    const method = req.method || 'GET'

    const resolvedUrl = formatUrl({
      pathname: parsedUrl.pathname,
      // make sure to only add query values from original URL
      query: hasStaticProps ? {} : originalQuery,
    })

    const publicRuntimeConfig: Record<string, string> =
      routerServerContext?.publicRuntimeConfig || nextConfig.publicRuntimeConfig

    const handleResponse = async (span?: Span) => {
      const responseGenerator: ResponseGenerator = async ({
        previousCacheEntry,
      }) => {
        const doRender = async () => {
          try {
            return await routeModule
              .render(req, res, {
                query:
                  hasStaticProps && !isExperimentalCompile
                    ? ({
                        ...params,
                        ...(isAmp
                          ? {
                              amp: query.amp,
                            }
                          : {}),
                      } as ParsedUrlQuery)
                    : {
                        ...query,
                        ...params,
                      },
                params,
                page: srcPage,
                renderContext: {
                  isDraftMode,
                  isFallback: isIsrFallback,
                  developmentNotFoundSourcePage: getRequestMeta(
                    req,
                    'developmentNotFoundSourcePage'
                  ),
                },
                sharedContext: {
                  buildId,
                  customServer:
                    Boolean(routerServerContext?.isCustomServer) || undefined,
                  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
                },
                renderOpts: {
                  params,
                  routeModule,
                  page: srcPage,
                  pageConfig: config || {},
                  Component: interopDefault(userland),
                  ComponentMod: userland,
                  getStaticProps,
                  getStaticPaths,
                  getServerSideProps,
                  supportsDynamicResponse: !hasStaticProps,
                  buildManifest,
                  nextFontManifest,
                  reactLoadableManifest,

                  assetPrefix: nextConfig.assetPrefix,
                  strictNextHead: Boolean(
                    nextConfig.experimental.strictNextHead
                  ),
                  previewProps: prerenderManifest.preview,
                  images: nextConfig.images as any,
                  nextConfigOutput: nextConfig.output,
                  optimizeCss: Boolean(nextConfig.experimental.optimizeCss),
                  nextScriptWorkers: Boolean(
                    nextConfig.experimental.nextScriptWorkers
                  ),
                  domainLocales: nextConfig.i18n?.domains,
                  crossOrigin: nextConfig.crossOrigin,

                  multiZoneDraftMode,
                  basePath: nextConfig.basePath,
                  canonicalBase: nextConfig.amp.canonicalBase || '',
                  ampOptimizerConfig: nextConfig.experimental.amp?.optimizer,
                  disableOptimizedLoading:
                    nextConfig.experimental.disableOptimizedLoading,
                  largePageDataBytes:
                    nextConfig.experimental.largePageDataBytes,
                  // Only the `publicRuntimeConfig` key is exposed to the client side
                  // It'll be rendered as part of __NEXT_DATA__ on the client side
                  runtimeConfig:
                    Object.keys(publicRuntimeConfig).length > 0
                      ? publicRuntimeConfig
                      : undefined,

                  isExperimentalCompile,

                  experimental: {
                    clientTraceMetadata:
                      nextConfig.experimental.clientTraceMetadata ||
                      ([] as any),
                  },

                  locale,
                  locales,
                  defaultLocale,
                  setIsrStatus: routerServerContext?.setIsrStatus,

                  isNextDataRequest:
                    isNextDataRequest && (hasServerProps || hasStaticProps),

                  resolvedUrl,
                  // For getServerSideProps and getInitialProps we need to ensure we use the original URL
                  // and not the resolved URL to prevent a hydration mismatch on
                  // asPath
                  resolvedAsPath:
                    hasServerProps || hasGetInitialProps
                      ? formatUrl({
                          // we use the original URL pathname less the _next/data prefix if
                          // present
                          pathname: isNextDataRequest
                            ? normalizeDataPath(originalPathname)
                            : originalPathname,
                          query: originalQuery,
                        })
                      : resolvedUrl,

                  isOnDemandRevalidate,

                  ErrorDebug: getRequestMeta(req, 'PagesErrorDebug'),
                  err: getRequestMeta(req, 'invokeError'),
                  dev: routeModule.isDev,

                  // needed for experimental.optimizeCss feature
                  distDir: `${routeModule.projectDir}/${routeModule.distDir}`,

                  ampSkipValidation:
                    nextConfig.experimental.amp?.skipValidation,
                  ampValidator: getRequestMeta(req, 'ampValidator'),
                },
              })
              .then((renderResult): ResponseCacheEntry => {
                const { metadata } = renderResult

                let cacheControl: CacheControl | undefined =
                  metadata.cacheControl

                if ('isNotFound' in metadata && metadata.isNotFound) {
                  return {
                    value: null,
                    cacheControl,
                  } satisfies ResponseCacheEntry
                }

                // Handle `isRedirect`.
                if (metadata.isRedirect) {
                  return {
                    value: {
                      kind: CachedRouteKind.REDIRECT,
                      props: metadata.pageData ?? metadata.flightData,
                    } satisfies CachedRedirectValue,
                    cacheControl,
                  } satisfies ResponseCacheEntry
                }

                return {
                  value: {
                    kind: CachedRouteKind.PAGES,
                    html: renderResult,
                    pageData: renderResult.metadata.pageData,
                    headers: renderResult.metadata.headers,
                    status: renderResult.metadata.statusCode,
                  },
                  cacheControl,
                }
              })
              .finally(() => {
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
                  span.updateName(`${method} ${req.url}`)
                }
              })
          } catch (err: unknown) {
            // if this is a background revalidate we need to report
            // the request error here as it won't be bubbled
            if (previousCacheEntry?.isStale) {
              await routeModule.onRequestError(
                req,
                err,
                {
                  routerKind: 'Pages Router',
                  routePath: srcPage,
                  routeType: 'render',
                  revalidateReason: getRevalidateReason({
                    isRevalidate: hasStaticProps,
                    isOnDemandRevalidate,
                  }),
                },
                routerServerContext
              )
            }
            throw err
          }
        }

        // if we've already generated this page we no longer
        // serve the fallback
        if (previousCacheEntry) {
          isIsrFallback = false
        }

        if (isIsrFallback) {
          const fallbackResponse = await routeModule.getResponseCache(req).get(
            routeModule.isDev
              ? null
              : locale
                ? `/${locale}${srcPage}`
                : srcPage,
            async ({
              previousCacheEntry: previousFallbackCacheEntry = null,
            }) => {
              if (!routeModule.isDev) {
                return toResponseCacheEntry(previousFallbackCacheEntry)
              }
              return doRender()
            },
            {
              routeKind: RouteKind.PAGES,
              isFallback: true,
              isRoutePPREnabled: false,
              isOnDemandRevalidate: false,
              incrementalCache: await routeModule.getIncrementalCache(
                req,
                nextConfig,
                prerenderManifest
              ),
              waitUntil: ctx.waitUntil,
            }
          )
          if (fallbackResponse) {
            // Remove the cache control from the response to prevent it from being
            // used in the surrounding cache.
            delete fallbackResponse.cacheControl
            return fallbackResponse
          }
        }

        if (
          !getRequestMeta(req, 'minimalMode') &&
          isOnDemandRevalidate &&
          revalidateOnlyGenerated &&
          !previousCacheEntry
        ) {
          res.statusCode = 404
          // on-demand revalidate always sets this header
          res.setHeader('x-nextjs-cache', 'REVALIDATED')
          res.end('This page could not be found')
          return null
        }

        if (
          isIsrFallback &&
          previousCacheEntry?.value?.kind === CachedRouteKind.PAGES
        ) {
          return {
            value: {
              kind: CachedRouteKind.PAGES,
              html: new RenderResult(
                Buffer.from(previousCacheEntry.value.html),
                {
                  contentType: 'text/html;utf-8',
                  metadata: {
                    statusCode: previousCacheEntry.value.status,
                    headers: previousCacheEntry.value.headers,
                  },
                }
              ),
              pageData: {},
              status: previousCacheEntry.value.status,
              headers: previousCacheEntry.value.headers,
            } satisfies CachedPageValue,
            cacheControl: { revalidate: 0, expire: undefined },
          } satisfies ResponseCacheEntry
        }
        return doRender()
      }

      const result = await routeModule.handleResponse({
        cacheKey,
        req,
        nextConfig,
        routeKind: RouteKind.PAGES,
        isOnDemandRevalidate,
        revalidateOnlyGenerated,
        waitUntil: ctx.waitUntil,
        responseGenerator: responseGenerator,
        prerenderManifest,
      })

      // response is finished is no cache entry
      if (!result) {
        return
      }

      if (hasStaticProps && !getRequestMeta(req, 'minimalMode')) {
        res.setHeader(
          'x-nextjs-cache',
          isOnDemandRevalidate
            ? 'REVALIDATED'
            : result.isMiss
              ? 'MISS'
              : result.isStale
                ? 'STALE'
                : 'HIT'
        )
      }

      let cacheControl: CacheControl | undefined

      if (!hasStaticProps || isIsrFallback) {
        if (!res.getHeader('Cache-Control')) {
          cacheControl = { revalidate: 0, expire: undefined }
        }
      } else if (is404Page) {
        const notFoundRevalidate = getRequestMeta(req, 'notFoundRevalidate')

        cacheControl = {
          revalidate:
            typeof notFoundRevalidate === 'undefined' ? 0 : notFoundRevalidate,
          expire: undefined,
        }
      } else if (is500Page) {
        cacheControl = { revalidate: 0, expire: undefined }
      } else if (result.cacheControl) {
        // If the cache entry has a cache control with a revalidate value that's
        // a number, use it.
        if (typeof result.cacheControl.revalidate === 'number') {
          if (result.cacheControl.revalidate < 1) {
            throw new Error(
              `Invalid revalidate configuration provided: ${result.cacheControl.revalidate} < 1`
            )
          }

          cacheControl = {
            revalidate: result.cacheControl.revalidate,
            expire: result.cacheControl?.expire ?? nextConfig.expireTime,
          }
        } else {
          // revalidate: false
          cacheControl = {
            revalidate: CACHE_ONE_YEAR,
            expire: undefined,
          }
        }
      }

      // If cache control is already set on the response we don't
      // override it to allow users to customize it via next.config
      if (cacheControl && !res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', getCacheControlHeader(cacheControl))
      }

      // notFound: true case
      if (!result.value) {
        // add revalidate metadata before rendering 404 page
        // so that we can use this as source of truth for the
        // cache-control header instead of what the 404 page returns
        // for the revalidate value
        addRequestMeta(
          req,
          'notFoundRevalidate',
          result.cacheControl?.revalidate
        )

        res.statusCode = 404

        if (isNextDataRequest) {
          res.end('{"notFound":true}')
          return
        }
        // TODO: should route-module itself handle rendering the 404
        if (routerServerContext?.render404) {
          await routerServerContext.render404(req, res, parsedUrl, false)
        } else {
          res.end('This page could not be found')
        }
        return
      }

      if (result.value.kind === CachedRouteKind.REDIRECT) {
        if (isNextDataRequest) {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(result.value.props))
          return
        } else {
          const handleRedirect = (pageData: any) => {
            const redirect = {
              destination: pageData.pageProps.__N_REDIRECT,
              statusCode: pageData.pageProps.__N_REDIRECT_STATUS,
              basePath: pageData.pageProps.__N_REDIRECT_BASE_PATH,
            }
            const statusCode = getRedirectStatus(redirect)
            const { basePath } = nextConfig

            if (
              basePath &&
              redirect.basePath !== false &&
              redirect.destination.startsWith('/')
            ) {
              redirect.destination = `${basePath}${redirect.destination}`
            }

            if (redirect.destination.startsWith('/')) {
              redirect.destination = normalizeRepeatedSlashes(
                redirect.destination
              )
            }

            res.statusCode = statusCode
            res.setHeader('Location', redirect.destination)
            if (statusCode === RedirectStatusCode.PermanentRedirect) {
              res.setHeader('Refresh', `0;url=${redirect.destination}`)
            }
            res.end(redirect.destination)
          }
          await handleRedirect(result.value.props)
          return null
        }
      }

      if (result.value.kind !== CachedRouteKind.PAGES) {
        throw new Error(
          `Invariant: received non-pages cache entry in pages handler`
        )
      }

      // In dev, we should not cache pages for any reason.
      if (routeModule.isDev) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate')
      }

      // Draft mode should never be cached
      if (isDraftMode) {
        res.setHeader(
          'Cache-Control',
          'private, no-cache, no-store, max-age=0, must-revalidate'
        )
      }

      // when invoking _error before pages/500 we don't actually
      // send the _error response
      if (
        getRequestMeta(req, 'customErrorRender') ||
        (isErrorPage &&
          getRequestMeta(req, 'minimalMode') &&
          res.statusCode === 500)
      ) {
        return null
      }

      await sendRenderResult({
        req,
        res,
        // If we are rendering the error page it's not a data request
        // anymore
        result:
          isNextDataRequest && !isErrorPage && !is500Page
            ? new RenderResult(
                Buffer.from(JSON.stringify(result.value.pageData)),
                {
                  contentType: 'application/json',
                  metadata: result.value.html.metadata,
                }
              )
            : result.value.html,
        generateEtags: nextConfig.generateEtags,
        poweredByHeader: nextConfig.poweredByHeader,
        cacheControl: routeModule.isDev ? undefined : cacheControl,
        type: isNextDataRequest ? 'json' : 'html',
      })
    }

    // TODO: activeSpan code path is for when wrapped by
    // next-server can be removed when this is no longer used
    if (activeSpan) {
      await handleResponse()
    } else {
      await tracer.withPropagatedContext(req.headers, () =>
        tracer.trace(
          BaseServerSpan.handleRequest,
          {
            spanName: `${method} ${req.url}`,
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
    await routeModule.onRequestError(
      req,
      err,
      {
        routerKind: 'Pages Router',
        routePath: srcPage,
        routeType: 'render',
        revalidateReason: getRevalidateReason({
          isRevalidate: hasStaticProps,
          isOnDemandRevalidate,
        }),
      },
      routerServerContext
    )

    // rethrow so that we can handle serving error page
    throw err
  }
}
