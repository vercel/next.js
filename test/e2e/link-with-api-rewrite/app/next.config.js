/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/:path(.*)',
          has: [{ type: 'query', key: 'json', value: 'true' }],
          destination: '/api/json?from=/:path',
        },
      ],
    }
  },
}

module.exports = nextConfig
