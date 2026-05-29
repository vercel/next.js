import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
