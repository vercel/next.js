/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // The Cache Components cases in this suite (run with __NEXT_CACHE_COMPONENTS)
  // exercise the navigation-triggered upgrade of a fallback shell into a
  // concrete route shell, which only runs when Partial Prefetching is enabled.
  // Enable it only in that mode: `partialPrefetching` requires Cache Components,
  // so setting it unconditionally would fail the build in the non-Cache
  // Components mode this fixture also runs in.
  partialPrefetching: process.env.__NEXT_CACHE_COMPONENTS === 'true',
  experimental: {
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
