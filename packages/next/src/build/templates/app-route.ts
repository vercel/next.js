import {
  AppRouteRouteModule,
  type AppRouteRouteModuleOptions,
} from '../../server/route-modules/app-route/module.compiled'
import { RouteKind } from '../../server/route-kind'
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { addRequestMeta, setRequestMeta } from '../../server/request-meta'
import {
  getTracer,
  type Span,
  SpanKind,
  SpanStatusCode,
} from '../../server/lib/trace/tracer'
import { NodeNextRequest, NodeNextResponse } from '../../server/base-http/node'
import {
  NextRequestAdapter,
  signalFromNodeResponse,
  signalFromNodeUpgradeSocket,
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
import { isWebSocketUpgradeResponse } from '../../server/web/spec-extension/websocket-upgrade-response'
import { createWebSocketUpgradeFallbackResponse } from '../../server/web/spec-extension/websocket-upgrade-fallback'
import type {
  AppRouteHandlerContext,
  AppRouteWebSocketEntrypoint,
} from '../../server/route-modules/app-route/websocket-runtime.external'

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
  // The lazy require factory ensures that:
  // - In dev: devRequestTimingInternalsEnd is set before userland executes,
  //   correctly attributing module load time to application-code rather than
  //   framework internals.
  // - In all modes: async modules (route files with top-level await) are
  //   handled correctly — require() returns a Promise for such modules, which
  //   ensureUserland() awaits before the first request is handled.
  userland: () => require('VAR_USERLAND') as typeof import('VAR_USERLAND'),
  // In Turbopack dev mode, also provide a synchronous per-request getter so
  // server HMR updates are picked up without re-executing the entry chunk.
  // require() stays synchronous for ordinary modules. An async module with
  // top-level await returns its live Promise so the request owns one exact
  // generation while it resolves.
  ...(process.env.TURBOPACK && process.env.__NEXT_DEV_SERVER
    ? {
        getUserland: () =>
          require('VAR_USERLAND') as typeof import('VAR_USERLAND'),
      }
    : {}),
})

let upgradeHandler: AppRouteWebSocketEntrypoint['upgradeHandler']
// Keep this compile-time if/else around the require so Edge and disabled
// bundles cannot trace the Node-only transport.
if (process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS) {
  let webSocketEntrypoint: AppRouteWebSocketEntrypoint | undefined

  const createWebSocketEntrypoint = () => {
    let srcPage = 'VAR_DEFINITION_PAGE'
    if (process.env.TURBOPACK) {
      srcPage = srcPage.replace(/\/index$/, '') || '/'
    } else if (srcPage === '/index') {
      srcPage = '/'
    }

    const { createAppRouteWebSocketEntrypoint } =
      require('../../server/route-modules/app-route/websocket-runtime.external') as typeof import('../../server/route-modules/app-route/websocket-runtime.external')
    return createAppRouteWebSocketEntrypoint({
      routeModule,
      srcPage,
      multiZoneDraftMode: Boolean(process.env.__NEXT_MULTI_ZONE_DRAFT_MODE),
      createNextRequest(req, socket) {
        return NextRequestAdapter.fromNodeNextRequest(
          new NodeNextRequest(req),
          signalFromNodeUpgradeSocket(socket)
        )
      },
    })
  }

  upgradeHandler = (ctx, transport) =>
    (webSocketEntrypoint ??= createWebSocketEntrypoint()).upgradeHandler(
      ctx,
      transport
    )
} else {
  upgradeHandler = (_ctx, transport) => {
    const socket = transport?.node?.socket
    if (
      socket &&
      !socket.destroyed &&
      !socket.writableEnded &&
      !socket.readableEnded
    ) {
      socket.end(
        'HTTP/1.1 500 Internal Server Error\r\n' +
          'Connection: close\r\n' +
          'Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate\r\n' +
          'Content-Length: 0\r\n' +
          '\r\n'
      )
      return Promise.resolve({ statusCode: 500, upgraded: false })
    }
    return Promise.resolve({ upgraded: false })
  }
}

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
  upgradeHandler,
}
export type {
  AppRouteHandlerContext,
  AppRouteUpgradeHandlerTransport,
  AppRouteUpgradeOutcome,
} from '../../server/route-modules/app-route/websocket-runtime.external'

