import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    ledgers: process.env.__NEXT_TEST_AXIS !== 'A',
  },
  // Opt every route into Partial Prefetching globally: segments without a
  // per-segment `prefetch` export default to 'partial'.
  partialPrefetching: true,
  productionBrowserSourceMaps: true,
}

export default nextConfig
