import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    prefetchInlining: true,
    varyParams: true,
    optimisticRouting: true,
    cachedNavigations: true,
  },
}

export default nextConfig
