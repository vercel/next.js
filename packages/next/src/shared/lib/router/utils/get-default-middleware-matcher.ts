import type { NextConfig } from '../../../../types'
import type { MiddlewareMatcher } from '../../../../build/analysis/get-page-static-info'

export function getDefaultMiddlewareMatcher({
  skipMiddlewareNextInternalRoutes,
}: NextConfig): MiddlewareMatcher {
  if (skipMiddlewareNextInternalRoutes !== false) {
    // Skip "/_next/" internal routes, except for "/_next/data/" which is needed for
    // client-side navigation. Do not consider basePath as the user cannot create a
    // route starts with underscore.
    return {
      regexp: '^(?!.*\\/\\_next\\/(?!data\\/)).*',
      originalSource: '/((?!_next/(?!data/))[^]*)*',
    }
  }

  return {
    regexp: '^/.*$',
    originalSource: '/:path*',
  }
}
