import type { IncomingMessage, ServerResponse } from 'http'
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
  })
  await devServer.matchers.reload()

  // @ts-expect-error
  devServer.customRoutes = await loadCustomRoutes(nextConfig)

  const routeResults = new WeakMap<any, string>()
  const routes = devServer.generateRoutes.bind(devServer)()
  const router = new Router({
    ...routes,
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
      route.name?.includes('check')
    return matches
  })

  return async function resolveRoute(
    _req: IncomingMessage,
    _res: ServerResponse
  ) {
    const req = new NodeNextRequest(_req)
    const res = new NodeNextResponse(_res)
    ;(req as any)._initUrl = req.url

    await router.execute.bind(router)(req, res, url.parse(req.url!, true))

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
              headers: {},
            }

      res.body(JSON.stringify(routeResult)).send()
    }
  }
}
