import {
  WebNextRequest,
  WebNextResponse,
} from '../../../../server/base-http/web'
import { NextConfig } from '../../../../server/config-shared'
import {
  AppRouteModule,
  AppRouteRouteHandler,
} from '../../../../server/future/route-handlers/app-route-route-handler'
import { RouteKind } from '../../../../server/future/route-kind'
import { AppRouteRouteMatcher } from '../../../../server/future/route-matchers/app-route-route-matcher'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import { removeTrailingSlash } from '../../../../shared/lib/router/utils/remove-trailing-slash'

type HandleProps = {
  page: string
  mod: AppRouteModule
  nextConfigOutput: NextConfig['output']
}

export function getHandle({ page, mod, nextConfigOutput }: HandleProps) {
  const handler = new AppRouteRouteHandler(nextConfigOutput)

  // Set the module on the handler so it can be used when we handle the request.
  handler.module = mod

  const matcher = new AppRouteRouteMatcher({
    kind: RouteKind.APP_ROUTE,
    pathname: normalizeAppPath(page),
    page: '',
    bundlePath: '',
    filename: '',
  })

  return async function handle(request: Request) {
    const extendedReq = new WebNextRequest(request)
    const extendedRes = new WebNextResponse()
    const match = matcher.match(
      removeTrailingSlash(new URL(request.url).pathname)
    )!

    const response = await handler.handle(
      match,
      extendedReq,
      extendedRes,
      // TODO: pass incrementalCache here
      { supportsDynamicHTML: true }
    )

    return response
  }
}
