import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheHandlers: { remote: require.resolve('./cache-handler.cjs') },
}

export default nextConfig
