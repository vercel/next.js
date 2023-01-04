module.exports = {
  experimental: {
    appDir: true,
    fetchCache: true,
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
