import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  // Keep production verification separate from the agent's running dev server.
  distDir: process.env.NEXT_EVAL_DIST_DIR || '.next',
}

export default nextConfig
