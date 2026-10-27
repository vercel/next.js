import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    turbopackModuleFragments: true,
    turbopackScopeHoisting: true,
  },
}

export default nextConfig
