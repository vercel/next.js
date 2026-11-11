import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheHandler: require.resolve('./cache-handler.test.mjs'),
}

export default nextConfig
