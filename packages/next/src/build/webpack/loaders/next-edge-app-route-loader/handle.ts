import {
  WebNextRequest,
  WebNextResponse,
} from '../../../../server/base-http/web'
import { AppRouteRouteHandler } from '../../../../server/future/route-handlers/app-route-route-handler'
import { RouteKind } from '../../../../server/future/route-kind'
import { AppRouteRouteMatcher } from '../../../../server/future/route-matchers/app-route-route-matcher'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'

export function getHandle({ page, mod }: any) {
  const appRouteRouteHandler = new AppRouteRouteHandler()
  const appRouteRouteMatcher = new AppRouteRouteMatcher({
    kind: RouteKind.APP_ROUTE,
    pathname: normalizeAppPath(page),
    page: '',
    bundlePath: '',
    filename: '',
  })

  function requestHandler(
    pathname: string,
    req: WebNextRequest,
    res: WebNextResponse
  ) {
    const match = appRouteRouteMatcher.match(pathname)!
    return appRouteRouteHandler.execute(match, mod, req, res)
  }

  return async function handle(request: Request) {
    const extendedReq = new WebNextRequest(request)
    const extendedRes = new WebNextResponse()
    requestHandler(new URL(request.url).pathname, extendedReq, extendedRes)
    return await extendedRes.toResponse()
  }
}
