import type { NextConfig } from 'next'

// The Cache Components routing model is covered by the companion suite.
const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: { cachedNavigations: false },
}

export default nextConfig
