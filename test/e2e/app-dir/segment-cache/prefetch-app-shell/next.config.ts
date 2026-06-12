import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    prefetchInlining: true,
    optimisticRouting: true,
    cachedNavigations: true,
    appShells: true,
    varyParams: true,
    instrumentationClientRouterTransitionEvents: true,
  },
}

export default nextConfig
