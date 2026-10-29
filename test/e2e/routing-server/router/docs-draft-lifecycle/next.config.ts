import type { NextConfig } from 'next'

// The Cache Components isolation contract has its own companion fixture.
const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: { cachedNavigations: false },
}

export default nextConfig
