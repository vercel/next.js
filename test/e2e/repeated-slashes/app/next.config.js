module.exports = {
  redirects() {
    return [
      {
        source: '/redirect-forward-slashes',
        destination: '/test//google.com',
        permanent: false,
      },
      {
        source: '/redirect-back-slashes',
        destination: '/test\\/google.com',
        permanent: false,
      },
    ]
  },
}
