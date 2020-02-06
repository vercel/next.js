module.exports = {
  experimental: {
    rewrites() {
      return [
        {
          source: '/docs/:path*',
          destination: '/:path*',
        },
      ]
    },
  },
}
