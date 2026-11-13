import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: false,
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
}

export default nextConfig
