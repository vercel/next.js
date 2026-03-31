import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    cachedNavigations: true,
    exposeTestingApiInProductionBuild: true,
  },
}

export default nextConfig
