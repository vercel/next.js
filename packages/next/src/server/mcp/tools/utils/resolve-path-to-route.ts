import type { Route } from '../../../../shared/lib/route-types'

/**
 * Resolves a URL path (e.g. "/blog/hello-world") to its matching Next.js route
 * specifier (e.g. "/blog/[slug]") using the dev router's own live route table.
 *
 * The `matchers` argument is a thin view of `fsChecker` from the router-server
 * process — the same data structure `resolve-routes.ts` iterates on every
 * incoming HTTP request — so first-match ordering and live route updates are
 * inherited for free.
 */
export interface RouteMatcherView {
  appFiles: ReadonlySet<Route>
  pageFiles: ReadonlySet<Route>
  dynamicRoutes: ReadonlyArray<{
    page: Route
    match: (pathname: Route) => false | object
  }>
}

export function resolvePathToRoute(
  path: string,
  matchers: RouteMatcherView
): { routeSpecifier: Route } | { notFound: true; pathname: Route } {
  let pathname = path
  const q = pathname.indexOf('?')
  if (q >= 0) pathname = pathname.slice(0, q)
  const h = pathname.indexOf('#')
  if (h >= 0) pathname = pathname.slice(0, h)
  if (!pathname.startsWith('/')) pathname = '/' + pathname
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }

  // The public path may include query/hash text. The existing operations above
  // construct a URL pathname; neither this value nor the table keys are Pages.
  if (
    matchers.appFiles.has(pathname as Route) ||
    matchers.pageFiles.has(pathname as Route)
  ) {
    return { routeSpecifier: pathname as Route }
  }

  for (const route of matchers.dynamicRoutes) {
    // Skip SSG/SSP data-route variants prepended by setup-dev-bundler.
    if (route.page.startsWith('/_next/data/')) continue
    if (route.match(pathname as Route)) {
      return { routeSpecifier: route.page }
    }
  }

  return { notFound: true, pathname: pathname as Route }
}
