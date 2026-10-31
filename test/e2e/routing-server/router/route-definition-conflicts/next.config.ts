import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: { cachedNavigations: false },
}

export default nextConfig
