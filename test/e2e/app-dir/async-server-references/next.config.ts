import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    useCache: true,
    clientSegmentCache: true,
  },
}

export default nextConfig
