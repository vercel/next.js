import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Keep the baseline free of generated agent instructions. The Guide
  // experiment writes its own AGENTS.md after this fixture is prepared.
  agentRules: false,
}

export default nextConfig
