import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  basePath: '/base',
  cacheComponents: true,
  partialPrefetching: false,
  experimental: {
    cachedNavigations: true,
    optimisticRouting: true,
    prefetchInlining: false,
    collapseAdapterRoutes: process.env.TEST_COLLAPSE_ADAPTER_ROUTES === 'true',
  },
}

export default nextConfig
