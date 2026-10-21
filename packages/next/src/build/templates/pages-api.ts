import type { NextApiResponse } from '../../types'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { sendError } from '../../server/api-utils'
import { RouteKind } from '../../server/route-kind'
import type { Span } from '../../server/lib/trace/tracer'
import { PagesAPIRouteModule } from '../../server/route-modules/pages-api/module.compiled'

import { hoist } from './helpers'

// Import the userland code.
import * as userland from 'VAR_USERLAND'
import {
  getTracer,
  recordSpanError,
  SpanStatusCode,
} from '../../server/lib/trace/tracer'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import type { InstrumentationOnRequestError } from '../../server/instrumentation/types'
import {
  addRequestMeta,
  setRequestMeta,
  type RequestMeta,
} from '../../server/request-meta'

// Re-export the handler (should be the default export).
export default hoist(userland, 'default')

// Re-export config.
export const config = hoist(userland, 'config')

// Create and export the route module that will be consumed.
const routeModule = new PagesAPIRouteModule({
  definition: {
    kind: RouteKind.PAGES_API,
    page: 'VAR_DEFINITION_PAGE',
    pathname: 'VAR_DEFINITION_PATHNAME',
    // The following aren't used in production.
    bundlePath: '',
    filename: '',
  },
  userland,
  distDir: process.env.__NEXT_RELATIVE_DIST_DIR || '',
  relativeProjectDir: process.env.__NEXT_RELATIVE_PROJECT_DIR || '',
})

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
  let srcPage = 'VAR_DEFINITION_PAGE'

  // turbopack doesn't normalize `/index` in the page name
  // so we need to to process dynamic routes properly
  // TODO: fix turbopack providing differing value from webpack
  if (process.env.TURBOPACK) {
    srcPage = srcPage.replace(/\/index$/, '') || '/'
  }

  // Registering `instrumentation.ts` usually installs the tracer provider, so
  // do it before starting the request span. The span is started before
  // `prepare`, so route module preparation is part of the request's trace.
  await routeModule.ensureInstrumentation(req)
  return routeModule.traceRequest(
    req,
    {
      tracer: getTracer(),
      spanName: `${req.method || 'GET'} ${srcPage}`,
      httpTarget: req.url,
    },
    (requestSpan, requestRootSpan) =>
      handleRequest(req, res, ctx, srcPage, requestSpan, requestRootSpan)
  )
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
    requestMeta?: RequestMeta
  },
  srcPage: string,
  requestSpan: Span | undefined,
  requestRootSpan: Span | undefined
) {
  const prepareResult = await routeModule.prepare(req, res, { srcPage })

  if (!prepareResult) {
    res.statusCode = 400
    res.end('Bad Request')
    ctx.waitUntil?.(Promise.resolve())
    return
  }

  const { query, params, previewProps, routerServerContext } = prepareResult

  try {
    const method = req.method || 'GET'
    const tracer = getTracer()

    const isWrappedByNextServer = Boolean(
      routerServerContext?.isWrappedByNextServer
    )
    const onRequestError =
      routeModule.instrumentationOnRequestError.bind(routeModule)

    const invokeRouteModule = async (span?: Span) =>
      routeModule
        .render(req, res, {
          query: {
            ...query,
            ...params,
          },
          params,
          allowedRevalidateHeaderKeys: process.env
            .__NEXT_ALLOWED_REVALIDATE_HEADERS as any as string[],
          multiZoneDraftMode: Boolean(process.env.__NEXT_MULTI_ZONE_DRAFT_MODE),
          trustHostHeader: process.env
            .__NEXT_TRUST_HOST_HEADER as any as boolean,
          // TODO: get this from from runtime env so manifest
          // doesn't need to load
          previewProps,
          propagateError: false,
          dev: routeModule.isDev,
          page: 'VAR_DEFINITION_PAGE',

          internalRevalidate: routerServerContext?.revalidate,

          onError: (...args: Parameters<InstrumentationOnRequestError>) =>
            onRequestError(req, ...args),
        })
        .finally(() => {
          if (!span) return

          span.setAttributes({
            'http.status_code': res.statusCode,
            'next.rsc': false,
          })

          if (res.statusCode && res.statusCode >= 500) {
            // For 5xx status codes: SHOULD be set to 'Error' span status.
            // x-ref: https://opentelemetry.io/docs/specs/semconv/http/http-spans/#status
            span.setStatus({
              code: SpanStatusCode.ERROR,
            })
            // For span status 'Error', SHOULD set 'error.type' attribute.
            span.setAttribute('error.type', res.statusCode.toString())
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

          const route = rootSpanAttributes.get('next.route') || srcPage
          const name = `${method} ${route}`

          span.setAttributes({
            'next.route': route,
            'http.route': route,
            'next.span_name': name,
          })
          span.updateName(name)

          // Propagate http.route to the request's root span if it isn't the
          // request span (e.g. a platform-created HTTP span in adapter
          // deployments).
          if (requestRootSpan && requestRootSpan !== span) {
            requestRootSpan.setAttribute('http.route', route)
            requestRootSpan.updateName(name)
          }
        })

    // When invoked directly, the request span was started before `prepare`;
    // record the request target as normalized by it. next-server's request
    // span already has it.
    if (!isWrappedByNextServer && req.url !== undefined) {
      requestSpan?.setAttribute('http.target', req.url)
    }
    try {
      await invokeRouteModule(requestSpan)
    } catch (err) {
      // A request span started for a direct invocation outlives the error
      // handling below, which only rethrows in dev: record the error on the
      // span here otherwise.
      if (!isWrappedByNextServer && requestSpan && !routeModule.isDev) {
        recordSpanError(requestSpan, err as Error)
      }
      throw err
    }
  } catch (err) {
    // we re-throw in dev to show the error overlay
    if (routeModule.isDev) {
      throw err
    }
    // this is technically an invariant as error handling
    // should be done inside of api-resolver onError
    sendError(res as NextApiResponse, 500, 'Internal Server Error')
  } finally {
    // We don't allow any waitUntil work in pages API routes currently
    // so if callback is present return with resolved promise since no
    // pending work
    ctx.waitUntil?.(Promise.resolve())
  }
}
