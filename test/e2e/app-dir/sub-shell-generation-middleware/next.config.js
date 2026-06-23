/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    // TODO(appShells): migrate this test to the two-phase (app shell +
    // per-page data) prefetch behavior, then remove this override. See #94516.
    appShells: false,
    prefetchInlining: false,
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
