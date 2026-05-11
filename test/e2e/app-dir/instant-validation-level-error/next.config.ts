import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      validationLevel: 'experimental-error',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
