import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: { paramMatching: true, optimisticRouting: true },
}

export default nextConfig
