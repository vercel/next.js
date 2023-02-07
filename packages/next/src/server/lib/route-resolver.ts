import type { IncomingMessage, ServerResponse } from 'http'
import type { UnwrapPromise } from '../../lib/coalesced-function'
import type { NextConfig } from '../config'
import type { Route } from '../router'

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

export async function makeResolver(dir: string, nextConfig: NextConfig) {
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
  }) as any as {
    customRoutes: UnwrapPromise<ReturnType<typeof loadCustomRoutes>>
    router: InstanceType<typeof Router>
    generateRoutes: any
  }
  devServer.customRoutes = await loadCustomRoutes(nextConfig)
  const routes = devServer.generateRoutes.bind(devServer)()
  devServer.router = new Router(routes)
  const routeResults = new Map<string, string>()

  // @ts-expect-error internal field
  devServer.router.catchAllRoute = {
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
        (req as any)._initUrl,
        url.format({
          pathname: parsedUrl.pathname,
          query: parsedUrl.query,
          hash: parsedUrl.hash,
        })
      )
      return { finished: true }
    },
  } as Route

  // @ts-expect-error internal field
  devServer.router.compiledRoutes = devServer.router.compiledRoutes.filter(
    (route: Route) => {
      return (
        route.type === 'rewrite' ||
        route.type === 'redirect' ||
        route.type === 'header' ||
        route.name === 'catchall route' ||
        route.name?.includes('check')
      )
    }
  )

  return async function resolveRoute(
    _req: IncomingMessage,
    _res: ServerResponse
  ) {
    const req = new NodeNextRequest(_req)
    const res = new NodeNextResponse(_res)
    ;(req as any)._initUrl = req.url

    await devServer.router.execute.bind(devServer.router)(
      req,
      res,
      url.parse(req.url!, true)
    )

    if (!res.originalResponse.headersSent) {
      res.setHeader('x-nextjs-route-result', '1')
      const resolvedUrl = routeResults.get((req as any)._initUrl)

      const routeResult: RouteResult =
        resolvedUrl == null
          ? {
              type: 'none',
            }
          : {
              type: 'rewrite',
              url: resolvedUrl,
              statusCode: 200,
              headers: {},
            }

      res.body(JSON.stringify(routeResult)).send()
    }
  }
}
