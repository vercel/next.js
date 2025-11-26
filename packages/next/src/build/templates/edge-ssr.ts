import '../../server/web/globals'
import { adapter, type NextRequestHint } from '../../server/web/adapter'
import { IncrementalCache } from '../../server/lib/incremental-cache'
import { initializeCacheHandlers } from '../../server/use-cache/handlers'

import Document from 'VAR_MODULE_DOCUMENT'
import * as appMod from 'VAR_MODULE_APP'
import * as userlandPage from 'VAR_USERLAND'
import * as userlandErrorPage from 'VAR_MODULE_GLOBAL_ERROR'

declare const userland500Page: any
declare const incrementalCacheHandler: any
// OPTIONAL_IMPORT:* as userland500Page
// OPTIONAL_IMPORT:incrementalCacheHandler

import RouteModule, {
  type PagesRouteHandlerContext,
} from '../../server/route-modules/pages/module'
import { WebNextRequest, WebNextResponse } from '../../server/base-http/web'

import type { RequestData } from '../../server/web/types'
import type { NextConfigComplete } from '../../server/config-shared'
import type { NextFetchEvent } from '../../server/web/spec-extension/fetch-event'
import type RenderResult from '../../server/render-result'
import type { RenderResultMetadata } from '../../server/render-result'
import { getTracer, SpanKind, type Span } from '../../server/lib/trace/tracer'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import { HTML_CONTENT_TYPE_HEADER } from '../../lib/constants'

// injected by the loader afterwards.
declare const nextConfig: NextConfigComplete
declare const pageRouteModuleOptions: any
declare const errorRouteModuleOptions: any
declare const user500RouteModuleOptions: any
// INJECT:nextConfig
// INJECT:pageRouteModuleOptions
// INJECT:errorRouteModuleOptions
// INJECT:user500RouteModuleOptions

// Initialize the cache handlers interface.
initializeCacheHandlers(nextConfig.cacheMaxMemorySize)

// expose this for the route-module
;(globalThis as any).nextConfig = nextConfig

const pageMod = {
  ...userlandPage,
  routeModule: new RouteModule({
    ...pageRouteModuleOptions,
    components: {
      App: appMod.default,
      Document,
    },
    userland: userlandPage,
  }),
}

const errorMod = {
  ...userlandErrorPage,
  routeModule: new RouteModule({
    ...errorRouteModuleOptions,
    components: {
      App: appMod.default,
      Document,
    },
    userland: userlandErrorPage,
  }),
}

// FIXME: this needs to be made compatible with the template
const error500Mod = userland500Page
  ? {
      ...userland500Page,
      routeModule: new RouteModule({
        ...user500RouteModuleOptions,
        components: {
          App: appMod.default,
          Document,
        },
        userland: userland500Page,
      }),
    }
  : null

export const ComponentMod = pageMod

