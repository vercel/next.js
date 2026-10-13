import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  experimental: { goRoutes: true },
  async rewrites() {
    return [{ source: '/rewritten/:id', destination: '/native/:id' }]
  },
}
export default nextConfig
