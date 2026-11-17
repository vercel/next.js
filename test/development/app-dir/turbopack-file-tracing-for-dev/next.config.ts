import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackFileTracingForDev: true,
  },
}

export default nextConfig
