import {
  AppRouteRouteModule,
  type AppRouteRouteHandlerContext,
  type AppRouteRouteModuleOptions,
} from '../../server/route-modules/app-route/module.compiled'
import { RouteKind } from '../../server/route-kind'
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { addRequestMeta, getRequestMeta } from '../../server/request-meta'
import { getTracer, type Span, SpanKind } from '../../server/lib/trace/tracer'
import { setReferenceManifestsSingleton } from '../../server/app-render/encryption-utils'
import { createServerModuleMap } from '../../server/app-render/action-utils'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { NodeNextRequest, NodeNextResponse } from '../../server/base-http/node'
import {
  NextRequestAdapter,
  signalFromNodeResponse,
} from '../../server/web/spec-extension/adapters/next-request'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import { getRevalidateReason } from '../../server/instrumentation/utils'
import { sendResponse } from '../../server/send-response'
import {
  fromNodeOutgoingHttpHeaders,
  toNodeOutgoingHttpHeaders,
} from '../../server/web/utils'
import { getCacheControlHeader } from '../../server/lib/cache-control'
import { INFINITE_CACHE, NEXT_CACHE_TAGS_HEADER } from '../../lib/constants'
import { NoFallbackError } from '../../shared/lib/no-fallback-error.external'
import {
  CachedRouteKind,
  type ResponseCacheEntry,
  type ResponseGenerator,
} from '../../server/response-cache'

import * as userland from 'VAR_USERLAND'

// These are injected by the loader afterwards. This is injected as a variable
// instead of a replacement because this could also be `undefined` instead of
// an empty string.
declare const nextConfigOutput: AppRouteRouteModuleOptions['nextConfigOutput']

// We inject the nextConfigOutput here so that we can use them in the route
// module.
// INJECT:nextConfigOutput

const routeModule = new AppRouteRouteModule({
  definition: {
    kind: RouteKind.APP_ROUTE,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    filename: 'VAR_DEFINITION_FILENAME',
    bundlePath: 'VAR_DEFINITION_BUNDLE_PATH',
  },
  distDir: process.env.__NEXT_RELATIVE_DIST_DIR || '',
  relativeProjectDir: process.env.__NEXT_RELATIVE_PROJECT_DIR || '',
  resolvedPagePath: 'VAR_RESOLVED_PAGE_PATH',
  nextConfigOutput,
  userland,
})

// Pull out the exports that we need to expose from the module. This should
// be eliminated when we've moved the other routes to the new format. These
// are used to hook into the route.
const { workAsyncStorage, workUnitAsyncStorage, serverHooks } = routeModule

function patchFetch() {
  return _patchFetch({
    workAsyncStorage,
    workUnitAsyncStorage,
  })
}

