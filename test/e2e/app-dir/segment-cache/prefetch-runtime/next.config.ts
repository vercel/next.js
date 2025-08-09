import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { cacheComponents: true, clientSegmentCache: true },
  productionBrowserSourceMaps: true,
}

export default nextConfig
