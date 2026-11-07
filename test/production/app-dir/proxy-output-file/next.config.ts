import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  cacheHandler: process.env.TEST_CACHE_HANDLER
    ? require.resolve('./cache-handler.js')
    : undefined,
}

export default nextConfig
