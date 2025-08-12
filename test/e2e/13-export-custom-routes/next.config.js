module.exports = {
  output: 'export',
  generateBuildId() {
    return 'testing-build-id'
  },
  exportPathMap: (d) => d,
  async rewrites() {
    return [
      {
        source: '/first',
        destination: '/',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/second',
        destination: '/about',
        permanent: false,
      },
    ]
  },
}
