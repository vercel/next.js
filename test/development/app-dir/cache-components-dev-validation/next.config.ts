import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // reactDebugChannel: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
