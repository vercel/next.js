import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  // Globally enable Partial Prefetching, which treats every route as
  // runtime-cached, regardless of any per-segment `prefetch` config.
  partialPrefetching: true,
  experimental: {
    cachedNavigations: true,
    prefetchInlining: false,
    exposeTestingApiInProductionBuild: true,
    optimisticRouting: true,
    useOffline: true,
    varyParams: true,
  },
}

export default nextConfig
