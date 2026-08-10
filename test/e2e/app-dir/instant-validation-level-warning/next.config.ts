import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      validationLevel: 'warning',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
