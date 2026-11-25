import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: process.env.PARTIAL_PREFETCHING === '1',
}

export default nextConfig
