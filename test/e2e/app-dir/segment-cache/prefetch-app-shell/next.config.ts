import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    prefetchInlining: true,
    optimisticRouting: true,
    cachedNavigations: true,
    varyParams: true,
  },
}

export default nextConfig
