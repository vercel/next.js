import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: {
    rules: {
      'counter.tsx': { loaders: ['./compilation-gate-loader.js'] },
    },
  },
}

export default nextConfig
