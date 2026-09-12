import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // If a cache hangs, error quickly.
    // (this is relevant for tests that validate caches with hanging inputs)
    useCacheTimeout: 10,
  },
}

export default nextConfig
