import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
}

export default nextConfig
