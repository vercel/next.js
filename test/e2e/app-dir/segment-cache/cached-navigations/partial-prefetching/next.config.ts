import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  // Enabling Partial Prefetching globally opts every route into runtime Cached
  // Navigations, even without a per-segment `prefetch` config.
  // `cachedNavigations` is left at its default (`true`, the static stage), so
  // the runtime stage here comes solely from `partialPrefetching`.
  partialPrefetching: true,
  experimental: {
    prefetchInlining: false,
    exposeTestingApiInProductionBuild: true,
    optimisticRouting: true,
    useOffline: true,
    varyParams: true,
  },
}

export default nextConfig
