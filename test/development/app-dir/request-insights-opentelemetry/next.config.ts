import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    requestInsights: true,
  },
}

export default nextConfig
