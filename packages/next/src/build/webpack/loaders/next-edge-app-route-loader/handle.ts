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

  return async function handle(request: Request) {
    const extendedReq = new WebNextRequest(request)
    const extendedRes = new WebNextResponse()
    const match = appRouteRouteMatcher.match(new URL(request.url).pathname)!
    const response = await appRouteRouteHandler.execute(
      match,
      mod,
      extendedReq,
      extendedRes,
      // TODO: pass incrementalCache here
      {},
      request
    )

    return response
  }
}
