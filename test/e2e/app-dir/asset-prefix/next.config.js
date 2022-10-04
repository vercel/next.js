module.exports = {
  experimental: {
    legacyBrowsers: false,
    browsersListForSwc: true,
  },
  assetPrefix: '/assets',
  rewrites() {
    return {
      beforeFiles: [{ source: '/assets/:path*', destination: '/:path*' }],
    }
  },
}
