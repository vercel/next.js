import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    instantInsights: {
      validationLevel: 'experimental-manual-error',
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
