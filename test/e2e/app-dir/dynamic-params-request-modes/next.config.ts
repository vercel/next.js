import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: false,
  async rewrites() {
    return [{ source: '/alias/:slug', destination: '/products/:slug' }]
  },
}

export default nextConfig
