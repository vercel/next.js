module.exports = {
  experimental: {
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
