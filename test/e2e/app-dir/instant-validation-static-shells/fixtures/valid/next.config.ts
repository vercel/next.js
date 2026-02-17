import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    prerenderEarlyExit: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
