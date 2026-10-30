import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: { requestInsights: process.env.NODE_ENV === 'production' },
}

export default nextConfig
