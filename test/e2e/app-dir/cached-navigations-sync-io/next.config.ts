import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: false,
  experimental: {
    cachedNavigations: true,
  },
}

export default nextConfig
