import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: false,
  experimental: {
    paramMatching: true,
  },
}

export default nextConfig
