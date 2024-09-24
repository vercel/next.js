/** @type {import('next').NextConfig} */
module.exports = {
  logging: {
    fetches: {},
  },
  cacheHandler: process.env.CUSTOM_CACHE_HANDLER,

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
