import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
  experimental: {
    useCache: true,
  },
}

export default nextConfig
