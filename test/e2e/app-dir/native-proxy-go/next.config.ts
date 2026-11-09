import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    goProxy: { matcher: ['/native-proxy/:path*'] },
  },
}

export default nextConfig
