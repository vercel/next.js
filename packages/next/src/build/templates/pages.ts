import type { IncomingMessage, ServerResponse } from 'node:http'
import type RenderResult from '../../server/render-result'
import type { ParsedUrlQuery } from 'node:querystring'
import { PagesRouteModule } from '../../server/route-modules/pages/module.compiled'
import { RouteKind } from '../../server/route-kind'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import { getTracer, SpanKind, type Span } from '../../server/lib/trace/tracer'
import { formatUrl } from '../../shared/lib/router/utils/format-url'
import {
  RouterServerContextSymbol,
  routerServerGlobal,
} from '../../server/lib/router-utils/router-server-context'
import { getRequestMeta } from '../../server/request-meta'
import { interopDefault } from '../../server/app-render/interop-default'
import { getRevalidateReason } from '../../server/instrumentation/utils'
import { normalizeDataPath } from '../../shared/lib/page-path/normalize-data-path'
import { hoist } from './helpers'

// Import the app and document modules.
import * as document from 'VAR_MODULE_DOCUMENT'
import * as app from 'VAR_MODULE_APP'

// Import the userland code.
import * as userland from 'VAR_USERLAND'

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
): Promise<RenderResult | null> {
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
    parsedUrl,
    originalQuery,
    originalPathname,
    buildManifest,
    nextFontManifest,
    isNextDataRequest,
    serverFilesManifest,
    reactLoadableManifest,
    prerenderManifest,
    isDraftMode,
    isOnDemandRevalidate,
    locale,
    locales,
    defaultLocale,
  } = prepareResult

  const routerServerContext =
    routerServerGlobal[RouterServerContextSymbol]?.[
      process.env.__NEXT_RELATIVE_PROJECT_DIR || ''
    ]

  const onError = routeModule.instrumentationOnRequestError.bind(routeModule)
  const nextConfig =
    routerServerContext?.nextConfig || serverFilesManifest.config

  const isExperimentalCompile =
    serverFilesManifest?.config?.experimental?.isExperimentalCompile

  const isIsrFallback = Boolean(getRequestMeta(req, 'isIsrFallback'))
  const hasServerProps = Boolean(getServerSideProps)
  const hasStaticProps = Boolean(getStaticProps)
  const hasGetInitialProps = Boolean(
    (userland.default || userland).getInitialProps
  )

  try {
    const method = req.method || 'GET'
    const tracer = getTracer()

    const activeSpan = tracer.getActiveScopeSpan()
    const resolvedUrl = formatUrl({
      pathname: parsedUrl.pathname,
      // make sure to only add query values from original URL
      query: hasStaticProps ? {} : originalQuery,
    })

    const publicRuntimeConfig: Record<string, string> =
      routerServerContext?.publicRuntimeConfig || nextConfig.publicRuntimeConfig

    const invokeRouteModule = async (span?: Span) =>
      routeModule
        .render(req, res, {
          query:
            hasStaticProps && !isExperimentalCompile
              ? ({
                  ...params,
                  ...(query.amp && config.amp
                    ? {
                        amp: query.amp as string,
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
            strictNextHead: Boolean(nextConfig.experimental.strictNextHead),
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
            largePageDataBytes: nextConfig.experimental.largePageDataBytes,
            // Only the `publicRuntimeConfig` key is exposed to the client side
            // It'll be rendered as part of __NEXT_DATA__ on the client side
            runtimeConfig:
              Object.keys(publicRuntimeConfig).length > 0
                ? publicRuntimeConfig
                : undefined,

            isExperimentalCompile,

            experimental: {
              clientTraceMetadata:
                nextConfig.experimental.clientTraceMetadata || ([] as any),
            },

            locale,
            locales,
            defaultLocale,

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

            ampSkipValidation: nextConfig.experimental.amp?.skipValidation,
            ampValidator: getRequestMeta(req, 'ampValidator'),
          },
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

    // TODO: activeSpan code path is for when wrapped by
    // next-server can be removed when this is no longer used
    if (activeSpan) {
      return await invokeRouteModule(activeSpan)
    } else {
      return await tracer.withPropagatedContext(req.headers, () =>
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
          invokeRouteModule
        )
      )
    }
  } catch (err) {
    await onError(
      req,
      err,
      {
        path: req.url || '/',
        headers: req.headers,
        method: req.method || 'GET',
      },
      {
        routerKind: 'Pages Router',
        routePath: srcPage,
        routeType: 'render',
        revalidateReason: getRevalidateReason({
          isRevalidate: hasStaticProps,
          isOnDemandRevalidate,
        }),
      }
    )

    // rethrow so that we can handle serving error page
    throw err
  } finally {
    // We don't allow any waitUntil work in pages API routes currently
    // so if callback is present return with resolved promise since no
    // pending work
    ctx.waitUntil?.(Promise.resolve())
  }
}
