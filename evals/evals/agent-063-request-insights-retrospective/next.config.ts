import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  ...(process.env.NEXT_EVAL_EXPERIMENTAL
    ? { experimental: JSON.parse(process.env.NEXT_EVAL_EXPERIMENTAL) }
    : {}),
}

export default nextConfig
