import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  compress: false,
  cacheComponents: false,
  poweredByHeader: false,
  experimental: { authInterrupts: true },
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, max-age=17' }],
      },
    ]
  },
}

export default nextConfig
