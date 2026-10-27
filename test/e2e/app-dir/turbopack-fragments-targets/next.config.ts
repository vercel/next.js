import type { NextConfig } from 'next'

const target = process.env.FRAGMENT_TARGET ?? 'client'
const nextConfig: NextConfig = {
  experimental: {
    turbopackModuleFragments:
      target === 'true'
        ? true
        : target === 'false'
          ? false
          : {
              client: target === 'client' || target === 'both',
              server: target === 'server' || target === 'both',
            },
    turbopackScopeHoisting: true,
  },
}

export default nextConfig
