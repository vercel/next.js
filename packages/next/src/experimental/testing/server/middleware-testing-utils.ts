import type { IncomingHttpHeaders } from 'http'
import { getMiddlewareMatchers } from '../../../build/analysis/get-page-static-info'
import { getMiddlewareRouteMatcher } from '../../../shared/lib/router/utils/middleware-route-matcher'
import type { NextConfig } from '../../../server/config-shared'
import { parseUrl } from '../../../lib/url'
import { constructRequest } from './utils'
import type { MiddlewareConfigMatcherInput } from '../../../build/segment-config/middleware/middleware-config'

export interface ProxySourceConfig {
  matcher?: MiddlewareConfigMatcherInput
}

/**
 * @deprecated Use `ProxySourceConfig` instead. Middleware has been renamed to
 * Proxy.
 */
export type MiddlewareSourceConfig = ProxySourceConfig

/**
 * Checks whether the proxy config will match the provided URL and request
 * information such as headers and cookies. This function is useful for
 * unit tests to assert that proxy is matching (and therefore executing)
 * only when it should be.
 */
export function unstable_doesProxyMatch({
  config,
  url,
  headers,
  cookies,
  nextConfig,
}: {
  config: ProxySourceConfig
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

/**
 * @deprecated Use `unstable_doesProxyMatch` instead. Middleware has been
 * renamed to Proxy.
 */
export const unstable_doesMiddlewareMatch = unstable_doesProxyMatch
