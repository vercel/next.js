module.exports = {
  experimental: {
    appDir: true,
    serverComponents: true,
    legacyBrowsers: false,
    browsersListForSwc: true,
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
