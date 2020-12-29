module.exports = {
  async redirects() {
    return [
      {
        source: '/feedback/(?!general)',
        destination: '/feedback/general',
        permanent: false,
      },
      { source: '/learning/?', destination: '/learning', permanent: true },
    ]
  },
}
