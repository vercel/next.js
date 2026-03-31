import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    cachedNavigations: true,
    exposeTestingApiInProductionBuild: true,
    instantNavigationDevToolsToggle: true,
    optimisticRouting: true,
    useOffline: true,
    varyParams: true,
  },
}

export default nextConfig
