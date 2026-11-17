import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: {
    cachedNavigations: false,
    exposeTestingApiInProductionBuild: true,
  },
}

export default nextConfig
