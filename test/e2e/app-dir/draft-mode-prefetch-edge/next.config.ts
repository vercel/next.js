import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  experimental: { cachedNavigations: false },
}

export default nextConfig
