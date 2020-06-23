module.exports = {
  experimental: {
    optionalCatchAll: true,
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
