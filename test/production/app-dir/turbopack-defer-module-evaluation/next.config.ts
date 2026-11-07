import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackDeferModuleEvaluation: true,
  },
}

export default nextConfig
