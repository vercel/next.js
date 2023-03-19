module.exports = {
  experimental: {
    appDir: true,
    incrementalCacheHandlerPath: process.env.CUSTOM_CACHE_HANDLER
      ? require.resolve('./cache-handler.js')
      : undefined,
  },
  // assetPrefix: '/assets',
  rewrites: async () => {
    return {
      // beforeFiles: [ { source: '/assets/:path*', destination: '/:path*' } ],
      afterFiles: [
        {
          source: '/rewritten-to-dashboard',
          destination: '/dashboard',
        },
        {
          source: '/rewritten-use-search-params',
          destination: '/hooks/use-search-params',
        },
        {
          source: '/rewritten-use-pathname',
          destination: '/hooks/use-pathname/slug',
        },
      ],
    }
  },
}
