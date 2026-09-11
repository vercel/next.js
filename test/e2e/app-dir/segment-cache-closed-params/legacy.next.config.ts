import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    optimisticRouting: process.env.__NEXT_TEST_AXIS !== 'A',
    varyParams: true,
    prefetchInlining: true,
  },
}

export default nextConfig
