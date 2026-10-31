import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  // PPF is controlled by the test variant
  // partialPrefetching: ...,
  experimental: {
    cachedNavigations: true,
  },
}

export default nextConfig
