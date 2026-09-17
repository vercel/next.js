import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The foreground matching policy must not change when Partial Prefetching
  // is enabled. Axis A exercises the same assertions without it.
  partialPrefetching: process.env.__NEXT_TEST_AXIS !== 'A',
  experimental: {
    paramMatching: true,
  },
}

export default nextConfig
