import type { NextConfig } from 'next'

const partialPrefetching = !!process.env.__NEXT_PARTIAL_PREFETCHING

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching,
  productionBrowserSourceMaps: true,
  experimental: {
    prerenderEarlyExit: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
