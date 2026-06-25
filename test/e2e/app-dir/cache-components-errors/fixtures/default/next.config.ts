import { NextConfig } from 'next'

const partialPrefetching = !!process.env.__NEXT_PARTIAL_PREFETCHING

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching,
  experimental: {
    instantInsights: {
      validationLevel: 'manual-warning',
    },
  },
}

export default nextConfig
