import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    prefetchInlining: false,
    serverSourceMaps: true,
  },
}

export default nextConfig
