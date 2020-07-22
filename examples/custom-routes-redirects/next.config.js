module.exports = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/under-construction',
        permanent: true,
      },
    ]
  },
}
