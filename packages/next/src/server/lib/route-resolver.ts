import type { IncomingMessage, ServerResponse } from 'http'
import { join } from 'path'

import {
  StackFrame,
  parse as parseStackTrace,
} from 'next/dist/compiled/stacktrace-parser'

import type { NextConfig } from '../config'
import type { RouteDefinition } from '../future/route-definitions/route-definition'
import { RouteKind } from '../future/route-kind'
import { DefaultRouteMatcherManager } from '../future/route-matcher-managers/default-route-matcher-manager'
import type { RouteMatch } from '../future/route-matches/route-match'
import type { PageChecker, Route } from '../router'
import { getMiddlewareMatchers } from '../../build/analysis/get-page-static-info'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import {
  CLIENT_STATIC_FILES_PATH,
  DEV_CLIENT_PAGES_MANIFEST,
} from '../../shared/lib/constants'
import type { BaseNextRequest } from '../base-http'

export type MiddlewareConfig = {
  matcher: string[]
  files: string[]
}

export type ServerAddress = {
  hostname: string
  port: number
}

export type RouteResult =
  | {
      type: 'rewrite'
      url: string
      statusCode: number
      headers: Record<string, undefined | number | string | string[]>
    }
  | {
      type: 'error'
      error: {
        name: string
        message: string
        stack: StackFrame[]
      }
    }
  | {
      type: 'none'
    }

class DevRouteMatcherManager extends DefaultRouteMatcherManager {
  private hasPage: PageChecker

  constructor(hasPage: PageChecker) {
    super()
    this.hasPage = hasPage
  }

  async match(
    pathname: string
  ): Promise<RouteMatch<RouteDefinition<RouteKind>> | null> {
    if (await this.hasPage(pathname)) {
      return {
        definition: {
          kind: RouteKind.PAGES,
          page: '',
          pathname,
          filename: '',
          bundlePath: '',
        },
        params: {},
      }
    }
    return null
  }

  async test(pathname: string) {
    return (await this.match(pathname)) !== null
  }
}

