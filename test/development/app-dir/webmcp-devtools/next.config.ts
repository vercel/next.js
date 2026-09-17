import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: '/tools',
  experimental: {
    mcpServer: false,
    requestInsights: true,
  },
}

export default nextConfig
