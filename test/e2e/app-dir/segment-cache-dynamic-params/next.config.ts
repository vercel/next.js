import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    // Keep this legacy fixture independent of the CC CI job's defaults.
    cachedNavigations: false,
    optimisticRouting: process.env.__NEXT_TEST_AXIS !== 'A',
    varyParams: true,
    prefetchInlining: true,
  },
}

export default nextConfig
