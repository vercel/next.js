module.exports = {
  experimental: {
    appDir: true,
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
