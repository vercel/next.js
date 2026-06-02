import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    prefetchInlining: false,
    exposeTestingApiInProductionBuild: true,
    instantNavigationDevToolsToggle: true,
    useOffline: true,
  },
}

export default nextConfig
