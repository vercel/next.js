import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import type {
  ManifestHeaderRoute,
  ManifestRedirectRoute,
  ManifestRewriteRoute,
} from '../build'
import {
  normalizeRouteRegex,
  type Header,
  type Redirect,
  type Rewrite,
  type RouteType,
} from './load-custom-routes'
import { getRedirectStatus, modifyRouteRegex } from './redirect-status'

export function buildCustomRoute(
  type: 'header',
  route: Header
): ManifestHeaderRoute
export function buildCustomRoute(
  type: 'rewrite',
  route: Rewrite
): ManifestRewriteRoute
export function buildCustomRoute(
  type: 'redirect',
  route: Redirect,
  restrictedRedirectPaths: string[]
): ManifestRedirectRoute
export function buildCustomRoute(
  type: RouteType,
  route: Redirect | Rewrite | Header,
  restrictedRedirectPaths?: string[]
): ManifestHeaderRoute | ManifestRewriteRoute | ManifestRedirectRoute {
  const compiled = pathToRegexp(route.source, [], {
    strict: true,
    sensitive: false,
    delimiter: '/', // default is `/#?`, but Next does not pass query info
  })

  let source = compiled.source
  if (!route.internal) {
    source = modifyRouteRegex(
      source,
      type === 'redirect' ? restrictedRedirectPaths : undefined
    )
  }

  // If this is an internal rewrite and it already provides a regex, use it
  // otherwise, normalize the source to a regex.
  let regex: string
  if (
    !route.internal ||
    type !== 'rewrite' ||
    !('regex' in route) ||
    typeof route.regex !== 'string'
  ) {
    regex = normalizeRouteRegex(source)
  } else {
    regex = route.regex
  }

  if (type !== 'redirect') {
    return { ...route, regex }
  }

  return {
    ...route,
    statusCode: getRedirectStatus(route as Redirect),
    permanent: undefined,
    regex,
  }
}
