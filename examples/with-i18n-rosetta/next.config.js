module.exports = {
  experimental: {
    pages404: true,
    polyfillsOptimization: true,
    redirects() {
      return [
        {
          source: '/',
          permanent: true,
          destination: '/en',
        },
      ]
    },
  },
}
