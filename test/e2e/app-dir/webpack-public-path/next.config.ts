import type { NextConfig } from 'next'

const assetPrefix = process.env.TEST_ASSET_PREFIX ?? ''

const nextConfig: NextConfig = {
  assetPrefix,
  async rewrites() {
    return [
      {
        source: '/webpack-public-path-first/:path*',
        destination: '/_next/:path*',
      },
      {
        source: '/webpack-public-path-second/:path*',
        destination: '/_next/:path*',
      },
    ]
  },
}

export default nextConfig
