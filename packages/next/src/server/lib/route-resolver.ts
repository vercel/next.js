import type { IncomingMessage, ServerResponse } from 'http'
import type { NextConfig } from '../config'
import { RouteDefinition } from '../future/route-definitions/route-definition'
import { RouteKind } from '../future/route-kind'
import { DefaultRouteMatcherManager } from '../future/route-matcher-managers/default-route-matcher-manager'
import { RouteMatch } from '../future/route-matches/route-match'
import type { PageChecker, Route } from '../router'
import { getMiddlewareMatchers } from '../../build/analysis/get-page-static-info'
import { getMiddlewareRouteMatcher } from '../../shared/lib/router/utils/middleware-route-matcher'
import { join } from 'path'

type MiddlewareConfig = {
  matcher: string[]
  files: string[]
}
type RouteResult =
  | {
      type: 'rewrite'
      url: string
      statusCode: number
      headers: Record<string, undefined | number | string | string[]>
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
  middleware: MiddlewareConfig
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

  const devServer = new DevServer({
    dir,
    conf: nextConfig,
    hostname: 'localhost',
    port: 3000,
  })

  await devServer.matchers.reload()

  if (middleware.files?.length) {
    // @ts-expect-error
    devServer.customRoutes = await loadCustomRoutes(nextConfig)

    const matchers = middleware.matcher
      ? getMiddlewareMatchers(middleware.matcher, nextConfig)
      : [{ regexp: '.*' }]
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
            env: [],
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

  const routeResults = new WeakMap<any, string>()
  const routes = devServer.generateRoutes()
  // @ts-expect-error protected
  const catchAllMiddleware = devServer.generateCatchAllMiddlewareRoute(true)

  routes.matchers = new DevRouteMatcherManager(
    // @ts-expect-error internal method
    devServer.hasPage.bind(devServer)
  )

  const router = new Router({
    ...routes,
    catchAllMiddleware,
    catchAllRoute: {
      match: getPathMatch('/:path*'),
      name: 'catchall route',
      fn: async (req, _res, _params, parsedUrl) => {
        // clean up internal query values
        for (const key of Object.keys(parsedUrl.query || {})) {
          if (key.startsWith('_next')) {
            delete parsedUrl.query[key]
          }
        }

        routeResults.set(
          req,
          url.format({
            pathname: parsedUrl.pathname,
            query: parsedUrl.query,
            hash: parsedUrl.hash,
          })
        )
        return { finished: true }
      },
    } as Route,
  })

  // @ts-expect-error internal field
  router.compiledRoutes = router.compiledRoutes.filter((route: Route) => {
    const matches =
      route.type === 'rewrite' ||
      route.type === 'redirect' ||
      route.type === 'header' ||
      route.name === 'catchall route' ||
      route.name === 'middleware catchall' ||
      route.name?.includes('check')
    return matches
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
      const resolvedUrl = routeResults.get(req)
      routeResults.delete(req)

      const routeResult: RouteResult =
        resolvedUrl == null
          ? {
              type: 'none',
            }
          : {
              type: 'rewrite',
              url: resolvedUrl,
              statusCode: 200,
              headers: res.originalResponse.getHeaders(),
            }

      res.body(JSON.stringify(routeResult)).send()
    }
  }
}
