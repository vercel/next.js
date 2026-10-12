import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheHandlers: {
    default: require.resolve('./runtime-handler.js'),
    remote: require.resolve('./fallback-handler.js'),
  },
  buildCacheHandlers: {
    default: path.join(__dirname, 'build-handler.js'),
  },
}

export default nextConfig