export async function makeResolver(
  dir: string,
  nextConfig: NextConfig,
  middleware: MiddlewareConfig,
  serverAddr: Partial<ServerAddress>
) {
  const url = require('url') as typeof import('url')
  const { default: Router } = require('../router') as typeof import('../router')
  const { getPathMatch } =
    require('../../shared/lib/router/utils/path-match') as typeof import('../../shared/lib/router/utils/path-match')
  const { default: DevServer } =
    require('../dev/next-dev-server') as typeof import('../dev/next-dev-server')

  const { NodeNextRequest, NodeNextResponse } =
    require('../base-http/node') as typeof import('../base-http/node')

  const { default: loadCustomRoutes } =
    require('../../lib/load-custom-routes') as typeof import('../../lib/load-custom-routes')

  const routeResults = new WeakMap<any, RouteResult>()

  class TurbopackDevServerProxy extends DevServer {
    // make sure static files are served by turbopack
    serveStatic(): Promise<void> {
      return Promise.resolve()
    }

    // make turbopack handle errors
    async renderError(err: Error | null, req: BaseNextRequest): Promise<void> {
      if (err != null) {
        routeResults.set(req, {
          type: 'error',
          error: {
            name: err.name,
            message: err.message,
            stack: parseStackTrace(err.stack!),
          },
        })
      }

      return Promise.resolve()
    }

    // make turbopack handle 404s
    render404(): Promise<void> {
      return Promise.resolve()
    }
  }

  const devServer = new TurbopackDevServerProxy({
    dir,
    conf: nextConfig,
    hostname: serverAddr.hostname || 'localhost',
    port: serverAddr.port || 3000,
  })

  await devServer.matchers.reload()

  // @ts-expect-error private
  devServer.setDevReady!()

  // @ts-expect-error protected
  devServer.customRoutes = await loadCustomRoutes(nextConfig)

  if (middleware.files?.length) {
    const matchers = middleware.matcher
      ? getMiddlewareMatchers(middleware.matcher, nextConfig)
      : [{ regexp: '.*', originalSource: '/:path*' }]
    // @ts-expect-error
    devServer.middleware = {
      page: '/',
      match: getMiddlewareRouteMatcher(matchers),
      matchers,
    }

    type GetEdgeFunctionInfo =
      typeof DevServer['prototype']['getEdgeFunctionInfo']
    const getEdgeFunctionInfo = (
      original: GetEdgeFunctionInfo
    ): GetEdgeFunctionInfo => {
      return (params: { page: string; middleware: boolean }) => {
        if (params.middleware) {
          return {
            name: 'middleware',
            paths: middleware.files.map((file) => join(process.cwd(), file)),
            env: Object.keys(process.env),
            wasm: [],
            assets: [],
          }
        }
        return original(params)
      }
    }
    // @ts-expect-error protected
    devServer.getEdgeFunctionInfo = getEdgeFunctionInfo(
      // @ts-expect-error protected
      devServer.getEdgeFunctionInfo.bind(devServer)
    )
    // @ts-expect-error protected
    devServer.hasMiddleware = () => true
  }

  const routes = devServer.generateRoutes(true)
  // @ts-expect-error protected
  const catchAllMiddleware = devServer.generateCatchAllMiddlewareRoute(true)

  routes.matchers = new DevRouteMatcherManager(
    // @ts-expect-error internal method
    devServer.hasPage.bind(devServer)
  )

  // @ts-expect-error protected
  const buildId = devServer.buildId

  const pagesManifestRoute = routes.fsRoutes.find(
    (r) =>
      r.name ===
      `_next/${CLIENT_STATIC_FILES_PATH}/${buildId}/${DEV_CLIENT_PAGES_MANIFEST}`
  )
  if (pagesManifestRoute) {
    // make sure turbopack serves this
    pagesManifestRoute.fn = () => {
      return {
        finished: true,
      }
    }
  }

  const router = new Router({
    ...routes,
    catchAllMiddleware,
    catchAllRoute: {
      match: getPathMatch('/:path*'),
      name: 'catchall route',
      fn: async (req, res, _params, parsedUrl) => {
        // clean up internal query values
        for (const key of Object.keys(parsedUrl.query || {})) {
          if (key.startsWith('_next')) {
            delete parsedUrl.query[key]
          }
        }

        routeResults.set(req, {
          type: 'rewrite',
          url: url.format({
            pathname: parsedUrl.pathname,
            query: parsedUrl.query,
            hash: parsedUrl.hash,
          }),
          statusCode: 200,
          headers: res.getHeaders(),
        })

        return { finished: true }
      },
    } as Route,
  })

  // @ts-expect-error internal field
  router.compiledRoutes = router.compiledRoutes.filter((route: Route) => {
    return (
      route.type === 'rewrite' ||
      route.type === 'redirect' ||
      route.type === 'header' ||
      route.name === 'catchall route' ||
      route.name === 'middleware catchall' ||
      route.name?.includes('check')
    )
  })

  return async function resolveRoute(
    _req: IncomingMessage,
    _res: ServerResponse
  ) {
    const req = new NodeNextRequest(_req)
    const res = new NodeNextResponse(_res)
    const parsedUrl = url.parse(req.url!, true)
    // @ts-expect-error protected
    devServer.attachRequestMeta(req, parsedUrl)
    ;(req as any)._initUrl = req.url

    await router.execute(req, res, parsedUrl)

    if (!res.originalResponse.headersSent) {
      res.setHeader('x-nextjs-route-result', '1')
      const routeResult: RouteResult = routeResults.get(req) ?? {
        type: 'none',
      }

      res.body(JSON.stringify(routeResult)).send()
    }

    routeResults.delete(req)
  }
}
