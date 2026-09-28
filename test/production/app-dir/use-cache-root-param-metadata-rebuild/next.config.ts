import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    useCacheStaticRootParamTracking: true,
  },
}

export default nextConfig
