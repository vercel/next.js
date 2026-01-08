import '../../server/web/globals'
import {
  adapter,
  type EdgeHandler,
  type NextRequestHint,
} from '../../server/web/adapter'
import { IncrementalCache } from '../../server/lib/incremental-cache'

import * as pageMod from 'VAR_USERLAND'

import { setManifestsSingleton } from '../../server/app-render/manifests-singleton'
import { initializeCacheHandlers } from '../../server/use-cache/handlers'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import { getTracer, SpanKind, type Span } from '../../server/lib/trace/tracer'
import { WebNextRequest, WebNextResponse } from '../../server/base-http/web'
import type { NextFetchEvent } from '../../server/web/spec-extension/fetch-event'
import type {
  AppPageRouteHandlerContext,
  AppPageRouteModule,
} from '../../server/route-modules/app-page/module.compiled'
import type { AppPageRenderResultMetadata } from '../../server/render-result'
import type RenderResult from '../../server/render-result'
import { getIsPossibleServerAction } from '../../server/lib/server-action-request-meta'
import { getBotType } from '../../shared/lib/router/utils/is-bot'
import { interopDefault } from '../../lib/interop-default'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { checkIsOnDemandRevalidate } from '../../server/api-utils'
import { CloseController } from '../../server/web/web-on-close'
import { parseMaxPostponedStateSize } from '../../shared/lib/size-limit'
import { toNodeOutgoingHttpHeaders } from '../../server/web/utils'
import type { RequestMeta } from '../../server/request-meta'

declare const incrementalCacheHandler: any
// OPTIONAL_IMPORT:incrementalCacheHandler

const maybeJSONParse = (str?: string) => (str ? JSON.parse(str) : undefined)

const rscManifest = self.__RSC_MANIFEST?.['VAR_PAGE']
const rscServerManifest = maybeJSONParse(self.__RSC_SERVER_MANIFEST)

if (rscManifest && rscServerManifest) {
  setManifestsSingleton({
    page: 'VAR_PAGE',
    clientReferenceManifest: rscManifest,
    serverActionsManifest: rscServerManifest,
  })
}

export const ComponentMod = pageMod

