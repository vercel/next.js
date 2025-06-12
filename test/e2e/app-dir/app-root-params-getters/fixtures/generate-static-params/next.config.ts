import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    dynamicIO: true, // implies `rootParams: true`.
  },
}

export default nextConfig
