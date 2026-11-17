import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: process.env.__NEXT_TEST_AXIS !== 'A',
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
}

export default nextConfig
