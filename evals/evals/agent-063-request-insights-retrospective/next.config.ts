import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  // Enabled only for the setup's server so the agent must query the live
  // process instead of reading the flag here.
  experimental: {
    requestInsights: process.env.EVAL_REQUEST_INSIGHTS === '1',
  },
}

export default nextConfig
