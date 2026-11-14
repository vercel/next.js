module.exports = {
  async redirects() {
    return [
      {
        source: '/:type/details',
        destination: '/',
        permanent: false,
      },
    ]
  },
}
