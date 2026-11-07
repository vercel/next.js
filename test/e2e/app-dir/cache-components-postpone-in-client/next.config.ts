import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // reactDebugChannel: true,
    prerenderEarlyExit: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
