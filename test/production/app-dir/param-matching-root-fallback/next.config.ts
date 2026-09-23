import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    paramMatching: true,
  },
}

export default nextConfig
