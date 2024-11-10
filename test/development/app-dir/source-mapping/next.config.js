/**
 * @type {import('next').NextConfig}
 */

const nextConfig = {
  assetPrefix: '/assets/', // intentional trailing slash to ensure we handle this as well
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