async function requestHandler(
  req: NextRequestHint,
  _event: NextFetchEvent
): Promise<Response> {
  let srcPage = 'VAR_PAGE'

  const relativeUrl = `${req.nextUrl.pathname}${req.nextUrl.search}`
  const baseReq = new WebNextRequest(req)
  const pageRouteModule = pageMod.routeModule as RouteModule
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
    isNextDataRequest,
    buildManifest,
    prerenderManifest,
    reactLoadableManifest,
    clientReferenceManifest,
    subresourceIntegrityManifest,
    dynamicCssManifest,
  } = prepareResult

  const renderContext: PagesRouteHandlerContext = {
    page: srcPage,
    query,
    params,

    sharedContext: {
      buildId,
      deploymentId: process.env.NEXT_DEPLOYMENT_ID,
      customServer: undefined,
    },

    renderContext: {
      isFallback: false,
      isDraftMode: false,
      developmentNotFoundSourcePage: undefined,
    },

    renderOpts: {
      params,
      page: srcPage,
      supportsDynamicResponse: true,
      Component: pageMod.Component,
      ComponentMod: pageMod,
      pageConfig: pageMod.pageConfig,
      routeModule: pageMod.routeModule,
      previewProps: prerenderManifest.preview,
      basePath: nextConfig.basePath,
      assetPrefix: nextConfig.assetPrefix,
      images: nextConfig.images,
      optimizeCss: nextConfig.experimental.optimizeCss,
      nextConfigOutput: nextConfig.output,
      nextScriptWorkers: nextConfig.experimental.nextScriptWorkers,
      disableOptimizedLoading: nextConfig.experimental.disableOptimizedLoading,
      domainLocales: nextConfig.i18n?.domains,
      distDir: '',
      crossOrigin: nextConfig.crossOrigin ? nextConfig.crossOrigin : undefined,
      largePageDataBytes: nextConfig.experimental.largePageDataBytes,

      isExperimentalCompile: nextConfig.experimental.isExperimentalCompile,
      // `htmlLimitedBots` is passed to server as serialized config in string format
      experimental: {
        clientTraceMetadata: nextConfig.experimental.clientTraceMetadata,
      },

      buildManifest,
      subresourceIntegrityManifest,
      reactLoadableManifest,
      clientReferenceManifest,
      dynamicCssManifest,
    },
  }
  let finalStatus = 200

  const renderResultToResponse = (
    result: RenderResult<RenderResultMetadata>
  ): Response => {
    // Handle null responses
    if (result.isNull) {
      finalStatus = 500
      return new Response(null, { status: 500 })
    }

    // Extract metadata
    const { metadata } = result
    finalStatus = metadata.statusCode || 200
    const headers = new Headers()

    // Set content type
    const contentType = result.contentType || HTML_CONTENT_TYPE_HEADER
    headers.set('Content-Type', contentType)

    // Add metadata headers
    if (metadata.headers) {
      for (const [key, value] of Object.entries(metadata.headers)) {
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
    }

    // Handle static response
    if (!result.isDynamic) {
      const body = result.toUnchunkedString()
      headers.set(
        'Content-Length',
        String(new TextEncoder().encode(body).length)
      )
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
    result.pipeTo(writable).catch((err) => {
      console.error('Error piping RenderResult to response:', err)
    })

    return new Response(readable, {
      status: finalStatus,
      headers,
    })
  }

  const invokeRender = async (span?: Span): Promise<Response> => {
    try {
      const result = await pageRouteModule
        .render(
          // @ts-expect-error we don't type this for edge
          baseReq,
          new WebNextResponse(undefined),
          {
            ...renderContext,
            renderOpts: {
              ...renderContext.renderOpts,
              getServerSideProps: pageMod.getServerSideProps,
              Component: pageMod.default || pageMod,
              ComponentMod: pageMod,
              pageConfig: pageMod.config,
              isNextDataRequest,
            },
          }
        )
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

          const route = rootSpanAttributes.get('next.route')
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
      const errModule = error500Mod || errorMod
      const errRouteModule = errModule.routeModule as RouteModule

      if (errRouteModule.isDev) {
        throw err
      }

      await errRouteModule.onRequestError(baseReq, err, {
        routerKind: 'Pages Router',
        routePath: srcPage,
        routeType: 'render',
        revalidateReason: undefined,
      })

      const errResult = await errRouteModule.render(
        // @ts-expect-error we don't type this for edge
        baseReq,
        new WebNextResponse(undefined),
        {
          ...renderContext,
          page: error500Mod ? '/500' : '/_error',
          renderOpts: {
            ...renderContext.renderOpts,
            getServerSideProps: errModule.getServerSideProps,
            Component: errModule.default || errModule,
            ComponentMod: errModule,
            pageConfig: errModule.config,
          },
        }
      )

      return renderResultToResponse(errResult)
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
          'http.route': srcPage,
        },
      },
      invokeRender
    )
  )
}

export default function nHandler(opts: { page: string; request: RequestData }) {
  return adapter({
    ...opts,
    IncrementalCache,
    handler: requestHandler,
    incrementalCacheHandler,
    bypassNextUrl: true,
  })
}
