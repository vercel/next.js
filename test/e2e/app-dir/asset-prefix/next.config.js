module.exports = {
  assetPrefix: '/assets',
  rewrites() {
    return {
      beforeFiles: [{ source: '/assets/:path*', destination: '/:path*' }],
    }
  },
}