export async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: AppRouteHandlerContext
) {
  if (ctx.requestMeta) {
    setRequestMeta(req, ctx.requestMeta)
  }
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

  const preparation = await routeModule.prepareNodeRequest(req, res, {
    srcPage,
    multiZoneDraftMode,
  })

  if (!preparation) {
    res.statusCode = 400
    res.end('Bad Request')
    ctx.waitUntil?.(Promise.resolve())
    return null
  }

  const { prepareResult, normalizedSrcPage, isIsr } = preparation
  const {
    nextConfig,
    parsedUrl,
    isDraftMode,
    prerenderManifest,
    routerServerContext,
    isOnDemandRevalidate,
    revalidateOnlyGenerated,
    resolvedPathname,
  } = prepareResult

  const render404 = async () => {
    // TODO: should route-module itself handle rendering the 404
    if (routerServerContext?.render404) {
      await routerServerContext.render404(req, res, parsedUrl, false)
    } else {
      res.end('This page could not be found')
    }
    return null
  }

  if (isIsr && !isDraftMode) {
    const isPrerendered = Boolean(prerenderManifest.routes[resolvedPathname])
    const prerenderInfo = prerenderManifest.dynamicRoutes[normalizedSrcPage]

    if (prerenderInfo) {
      if (prerenderInfo.fallback === false && !isPrerendered) {
        if (nextConfig.adapterPath) {
          return await render404()
        }
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

  const method = req.method || 'GET'
  const tracer = getTracer()
  const activeSpan = tracer.getActiveScopeSpan()
  const isWrappedByNextServer = Boolean(
    routerServerContext?.isWrappedByNextServer
  )

  const { context, isMinimalMode } = await routeModule.createNodeRequestContext(
    req,
    srcPage,
    prepareResult,
    {
      waitUntil: ctx.waitUntil,
      onClose(callback) {
        res.on('close', callback)
      },
      onAfterTaskError: undefined,
    }
  )
  const nodeNextReq = new NodeNextRequest(req)
  const nodeNextRes = new NodeNextResponse(res)

  const nextReq = NextRequestAdapter.fromNodeNextRequest(
    nodeNextReq,
    signalFromNodeResponse(res)
  )

  const responseGenerator: ResponseGenerator = async ({
    previousCacheEntry,
  }) => {
    try {
      if (
        !isMinimalMode &&
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

      let response =
        cacheKey === null
          ? await routeModule.handle(nextReq, context)
          : await routeModule.prerender(nextReq, context)

      if (isWebSocketUpgradeResponse(response)) {
        if (!process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS) {
          throw new Error(
            'This App Route returned NextResponse.upgrade(), but experimental.webSocketRouteHandlers is not enabled in next.config.js.'
          )
        }
        response = createWebSocketUpgradeFallbackResponse(
          response,
          fromNodeOutgoingHttpHeaders(res.getHeaders())
        )
        for (const name of res.getHeaderNames()) res.removeHeader(name)
      }

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
            ? // Fall back to the global `expireTime` config when the
              // route has a numeric `revalidate` but didn't declare an
              // explicit `expire` (e.g. via `cacheLife`). This mirrors the
              // build-time fallback in `build/index.ts` so cache entries
              // and the response Cache-Control header agree on the route's
              // effective expire. Routes that opt out of revalidation
              // (`revalidate: false`) or that are dynamic (`revalidate: 0`)
              // keep `expire: undefined`.
              revalidate !== false && revalidate > 0
              ? nextConfig.expireTime
              : undefined
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
        await sendResponse(nodeNextReq, nodeNextRes, response, pendingWaitUntil)
        return null
      }
    } catch (err) {
      // if this is a background revalidate we need to report
      // the request error here as it won't be bubbled
      if (previousCacheEntry?.isStale) {
        const silenceLog = false
        await routeModule.onRequestError(
          req,
          err,
          {
            routerKind: 'App Router',
            routePath: srcPage,
            routeType: 'route',
            revalidateReason: getRevalidateReason({
              isStaticGeneration: cacheKey !== null,
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

  const handleResponse = async (
    currentSpan: Span | undefined,
    parentSpan: Span | undefined
  ) => {
    try {
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
        isMinimalMode,
      })

      // we don't create a cacheEntry for ISR
      if (!isIsr) {
        return
      }

      if (cacheEntry?.value?.kind !== CachedRouteKind.APP_ROUTE) {
        throw new Error(
          `Invariant: app-route received invalid cache entry ${cacheEntry?.value?.kind}`
        )
      }

      if (!isMinimalMode) {
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

      if (!(isMinimalMode && isIsr)) {
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
      return
    } catch (err) {
      if (!(err instanceof NoFallbackError)) {
        const silenceLog = false
        await routeModule.onRequestError(
          req,
          err,
          {
            routerKind: 'App Router',
            routePath: normalizedSrcPage,
            routeType: 'route',
            revalidateReason: getRevalidateReason({
              isStaticGeneration: cacheKey !== null,
              isOnDemandRevalidate,
            }),
          },
          silenceLog,
          routerServerContext
        )
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
      return
    } finally {
      ;(() => {
        if (!currentSpan) {
          return
        }

        let statusCode = res.statusCode

        currentSpan.setAttributes({
          'http.status_code': statusCode,
          'next.rsc': false,
        })

        if (statusCode && statusCode >= 500) {
          // For 5xx status codes: SHOULD be set to 'Error' span status.
          // x-ref: https://opentelemetry.io/docs/specs/semconv/http/http-spans/#status
          currentSpan.setStatus({
            code: SpanStatusCode.ERROR,
          })
          // For span status 'Error', SHOULD set 'error.type' attribute.
          currentSpan.setAttribute('error.type', statusCode.toString())
        }

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

        currentSpan.setAttributes({
          'next.route': route,
          'http.route': route,
          'next.span_name': name,
        })
        currentSpan.updateName(name)

        // Propagate http.route to the parent span if one exists (e.g.
        // a platform-created HTTP span in adapter deployments).
        if (parentSpan && parentSpan !== currentSpan) {
          parentSpan.setAttribute('http.route', route)
          parentSpan.updateName(name)
        }
      })()
    }
  }

  // TODO: activeSpan code path is for when wrapped by
  // next-server can be removed when this is no longer used
  if (isWrappedByNextServer && activeSpan) {
    await handleResponse(activeSpan, undefined)
  } else {
    let parentSpan = tracer.getActiveScopeSpan()
    await tracer.withPropagatedContext(
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
          (span) => handleResponse(span, parentSpan)
        ),
      undefined,
      !isWrappedByNextServer
    )
  }
}
