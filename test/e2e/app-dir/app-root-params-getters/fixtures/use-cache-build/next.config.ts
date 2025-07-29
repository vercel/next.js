import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    useCache: true,
    rootParams: true,
  },
}

export default nextConfig
