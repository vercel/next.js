import { denormalizePagePath } from '../shared/lib/page-path/denormalize-page-path'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'

export function resolveDynamicRoute(pathname: string, pages: string[]) {
  const cleanPathname = removeTrailingSlash(denormalizePagePath(pathname!))
  if (cleanPathname === '/404' || cleanPathname === '/_error') {
    return pathname
  }

  // handle resolving href for dynamic routes
  if (!pages.includes(cleanPathname!)) {
    // eslint-disable-next-line array-callback-return
    pages.some((page) => {
      if (isDynamicRoute(page) && getRouteRegex(page).re.test(cleanPathname!)) {
        pathname = page
        return true
      }
    })
  }
  return removeTrailingSlash(pathname)
}
