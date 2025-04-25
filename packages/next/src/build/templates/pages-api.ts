import type { NextApiResponse } from '../../types'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { parse } from 'node:url'
import { RouteKind } from '../../server/route-kind'
import { sendError } from '../../server/api-utils'
import { PagesAPIRouteModule } from '../../server/route-modules/pages-api/module.compiled'

import { hoist } from './helpers'

// Import the userland code.
import * as userland from 'VAR_USERLAND'
import { getTracer, SpanKind } from '../../server/lib/trace/tracer'
import type { Span } from '../../server/lib/trace/tracer'
import { BaseServerSpan } from '../../server/lib/trace/constants'
import {
  ensureInstrumentationRegistered,
  instrumentationOnRequestError,
} from '../../server/lib/router-utils/instrumentation-globals.external'
import type { InstrumentationOnRequestError } from '../../server/instrumentation/types'
import { getUtils } from '../../server/server-utils'
import { PRERENDER_MANIFEST, ROUTES_MANIFEST } from '../../api/constants'
import { isDynamicRoute } from '../../shared/lib/router/utils'
import type { BaseNextRequest } from '../../server/base-http'
import {
  RouterServerContextSymbol,
  routerServerGlobal,
} from '../../server/lib/router-utils/router-server-context'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { normalizeLocalePath } from '../../shared/lib/i18n/normalize-locale-path'
import type { PrerenderManifest, RoutesManifest } from '..'
import { loadManifestFromRelativePath } from '../../server/load-manifest.external'

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
})

export async function handler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
  }
): Promise<void> {
  const projectDir =
    routerServerGlobal[RouterServerContextSymbol]?.dir || process.cwd()
  const distDir = process.env.__NEXT_RELATIVE_DIST_DIR || ''
  const isDev = process.env.NODE_ENV === 'development'

  const routesManifest = await loadManifestFromRelativePath<RoutesManifest>(
    projectDir,
    distDir,
    ROUTES_MANIFEST
  )
  const prerenderManifest =
    await loadManifestFromRelativePath<PrerenderManifest>(
      projectDir,
      distDir,
      PRERENDER_MANIFEST
    )
  let srcPage = 'VAR_DEFINITION_PAGE'

  // turbopack doesn't normalize `/index` in the page name
  // so we need to to process dynamic routes properly
  if (process.env.TURBOPACK) {
    srcPage = srcPage.replace(/\/index$/, '')
  }

  // We need to parse dynamic route params
  // and do URL normalization here.
  // TODO: move this into server-utils for re-use
  const { basePath, i18n, rewrites } = routesManifest

  if (basePath) {
    req.url = removePathPrefix(req.url || '/', basePath)
  }

  if (i18n) {
    const urlParts = (req.url || '/').split('?')
    const localeResult = normalizeLocalePath(urlParts[0] || '/', i18n.locales)

    if (localeResult.detectedLocale) {
      req.url = `${localeResult.pathname}${
        urlParts[1] ? `?${urlParts[1]}` : ''
      }`
    }
  }

  const parsedUrl = parse(req.url || '/', true)
  const pageIsDynamic = isDynamicRoute(srcPage)

  const serverUtils = getUtils({
    page: srcPage,
    i18n,
    basePath,
    rewrites,
    pageIsDynamic,
    trailingSlash: process.env.__NEXT_TRAILING_SLASH as any as boolean,
    caseSensitive: Boolean(routesManifest.caseSensitive),
  })
  const rewriteParamKeys = Object.keys(
    serverUtils.handleRewrites(req as any as BaseNextRequest, parsedUrl)
  )
  serverUtils.normalizeCdnUrl(req as any as BaseNextRequest, [
    ...rewriteParamKeys,
    ...Object.keys(serverUtils.defaultRouteRegex?.groups || {}),
  ])

  const params: Record<string, undefined | string | string[]> =
    serverUtils.dynamicRouteMatcher
      ? serverUtils.dynamicRouteMatcher(parsedUrl.pathname || '') || {}
      : {}

  const query = {
    ...parsedUrl.query,
    ...params,
  }
  serverUtils.normalizeQueryParams(query)

  if (pageIsDynamic) {
    const result = serverUtils.normalizeDynamicRouteParams(query, true)

    if (result.hasValidParams) {
      Object.assign(query, result.params)
    }
  }

  // ensure instrumentation is registered and pass
  // onRequestError below
  await ensureInstrumentationRegistered(projectDir, distDir)

  try {
    const method = req.method || 'GET'
    const tracer = getTracer()

    const activeSpan = tracer.getActiveScopeSpan()

    const invokeRouteModule = async (span?: Span) => {
      await routeModule
        .render(req, res, {
          query,
          params,
          allowedRevalidateHeaderKeys: process.env
            .__NEXT_ALLOWED_REVALIDATE_HEADERS as any as string[],
          multiZoneDraftMode: Boolean(process.env.__NEXT_MULTI_ZONE_DRAFT_MODE),
          trustHostHeader: process.env
            .__NEXT_TRUST_HOST_HEADER as any as boolean,
          // TODO: get this from from runtime env so manifest
          // doesn't need to load
          previewProps: prerenderManifest.preview,
          propagateError: false,
          dev: isDev,
          page: 'VAR_DEFINITION_PAGE',

          onError: (...args: Parameters<InstrumentationOnRequestError>) =>
            instrumentationOnRequestError(projectDir, distDir, ...args),
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
    }

    // TODO: activeSpan code path is for when wrapped by
    // next-server can be removed when this is no longer used
    if (activeSpan) {
      await invokeRouteModule(activeSpan)
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
          invokeRouteModule
        )
      )
    }
  } catch (err) {
    // we re-throw in dev to show the error overlay
    if (isDev) {
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
