import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: process.env.__NEXT_TEST_AXIS !== 'A',
  partialPrefetching: process.env.__NEXT_TEST_AXIS !== 'A',
  skipProxyUrlNormalize: true,
  experimental: {
    cachedNavigations: process.env.__NEXT_TEST_AXIS !== 'A',
  },
}
export default nextConfig
