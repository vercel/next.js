/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useCache: true,
  },
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source: '/:first/~/overview/:path*',
          destination: '/404',
        },
        {
          source: '/:first',
          has: [
            {
              type: 'cookie',
              key: 'overview-param',
              value: 'grid',
            },
          ],
          destination: '/:first/~/overview/grid',
        },
      ],
    }
  },
}

module.exports = nextConfig
