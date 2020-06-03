module.exports = {
  experimental: {
    rewrites() {
      return [
        {
          source: '/about',
          destination: '/lang/en/about',
        },
      ]
    },
  },
}
