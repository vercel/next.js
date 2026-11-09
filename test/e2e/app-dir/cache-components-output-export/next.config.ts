import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  cacheComponents: true,
  partialPrefetching: false,
}

export default nextConfig
