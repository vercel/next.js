import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: process.env.__NEXT_TEST_AXIS !== 'A',
  experimental: { optimisticRouting: true },
}

export default nextConfig
