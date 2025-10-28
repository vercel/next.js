import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: { clientSegmentCache: true },
  productionBrowserSourceMaps: true,
}

export default nextConfig
