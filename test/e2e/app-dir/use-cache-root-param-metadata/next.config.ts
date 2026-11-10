import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    useCacheStaticRootParamTracking: Boolean(process.env.TURBOPACK),
  },
}

export default nextConfig
