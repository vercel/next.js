import type { IncomingHttpHeaders } from 'http'
import { getMiddlewareMatchers } from '../../../build/analysis/get-page-static-info'
import { getMiddlewareRouteMatcher } from '../../../shared/lib/router/utils/middleware-route-matcher'
import type { NextConfig } from '../../../server/config-shared'
import { parseUrl } from '../../../lib/url'
import { constructRequest } from './utils'
import type { MiddlewareConfigMatcherInput } from '../../../build/segment-config/middleware/middleware-config'

export interface MiddlewareSourceConfig {
  matcher?: MiddlewareConfigMatcherInput
}

/**
 * Checks whether the middleware config will match the provide URL and request
 * information such as headers and cookies. This function is useful for
 * unit tests to assert that middleware is matching (and therefore executing)
 * only when it should be.
 */
export function unstable_doesMiddlewareMatch({
  config,
  url,
  headers,
  cookies,
  nextConfig,
}: {
  config: MiddlewareSourceConfig
  url: string
  headers?: IncomingHttpHeaders
  cookies?: Record<string, string>
  nextConfig?: NextConfig
}): boolean {
  if (!config.matcher) {
    return true
  }
  const matchers = getMiddlewareMatchers(config.matcher, nextConfig ?? {})
  const routeMatchFn = getMiddlewareRouteMatcher(matchers)
  const { pathname, searchParams = new URLSearchParams() } = parseUrl(url) || {}
  const request = constructRequest({ url, headers, cookies })
  return routeMatchFn(pathname, request, Object.fromEntries(searchParams))
}
