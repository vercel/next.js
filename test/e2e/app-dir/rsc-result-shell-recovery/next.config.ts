import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Exercise a request-time shell failure in the non-staged rendering path.
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
  },
}

export default nextConfig
