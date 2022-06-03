import { addBasePath } from './add-base-path'
import { addLocale } from './add-locale'
import { interpolateAs } from '../shared/lib/router/router'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { parseRelativeUrl } from '../shared/lib/router/utils/parse-relative-url'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import getAssetPathFromRoute from '../shared/lib/router/utils/get-asset-path-from-route'

export interface DataHrefParams {
  asPath: string
  buildId: string
  href: string
  locale?: string | false
  ssg?: boolean
}

export function getDataHref(params: DataHrefParams): string {
  const { asPath, buildId, href, locale, ssg } = params
  const { pathname: hrefPathname, query, search } = parseRelativeUrl(href)
  const { pathname: asPathname } = parseRelativeUrl(asPath)
  const route = removeTrailingSlash(hrefPathname)
  if (route[0] !== '/') {
    throw new Error(`Route name should start with a "/", got "${route}"`)
  }

  const getHrefForSlug = (path: string) => {
    const dataRoute = getAssetPathFromRoute(
      removeTrailingSlash(addLocale(path, locale)),
      '.json'
    )
    return addBasePath(
      `/_next/data/${buildId}${dataRoute}${ssg ? '' : search}`,
      true
    )
  }

  return getHrefForSlug(
    isDynamicRoute(route)
      ? interpolateAs(hrefPathname, asPathname, query).result
      : route
  )
}
