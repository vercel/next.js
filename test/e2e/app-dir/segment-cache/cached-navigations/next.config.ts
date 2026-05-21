import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    cachedNavigations: true,
    prefetchInlining: false,
    exposeTestingApiInProductionBuild: true,
    instantNavigationDevToolsToggle: true,
    useOffline: true,
  },
}

export default nextConfig
