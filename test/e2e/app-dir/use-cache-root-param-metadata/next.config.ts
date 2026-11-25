import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Verify root param metadata independently of durability metadata.
    durableUseCacheEntries: false,
    useCacheStaticRootParamTracking: Boolean(process.env.TURBOPACK),
  },
}

export default nextConfig
