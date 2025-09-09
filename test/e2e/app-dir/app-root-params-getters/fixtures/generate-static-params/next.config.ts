import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    cacheComponents: true, // implies `rootParams: true`.
  },
}

export default nextConfig
