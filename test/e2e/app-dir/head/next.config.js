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
      ],
    }
  },
}
