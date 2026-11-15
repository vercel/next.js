import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Enable the browser testing helper in this eval's production build only.
  experimental: { exposeTestingApiInProductionBuild: true },
}

export default nextConfig
