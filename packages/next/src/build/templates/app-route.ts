import {
  AppRouteRouteModule,
  type AppRouteRouteHandlerContext,
  type AppRouteRouteModuleOptions,
} from '../../server/route-modules/app-route/module.compiled'
import { RouteKind } from '../../server/route-kind'
import { patchFetch as _patchFetch } from '../../server/lib/patch-fetch'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import {
  addRequestMeta,
  getRequestMeta,
  setRequestMeta,
  type RequestMeta,
} from '../../server/request-meta'
import {
  getTracer,
  type Span,
  SpanKind,
  SpanStatusCode,
} from '../../server/lib/trace/tracer'
import { setManifestsSingleton } from '../../server/app-render/manifests-singleton'
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
import type { WebSocketUpgradeTransport } from '../../server/websocket-upgrade'
import { isWebSocketUpgradeResponse } from '../../server/web/spec-extension/response'
import {
  registerWebSocketPeer,
  unregisterWebSocketPeer,
} from '../../server/websocket-connection-registry'

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
  // Using require() (synchronous) avoids adding async overhead that would be
  // incorrectly attributed to application-code time in devRequestTiming.
  ...(process.env.TURBOPACK && process.env.__NEXT_DEV_SERVER
    ? {
        getUserland: () =>
          require('VAR_USERLAND') as typeof import('VAR_USERLAND'),
      }
    : {}),
})

type WriteRawHttpError =
  typeof import('../../server/websocket-upgrade').writeRawHttpError
type WriteRawHttpResponse =
  typeof import('../../server/websocket-upgrade').writeRawHttpResponse
type MockedResponseConstructor =
  typeof import('../../server/lib/mock-request').MockedResponse

let writeRawHttpError: WriteRawHttpError
let writeRawHttpResponse: WriteRawHttpResponse
let webSocketUpgradeTransport: WebSocketUpgradeTransport | undefined
let MockedResponse: MockedResponseConstructor
if (process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS) {
  const websocketUpgrade =
    require('../../server/websocket-upgrade') as typeof import('../../server/websocket-upgrade')
  const mockRequest =
    require('../../server/lib/mock-request') as typeof import('../../server/lib/mock-request')

  writeRawHttpError = websocketUpgrade.writeRawHttpError
  writeRawHttpResponse = websocketUpgrade.writeRawHttpResponse
  webSocketUpgradeTransport = websocketUpgrade.createWebSocketUpgradeTransport({
    registerPeer: (peer) =>
      registerWebSocketPeer('VAR_DEFINITION_BUNDLE_PATH', peer),
    unregisterPeer: (peer) =>
      unregisterWebSocketPeer('VAR_DEFINITION_BUNDLE_PATH', peer),
  })
  MockedResponse = mockRequest.MockedResponse
} else {
  writeRawHttpError = async function writeRawHttpErrorUnsupported(
    _req: IncomingMessage,
    socket: Duplex,
    _status: number,
    _message: string
  ): Promise<void> {
    if (!socket.destroyed && !socket.writableEnded) {
      socket.end()
    }
  }
  writeRawHttpResponse = async function writeRawHttpResponseUnsupported(
    _req: IncomingMessage,
    socket: Duplex,
    _response: Response
  ): Promise<void> {
    if (!socket.destroyed && !socket.writableEnded) {
      socket.end()
    }
  }
  webSocketUpgradeTransport = undefined
  MockedResponse = class MockedResponseUnsupported {
    constructor() {
      throw new Error(
        'WebSocket Route Handlers are unavailable because experimental.webSocketRouteHandlers is not enabled.'
      )
    }
  } as unknown as MockedResponseConstructor
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
}

export interface AppRouteHandlerContext {
  waitUntil?: (prom: Promise<void>) => void
  requestMeta?: RequestMeta
  responseHeaders?: Record<string, string | string[]>
}

