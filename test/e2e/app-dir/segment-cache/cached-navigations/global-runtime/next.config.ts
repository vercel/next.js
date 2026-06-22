import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    // Globally treat every route as runtime-cached, regardless of any
    // per-segment `prefetch` config.
    cachedNavigations: 'allow-runtime',
    prefetchInlining: false,
    exposeTestingApiInProductionBuild: true,
    optimisticRouting: true,
    useOffline: true,
    varyParams: true,
  },
}

export default nextConfig