export {
  routeModule,
  workAsyncStorage,
  workUnitAsyncStorage,
  serverHooks,
  patchFetch,
}

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
    params,
    nextConfig,
    isDraftMode,
    prerenderManifest,
    routerServerContext,
    isOnDemandRevalidate,
    revalidateOnlyGenerated,
    resolvedPathname,
    clientReferenceManifest,
    serverActionsManifest,
  } = prepareResult

  const normalizedSrcPage = normalizeAppPath(srcPage)

  let isIsr = Boolean(
    prerenderManifest.dynamicRoutes[normalizedSrcPage] ||
      prerenderManifest.routes[resolvedPathname]
  )

  if (isIsr && !isDraftMode) {
    const isPrerendered = Boolean(prerenderManifest.routes[resolvedPathname])
    const prerenderInfo = prerenderManifest.dynamicRoutes[normalizedSrcPage]

    if (prerenderInfo) {
      if (prerenderInfo.fallback === false && !isPrerendered) {
        throw new NoFallbackError()
      }
    }
  }

  let cacheKey: string | null = null

  if (isIsr && !routeModule.isDev && !isDraftMode) {
    cacheKey = resolvedPathname
    // ensure /index and / is normalized to one key
    cacheKey = cacheKey === '/index' ? '/' : cacheKey
  }

  const supportsDynamicResponse: boolean =
    // If we're in development, we always support dynamic HTML
    routeModule.isDev === true ||
    // If this is not SSG or does not have static paths, then it supports
    // dynamic HTML.
    !isIsr

  // This is a revalidation request if the request is for a static
  // page and it is not being resumed from a postponed render and
  // it is not a dynamic RSC request then it is a revalidation
  // request.
  const isStaticGeneration = isIsr && !supportsDynamicResponse

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

  const context: AppRouteRouteHandlerContext = {
    params,
    prerenderManifest,
    renderOpts: {
      experimental: {
        authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
      },
      cacheComponents: Boolean(nextConfig.cacheComponents),
      supportsDynamicResponse,
      incrementalCache: getRequestMeta(req, 'incrementalCache'),
      cacheLifeProfiles: nextConfig.cacheLife,
      waitUntil: ctx.waitUntil,
      onClose: (cb) => {
        res.on('close', cb)
      },
      onAfterTaskError: undefined,
      onInstrumentationRequestError: (error, _request, errorContext) =>
        routeModule.onRequestError(
          req,
          error,
          errorContext,
          routerServerContext
        ),
    },
    sharedContext: {
      buildId,
    },
  }
  const nodeNextReq = new NodeNextRequest(req)
  const nodeNextRes = new NodeNextResponse(res)

  const nextReq = NextRequestAdapter.fromNodeNextRequest(
    nodeNextReq,
    signalFromNodeResponse(res)
  )

  try {
    const invokeRouteModule = async (span?: Span) => {
      return routeModule.handle(nextReq, context).finally(() => {
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

    const handleResponse = async (currentSpan?: Span) => {
      const responseGenerator: ResponseGenerator = async ({
        previousCacheEntry,
      }) => {
        try {
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

          const response = await invokeRouteModule(currentSpan)

          ;(req as any).fetchMetrics = (context.renderOpts as any).fetchMetrics
          let pendingWaitUntil = context.renderOpts.pendingWaitUntil

          // Attempt using provided waitUntil if available
          // if it's not we fallback to sendResponse's handling
          if (pendingWaitUntil) {
            if (ctx.waitUntil) {
              ctx.waitUntil(pendingWaitUntil)
              pendingWaitUntil = undefined
            }
          }
          const cacheTags = context.renderOpts.collectedTags

          // If the request is for a static response, we can cache it so long
          // as it's not edge.
          if (isIsr) {
            const blob = await response.blob()

            // Copy the headers from the response.
            const headers = toNodeOutgoingHttpHeaders(response.headers)

            if (cacheTags) {
              headers[NEXT_CACHE_TAGS_HEADER] = cacheTags
            }

            if (!headers['content-type'] && blob.type) {
              headers['content-type'] = blob.type
            }

            const revalidate =
              typeof context.renderOpts.collectedRevalidate === 'undefined' ||
              context.renderOpts.collectedRevalidate >= INFINITE_CACHE
                ? false
                : context.renderOpts.collectedRevalidate

            const expire =
              typeof context.renderOpts.collectedExpire === 'undefined' ||
              context.renderOpts.collectedExpire >= INFINITE_CACHE
                ? undefined
                : context.renderOpts.collectedExpire

            // Create the cache entry for the response.
            const cacheEntry: ResponseCacheEntry = {
              value: {
                kind: CachedRouteKind.APP_ROUTE,
                status: response.status,
                body: Buffer.from(await blob.arrayBuffer()),
                headers,
              },
              cacheControl: { revalidate, expire },
            }

            return cacheEntry
          } else {
            // send response without caching if not ISR
            await sendResponse(
              nodeNextReq,
              nodeNextRes,
              response,
              context.renderOpts.pendingWaitUntil
            )
            return null
          }
        } catch (err) {
          // if this is a background revalidate we need to report
          // the request error here as it won't be bubbled
          if (previousCacheEntry?.isStale) {
            await routeModule.onRequestError(
              req,
              err,
              {
                routerKind: 'App Router',
                routePath: srcPage,
                routeType: 'route',
                revalidateReason: getRevalidateReason({
                  isStaticGeneration,
                  isOnDemandRevalidate,
                }),
              },
              routerServerContext
            )
          }
          throw err
        }
      }

      const cacheEntry = await routeModule.handleResponse({
        req,
        nextConfig,
        cacheKey,
        routeKind: RouteKind.APP_ROUTE,
        isFallback: false,
        prerenderManifest,
        isRoutePPREnabled: false,
        isOnDemandRevalidate,
        revalidateOnlyGenerated,
        responseGenerator,
        waitUntil: ctx.waitUntil,
      })

      // we don't create a cacheEntry for ISR
      if (!isIsr) {
        return null
      }

      if (cacheEntry?.value?.kind !== CachedRouteKind.APP_ROUTE) {
        throw new Error(
          `Invariant: app-route received invalid cache entry ${cacheEntry?.value?.kind}`
        )
      }

      if (!getRequestMeta(req, 'minimalMode')) {
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

      // Draft mode should never be cached
      if (isDraftMode) {
        res.setHeader(
          'Cache-Control',
          'private, no-cache, no-store, max-age=0, must-revalidate'
        )
      }

      const headers = fromNodeOutgoingHttpHeaders(cacheEntry.value.headers)

      if (!(getRequestMeta(req, 'minimalMode') && isIsr)) {
        headers.delete(NEXT_CACHE_TAGS_HEADER)
      }

      // If cache control is already set on the response we don't
      // override it to allow users to customize it via next.config
      if (
        cacheEntry.cacheControl &&
        !res.getHeader('Cache-Control') &&
        !headers.get('Cache-Control')
      ) {
        headers.set(
          'Cache-Control',
          getCacheControlHeader(cacheEntry.cacheControl)
        )
      }

      await sendResponse(
        nodeNextReq,
        nodeNextRes,
        // @ts-expect-error - Argument of type 'Buffer<ArrayBufferLike>' is not assignable to parameter of type 'BodyInit | null | undefined'.
        new Response(cacheEntry.value.body, {
          headers,
          status: cacheEntry.value.status || 200,
        })
      )
      return null
    }

    // TODO: activeSpan code path is for when wrapped by
    // next-server can be removed when this is no longer used
    if (activeSpan) {
      await handleResponse(activeSpan)
    } else {
      await tracer.withPropagatedContext(req.headers, () =>
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
      await routeModule.onRequestError(req, err, {
        routerKind: 'App Router',
        routePath: normalizedSrcPage,
        routeType: 'route',
        revalidateReason: getRevalidateReason({
          isStaticGeneration,
          isOnDemandRevalidate,
        }),
      })
    }

    // rethrow so that we can handle serving error page

    // If this is during static generation, throw the error again.
    if (isIsr) throw err

    // Otherwise, send a 500 response.
    await sendResponse(
      nodeNextReq,
      nodeNextRes,
      new Response(null, { status: 500 })
    )
    return null
  }
}
