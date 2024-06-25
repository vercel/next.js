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

  const regex = normalizeRouteRegex(source)

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
