import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: {
    // Keep this legacy fixture independent of the CC CI job's defaults.
    cachedNavigations: false,
  },
  async rewrites() {
    return [{ source: '/alias/:slug', destination: '/products/:slug' }]
  },
}

export default nextConfig
