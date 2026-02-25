import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    exposeTestingApiInProductionBuild: true,
  },
}

export default nextConfig
