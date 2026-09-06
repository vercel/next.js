import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
