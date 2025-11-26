import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { isDynamicRoute } from '../../../shared/lib/router/utils/is-dynamic'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { normalizeRouteRegex } from '../../../lib/load-custom-routes'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'

export function buildDataRoute(page: string, buildId: string) {
  const pagePath = normalizePagePath(page)
  const dataRoute = path.posix.join('/_next/data', buildId, `${pagePath}.json`)

  let dataRouteRegex: string
  let namedDataRouteRegex: string | undefined
  let routeKeys: { [named: string]: string } | undefined

  if (isDynamicRoute(page)) {
    const routeRegex = getNamedRouteRegex(dataRoute, {
      prefixRouteKeys: true,
      includeSuffix: true,
      excludeOptionalTrailingSlash: true,
    })

    dataRouteRegex = normalizeRouteRegex(routeRegex.re.source)
    namedDataRouteRegex = routeRegex.namedRegex
    routeKeys = routeRegex.routeKeys
  } else {
    dataRouteRegex = normalizeRouteRegex(
      new RegExp(
        `^${path.posix.join(
          '/_next/data',
          escapeStringRegexp(buildId),
          `${pagePath}\\.json`
        )}$`
      ).source
    )
  }

  return {
    page,
    routeKeys,
    dataRouteRegex,
    namedDataRouteRegex,
  }
}
