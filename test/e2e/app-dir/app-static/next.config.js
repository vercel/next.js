/** @type {import('next').NextConfig} */
module.exports = {
  logging: {
    fetches: {},
  },
  experimental: {
    incrementalCacheHandlerPath: process.env.CUSTOM_CACHE_HANDLER,
  },

  rewrites: async () => {
    return {
      // beforeFiles: [ { source: '/assets/:path*', destination: '/:path*' } ],
      afterFiles: [
        {
          source: '/rewritten-use-search-params',
          destination: '/hooks/use-search-params/static-bailout',
        },
        {
          source: '/rewritten-use-pathname',
          destination: '/hooks/use-pathname/slug',
        },
      ],
    }
  },
}
