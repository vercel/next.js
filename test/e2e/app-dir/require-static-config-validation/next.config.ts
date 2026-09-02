import { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    prerenderEarlyExit: false,
  },
}

export default nextConfig