async function requestHandler(
  req: NextRequestHint,
  event: NextFetchEvent
): Promise<Response> {
  let srcPage = 'VAR_PAGE'

  const normalizedSrcPage = normalizeAppPath(srcPage)
  const relativeUrl = `${req.nextUrl.pathname}${req.nextUrl.search}`
  const baseReq = new WebNextRequest(req)
  const baseRes = new WebNextResponse(undefined)

  const pageRouteModule = pageMod.routeModule as AppPageRouteModule
  const prepareResult = await pageRouteModule.prepare(baseReq, null, {
    srcPage,
    multiZoneDraftMode: false,
  })

  if (!prepareResult) {
    return new Response('Bad Request', {
      status: 400,
    })
  }
  const {
    query,
    params,
    buildId,
    nextConfig,
    buildManifest,
    prerenderManifest,
    reactLoadableManifest,
    subresourceIntegrityManifest,
    dynamicCssManifest,
    nextFontManifest,
    resolvedPathname,
    interceptionRoutePatterns,
    routerServerContext,
    deploymentId,
  } = prepareResult

  // Initialize the cache handlers interface.
  initializeCacheHandlers(nextConfig.cacheMaxMemorySize)

  const isPossibleServerAction = getIsPossibleServerAction(req)
  const botType = getBotType(req.headers.get('User-Agent') || '')
  const { isOnDemandRevalidate } = checkIsOnDemandRevalidate(
    req,
    prerenderManifest.preview
  )

  const closeController = new CloseController()

  const renderContext: AppPageRouteHandlerContext = {
    page: normalizedSrcPage,
    query,
    params,

    sharedContext: {
      buildId,
    },
    fallbackRouteParams: null,

    renderOpts: {
      App: () => null,
      Document: () => null,
      pageConfig: {},
      ComponentMod,
      Component: interopDefault(ComponentMod),
      routeModule: pageRouteModule,

      params,
      page: srcPage,
      postponed: undefined,
      shouldWaitOnAllReady: false,
      serveStreamingMetadata: true,
      supportsDynamicResponse: true,
      buildManifest,
      nextFontManifest,
      reactLoadableManifest,
      subresourceIntegrityManifest,
      dynamicCssManifest,
      setIsrStatus: routerServerContext?.setIsrStatus,

      dir: pageRouteModule.relativeProjectDir,
      botType,
      isDraftMode: false,
      isOnDemandRevalidate,
      isPossibleServerAction,
      assetPrefix: nextConfig.assetPrefix,
      nextConfigOutput: nextConfig.output,
      crossOrigin: nextConfig.crossOrigin,
      trailingSlash: nextConfig.trailingSlash,
      images: nextConfig.images,
      previewProps: prerenderManifest.preview,
      deploymentId,
      enableTainting: nextConfig.experimental.taint,
      htmlLimitedBots: nextConfig.htmlLimitedBots,
      reactMaxHeadersLength: nextConfig.reactMaxHeadersLength,

      multiZoneDraftMode: false,
      cacheLifeProfiles: nextConfig.cacheLife,
      basePath: nextConfig.basePath,
      serverActions: nextConfig.experimental.serverActions,
      cacheComponents: Boolean(nextConfig.cacheComponents),
      experimental: {
        isRoutePPREnabled: false,
        expireTime: nextConfig.expireTime,
        staleTimes: nextConfig.experimental.staleTimes,
        dynamicOnHover: Boolean(nextConfig.experimental.dynamicOnHover),
        inlineCss: Boolean(nextConfig.experimental.inlineCss),
        authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
        clientTraceMetadata:
          nextConfig.experimental.clientTraceMetadata || ([] as any),
        clientParamParsingOrigins:
          nextConfig.experimental.clientParamParsingOrigins,
        maxPostponedStateSizeBytes: parseMaxPostponedStateSize(
          nextConfig.experimental.maxPostponedStateSize
        ),
      },

      incrementalCache: await pageRouteModule.getIncrementalCache(
        baseReq,
        nextConfig,
        prerenderManifest,
        true
      ),

      waitUntil: event.waitUntil.bind(event),
      onClose: (cb) => {
        closeController.onClose(cb)
      },
      onAfterTaskError: () => {},

      onInstrumentationRequestError: (
        error,
        _request,
        errorContext,
        silenceLog
      ) =>
        pageRouteModule.onRequestError(
          baseReq,
          error,
          errorContext,
          silenceLog,
          routerServerContext
        ),
      dev: pageRouteModule.isDev,
    },
  }
  let finalStatus = 200

  const renderResultToResponse = (
    result: RenderResult<AppPageRenderResultMetadata>
  ): Response => {
    const varyHeader = pageRouteModule.getVaryHeader(
      resolvedPathname,
      interceptionRoutePatterns
    )
    // Handle null responses
    if (result.isNull) {
      finalStatus = 500
      closeController.dispatchClose()
      return new Response(null, { status: 500 })
    }

    // Extract metadata
    const { metadata } = result
    const headers = new Headers()
    finalStatus = metadata.statusCode || baseRes.statusCode || 200
    // Pull any fetch metrics from the render onto the request.
    ;(req as any).fetchMetrics = metadata.fetchMetrics

    // Set content type
    const contentType = result.contentType || 'text/html; charset=utf-8'
    headers.set('Content-Type', contentType)
    headers.set('x-edge-runtime', '1')

    if (varyHeader) {
      headers.set('Vary', varyHeader)
    }

    // Add existing headers
    for (const [key, value] of Object.entries({
      ...baseRes.getHeaders(),
      ...metadata.headers,
    })) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          // Handle multiple header values
          for (const v of value) {
            headers.append(key, String(v))
          }
        } else {
          headers.set(key, String(value))
        }
      }
    }

    // Handle static response
    if (!result.isDynamic) {
      const body = result.toUnchunkedString()
      headers.set(
        'Content-Length',
        String(new TextEncoder().encode(body).length)
      )
      closeController.dispatchClose()
      return new Response(body, {
        status: finalStatus,
        headers,
      })
    }

    // Handle dynamic/streaming response
    // For edge runtime, we need to create a readable stream that pipes from the result
    const { readable, writable } = new TransformStream()

    // Start piping the result to the writable stream
    // This is done asynchronously to avoid blocking the response creation
    result
      .pipeTo(writable)
      .catch((err: unknown) => {
        console.error('Error piping RenderResult to response:', err)
      })
      .finally(() => closeController.dispatchClose())

    return new Response(readable, {
      status: finalStatus,
      headers,
    })
  }

  const invokeRender = async (span?: Span): Promise<Response> => {
    try {
      const result = await pageRouteModule
        .render(baseReq, baseRes, renderContext)
        .finally(() => {
          if (!span) return

          span.setAttributes({
            'http.status_code': finalStatus,
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

          const route = normalizedSrcPage
          if (route) {
            const name = `${req.method} ${route}`

            span.setAttributes({
              'next.route': route,
              'http.route': route,
              'next.span_name': name,
            })
            span.updateName(name)
          } else {
            span.updateName(`${req.method} ${srcPage}`)
          }
        })

      return renderResultToResponse(result)
    } catch (err) {
      const silenceLog = false
      await pageRouteModule.onRequestError(
        baseReq,
        err,
        {
          routerKind: 'App Router',
          routePath: normalizedSrcPage,
          routeType: 'render',
          revalidateReason: undefined,
        },
        silenceLog
      )
      // rethrow so that we can handle serving error page
      throw err
    }
  }

  const tracer = getTracer()

  return tracer.withPropagatedContext(req.headers, () =>
    tracer.trace(
      BaseServerSpan.handleRequest,
      {
        spanName: `${req.method} ${srcPage}`,
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': req.method,
          'http.target': relativeUrl,
          'http.route': normalizedSrcPage,
        },
      },
      invokeRender
    )
  )
}

const internalHandler: EdgeHandler = (opts) => {
  return adapter({
    ...opts,
    IncrementalCache,
    handler: requestHandler,
    incrementalCacheHandler,
    page: 'VAR_PAGE',
  })
}

export async function handler(
  request: Request,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
    signal?: AbortSignal
    requestMeta?: RequestMeta
  }
): Promise<Response> {
  const result = await internalHandler({
    request: {
      url: request.url,
      method: request.method,
      headers: toNodeOutgoingHttpHeaders(request.headers),
      nextConfig: {
        basePath: process.env.__NEXT_BASE_PATH,
        i18n: process.env.__NEXT_I18N_CONFIG as any,
        trailingSlash: Boolean(process.env.__NEXT_TRAILING_SLASH),
        experimental: {
          cacheLife: process.env.__NEXT_CACHE_LIFE as any,
          authInterrupts: Boolean(
            process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS
          ),
          clientParamParsingOrigins: process.env
            .__NEXT_CLIENT_PARAM_PARSING_ORIGINS as any,
        },
      },
      page: {
        name: 'VAR_PAGE',
      },
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? (request.body ?? undefined)
          : undefined,
      waitUntil: ctx.waitUntil,
      requestMeta: ctx.requestMeta,
      signal: ctx.signal || new AbortController().signal,
    },
  })

  ctx.waitUntil?.(result.waitUntil)

  return result.response
}

// backwards compat
export default internalHandler
