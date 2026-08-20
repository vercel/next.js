/**
 * Resolves a URL path (e.g. "/blog/hello-world") to its matching Next.js route
 * specifier (e.g. "/blog/[slug]") using the dev router's route table.
 *
 * The `matchers` argument can be a snapshot of the dev router's route table,
 * so exact and dynamic matching use one route generation while preserving the
 * router's first-match ordering.
 */
export interface RouteMatcherView {
  hasAppFile(pathname: string): boolean
  hasPageFile(pathname: string): boolean
  dynamicRoutes: ReadonlyArray<{
    page: string
    match: (pathname: string) => false | object
  }>
}

export function resolvePathToRoute(
  path: string,
  matchers: RouteMatcherView
): { routeSpecifier: string } | { notFound: true; pathname: string } {
  let pathname = path
  const q = pathname.indexOf('?')
  if (q >= 0) pathname = pathname.slice(0, q)
  const h = pathname.indexOf('#')
  if (h >= 0) pathname = pathname.slice(0, h)
  if (!pathname.startsWith('/')) pathname = '/' + pathname
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }

  if (matchers.hasAppFile(pathname) || matchers.hasPageFile(pathname)) {
    return { routeSpecifier: pathname }
  }

  for (const route of matchers.dynamicRoutes) {
    // Skip SSG/SSP data-route variants prepended by setup-dev-bundler.
    if (route.page.startsWith('/_next/data/')) continue
    if (route.match(pathname)) {
      return { routeSpecifier: route.page }
    }
  }

  return { notFound: true, pathname }
}
