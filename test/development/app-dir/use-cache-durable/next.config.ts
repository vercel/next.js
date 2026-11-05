import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    remote: require.resolve(
      'next/dist/server/lib/cache-handlers/default.external'
    ),
  },
  experimental: {
    durableUseCacheEntries: true,
  },
}

export default nextConfig
