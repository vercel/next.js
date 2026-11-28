import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheHandler: require.resolve('./incremental-cache-handler'),
}

export default nextConfig
