/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/:path((?!sitemap.xml$).*)',
        has: [
          {
            type: 'host',
            value: '(?<subdomain>[^.]+)\\.(?<domain>.*)',
          },
        ],
        destination: '/:subdomain/:path*',
      },
    ]
  },
}

module.exports = nextConfig
