module.exports = {
  experimental: {
    rewrites() {
      return [
        {
          source: '/:hello*',
          destination: '/:hello',
        },
      ]
    },
  },
}
