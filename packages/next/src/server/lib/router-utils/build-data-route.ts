import type { Page, Route } from '../../../shared/lib/route-types'
import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { isDynamicRoute } from '../../../shared/lib/router/utils/is-dynamic'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import { normalizeRouteRegex } from '../../../lib/load-custom-routes'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'

export function buildDataRoute(page: Route, buildId: string) {
  // This helper builds Pages Router data URLs: their discovery URL also
  // identifies the Pages module whose file counterpart is encoded here.
  const pagePath = normalizePagePath(page as string as Page)
  const dataRoute = path.posix.join(
    '/_next/data',
    buildId,
    `${pagePath}.json`
  ) as Route

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

export function addLocalePrefixToDataRouteRegex(
  dataRouteRegex: string,
  buildId: string
) {
  // dataRouteRegex escapes static segments, including custom build IDs. Locate
  // the escaped build ID so locale insertion also works for IDs such as "a.b".
  const buildIdSegment = `/${escapeStringRegexp(buildId)}`
  const buildIdIndex = dataRouteRegex.indexOf(buildIdSegment)

  if (buildIdIndex === -1) {
    return dataRouteRegex
  }

  const insertIndex = buildIdIndex + buildIdSegment.length
  return `${dataRouteRegex.slice(0, insertIndex)}/(?:[^/]+?)${dataRouteRegex.slice(insertIndex)}`
}