export interface AppRouteUpgradeHandlerTransport {
  node: {
    req: IncomingMessage
    socket: Duplex
    head: Buffer
  }
}

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
    deploymentId,
    params,
    nextConfig,
    parsedUrl,
    isDraftMode,
    prerenderManifest,
    routerServerContext,
    isOnDemandRevalidate,
    revalidateOnlyGenerated,
    resolvedPathname,
    clientReferenceManifest,
    serverActionsManifest,
    previewProps,
  } = prepareResult

  const normalizedSrcPage = normalizeAppPath(srcPage)

  let isIsr = Boolean(
    prerenderManifest.dynamicRoutes[normalizedSrcPage] ||
      prerenderManifest.routes[resolvedPathname]
  )

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
  const isMinimalMode = Boolean(getRequestMeta(req, 'minimalMode'))

  const incrementalCache =
    getRequestMeta(req, 'incrementalCache') ||
    (await routeModule.getIncrementalCache(
      req,
      nextConfig,
      previewProps,
      prerenderManifest,
      isMinimalMode
    ))

  incrementalCache?.resetRequestCache()
  ;(globalThis as any).__incrementalCache = incrementalCache

  const context: AppRouteRouteHandlerContext = {
    params,
    previewProps,
    renderOpts: {
      experimental: {
        authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
        useCacheTimeout: nextConfig.experimental.useCacheTimeout,
        durableUseCacheEntries: Boolean(
          nextConfig.experimental.durableUseCacheEntries
        ),
      },
      cacheComponents: Boolean(nextConfig.cacheComponents),
      validationLevel: nextConfig.experimental.instantInsights.validationLevel,
      isDraftMode,
      incrementalCache,
      hmrRefreshHash: getRequestMeta(req, 'hmrRefreshHash'),
      cacheLifeProfiles: nextConfig.cacheLife,
      staticPageGenerationTimeout: nextConfig.staticPageGenerationTimeout,
      waitUntil: ctx.waitUntil,
      onClose: (cb) => {
        res.on('close', cb)
      },
      onAfterTaskError: undefined,
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
    },
    sharedContext: {
      buildId,
      deploymentId,
    },
  }
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
        const headers = new Headers(response.headers)
        headers.set('Upgrade', 'websocket')
        response = new Response(
          'This route only accepts WebSocket upgrade requests.',
          { status: 426, headers }
        )
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
        previewProps,
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

/**
 * Adapter-facing entrypoint for requests delivered by Node's `upgrade` event.
 * The App Route GET handler is invoked exactly once and its returned response
 * determines whether the connection is accepted or receives an ordinary HTTP
 * response.
 */
export async function upgradeHandler(
  ctx: AppRouteHandlerContext,
  transport: AppRouteUpgradeHandlerTransport
): Promise<void> {
  const node = transport?.node
  const req = node?.req
  const socket = node?.socket
  const head = node?.head
  const message =
    'WebSocket Route Handlers require the Node.js upgrade transport namespace with raw upgrade primitives and persistent sockets.'

  if (
    !socket ||
    typeof socket.write !== 'function' ||
    socket.destroyed ||
    socket.writableEnded
  ) {
    console.error(message)
    return
  }

  if (!req || !Buffer.isBuffer(head)) {
    console.error(message)
    await writeRawHttpError(
      (req || { method: 'GET' }) as IncomingMessage,
      socket,
      501,
      message
    )
    return
  }

  try {
    await upgradeHandlerImpl(req, socket, head, ctx)
  } catch (error) {
    console.error('Error handling App Route WebSocket upgrade', error)
    if (!socket.destroyed && !socket.writableEnded) {
      await writeRawHttpError(req, socket, 500, 'Internal Server Error')
    }
  }
}

