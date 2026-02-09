import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  productionBrowserSourceMaps: true,
  experimental: {
    prerenderEarlyExit: false,
    reactDebugChannel: process.env.REACT_DEBUG_CHANNEL ? true : false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
