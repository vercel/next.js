import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Without Cache Components, a default link to a dynamic route with a
  // loading boundary prefetches up to that boundary.
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
}

export default nextConfig
