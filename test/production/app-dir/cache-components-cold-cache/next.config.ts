import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheHandler: require.resolve('./cache-handler.js'),
}

export default nextConfig
