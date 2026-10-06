import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: false,
  // Exercise the prerender bypass with ordinary browser requests, not only
  // draft mode.
  htmlLimitedBots: /.*/,
  experimental: {
    cachedNavigations: true,
    optimisticRouting: true,
    collapseAdapterRoutes: process.env.TEST_COLLAPSE_ADAPTER_ROUTES === 'true',
  },
}

export default nextConfig
