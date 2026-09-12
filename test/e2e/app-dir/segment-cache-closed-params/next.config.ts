import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Keep the client-cache regression independent of completed-shell ISR keying.
  partialPrefetching: false,
  experimental: {
    paramMatching: true,
    optimisticRouting: process.env.__NEXT_TEST_AXIS !== 'A',
    varyParams: true,
    prefetchInlining: true,
  },
}

export default nextConfig
