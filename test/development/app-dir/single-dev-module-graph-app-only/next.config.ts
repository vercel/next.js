import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackSingleDevModuleGraph: true,
  },
}

export default nextConfig
