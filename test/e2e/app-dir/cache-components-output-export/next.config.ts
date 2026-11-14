import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  cacheComponents: true,
  partialPrefetching: false,
  experimental: { optimisticRouting: true },
}

export default nextConfig
