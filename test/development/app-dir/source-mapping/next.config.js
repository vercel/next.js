/**
 * @type {import('next').NextConfig}
 */

const nextConfig = {
  assetPrefix: '/assets',
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/assets/:path*',
          destination: '/:path*',
        },
      ],
    }
  },
  experimental: {
    ppr: true,
  },
}

module.exports = nextConfig
