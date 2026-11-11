import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    goRoutes: true,
    goProxy: { matcher: ['/native-proxy/:path*'] },
  },
}

export default nextConfig
