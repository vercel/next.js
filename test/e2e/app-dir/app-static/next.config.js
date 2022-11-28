module.exports = {
  experimental: {
    appDir: true,
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
          destination:
            '/hooks/use-search-params/slug?first=value&second=other%20value&third',
        },
        {
          source: '/rewritten-use-pathname',
          destination: '/hooks/use-pathname/slug',
        },
      ],
    }
  },
}
