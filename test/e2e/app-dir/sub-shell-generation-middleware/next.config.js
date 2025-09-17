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
          missing: [
            // Ensure that during static page revalidations, we don't consider
            // this rule. The presence of this header indicates that the request
            // is being revalidated by Vercel.
            {
              type: 'header',
              key: 'x-now-route-matches',
            },
          ],
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