async function upgradeHandlerImpl(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  ctx: AppRouteHandlerContext
): Promise<void> {
  if (!process.env.__NEXT_EXPERIMENTAL_WEBSOCKET_ROUTE_HANDLERS) {
    const message =
      'WebSocket Route Handlers are unavailable because experimental.webSocketRouteHandlers is not enabled.'
    console.error(message)
    await writeRawHttpError(req, socket, 501, message)
    return
  }

  if (!webSocketUpgradeTransport) {
    const message = 'WebSocket Route Handlers are unavailable in this runtime.'
    console.error(message)
    await writeRawHttpError(req, socket, 501, message)
    return
  }

  if (ctx.requestMeta) {
    setRequestMeta(req, ctx.requestMeta)
  }
  if (routeModule.isDev) {
    addRequestMeta(req, 'devRequestTimingInternalsEnd', process.hrtime.bigint())
  }

  let srcPage = 'VAR_DEFINITION_PAGE'
  if (process.env.TURBOPACK) {
    srcPage = srcPage.replace(/\/index$/, '') || '/'
  } else if (srcPage === '/index') {
    srcPage = '/'
  }

  const multiZoneDraftMode = process.env
    .__NEXT_MULTI_ZONE_DRAFT_MODE as any as boolean
  const mockedRes = new MockedResponse({ socket: socket as Socket })
  const prepareResult = await routeModule.prepare(req, mockedRes, {
    srcPage,
    multiZoneDraftMode,
  })

  if (!prepareResult) {
    await writeRawHttpError(req, socket, 400, 'Bad Request')
    return
  }

  const {
    buildId,
    deploymentId,
    params,
    nextConfig,
    prerenderManifest,
    routerServerContext,
    clientReferenceManifest,
    serverActionsManifest,
  } = prepareResult

  if (serverActionsManifest && clientReferenceManifest) {
    setManifestsSingleton({
      page: srcPage,
      clientReferenceManifest,
      serverActionsManifest,
    })
  }

  const normalizedSrcPage = normalizeAppPath(srcPage)
  const isMinimalMode = Boolean(getRequestMeta(req, 'minimalMode'))
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

  const context: AppRouteRouteHandlerContext = {
    params,
    previewProps: prerenderManifest.preview,
    renderOpts: {
      experimental: {
        authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
        useCacheTimeout: nextConfig.experimental.useCacheTimeout,
      },
      cacheComponents: Boolean(nextConfig.cacheComponents),
      validationLevel: nextConfig.experimental.instantInsights.validationLevel,
      supportsDynamicResponse: true,
      incrementalCache,
      cacheLifeProfiles: nextConfig.cacheLife,
      staticPageGenerationTimeout: nextConfig.staticPageGenerationTimeout,
      waitUntil: ctx.waitUntil,
      onClose: (callback) => socket.once('close', callback),
      onAfterTaskError: undefined,
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
    },
    sharedContext: { buildId, deploymentId },
  }

  const nextReq = NextRequestAdapter.fromNodeNextRequest(
    new NodeNextRequest(req),
    signalFromNodeResponse(socket)
  )
  const tracer = getTracer()
  const method = req.method || 'GET'

  const reportError = (error: unknown) =>
    routeModule.onRequestError(
      req,
      error,
      {
        routerKind: 'App Router',
        routePath: normalizedSrcPage,
        routeType: 'route',
        revalidateReason: getRevalidateReason({
          isStaticGeneration: false,
          isOnDemandRevalidate: false,
        }),
      },
      false,
      routerServerContext
    )

  try {
    const invokeRouteModule = async (span?: Span) =>
      routeModule.handle(nextReq, context).finally(() => {
        if (!span) return
        span.setAttributes({
          'http.status_code': mockedRes.statusCode,
          'next.rsc': false,
        })

        const route =
          tracer.getRootSpanAttributes()?.get('next.route') || normalizedSrcPage
        const name = `${method} ${route}`
        span.setAttributes({
          'next.route': route,
          'http.route': route,
          'next.span_name': name,
        })
        span.updateName(name)
      })

    const response = await tracer.withPropagatedContext(
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
          invokeRouteModule
        ),
      undefined,
      true
    )

    if (ctx.responseHeaders) {
      const routingHeaders = fromNodeOutgoingHttpHeaders(ctx.responseHeaders)
      routingHeaders.forEach((value, name) => {
        if (name.toLowerCase() === 'set-cookie') {
          response.headers.append(name, value)
        } else {
          response.headers.set(name, value)
        }
      })
    }

    ;(req as any).fetchMetrics = (context.renderOpts as any).fetchMetrics
    const pendingWaitUntil = context.renderOpts.pendingWaitUntil
    if (pendingWaitUntil && ctx.waitUntil) {
      ctx.waitUntil(pendingWaitUntil)
    }

    if (!isWebSocketUpgradeResponse(response)) {
      await writeRawHttpResponse(req, socket, response)
      return
    }

    await webSocketUpgradeTransport.handleUpgrade(
      req,
      socket,
      head,
      nextReq,
      response,
      {
        onHookError: reportError,
      }
    )
  } catch (error) {
    await reportError(error)
    if (!socket.destroyed && !socket.writableEnded) {
      await writeRawHttpError(req, socket, 500, 'Internal Server Error')
    }
  }
}
