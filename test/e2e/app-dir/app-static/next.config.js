/** @type {import('next').NextConfig} */
module.exports = {
  logging: {
    fetches: {},
  },
  experimental: {
    cacheLife: {
      expireNow: {
        stale: 0,
        expire: 0,
        revalidate: 0,
      },
    },
  },
  cacheHandler: process.env.CUSTOM_CACHE_HANDLER
    ? require.resolve('./cache-handler.js')
    : undefined,

  rewrites: async () => {
    return {
      // beforeFiles: [ { source: '/assets/:path*', destination: '/:path*' } ],
      afterFiles: [
        {
          source: '/rewritten-use-search-params',
          destination: '/hooks/use-search-params/with-suspense',
        },
        {
          source: '/rewritten-use-pathname',
          destination: '/hooks/use-pathname/slug',
        },
      ],
    }
  },
}
