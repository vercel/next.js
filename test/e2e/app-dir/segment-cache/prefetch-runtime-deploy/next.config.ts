import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    // Mirror vercel/v0's chat app flags.
    cachedNavigations: 'allow-runtime',
    optimisticRouting: false,
  },
}

export default nextConfig
