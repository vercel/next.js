import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    paramMatching: true,
    optimisticRouting: true,
    // The legacy fixture covers inlining; exercise hint collection without it.
    prefetchInlining: false,
  },
}

export default nextConfig
