import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    agentFeedback: true,
  },
}

export default nextConfig
