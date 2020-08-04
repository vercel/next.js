module.exports = {
  rewrites() {
    return [
      {
        source: '/about',
        destination: '/lang/en/about',
      },
      {
        source: '/blocked-create',
        destination: '/blocking-fallback/blocked-create',
      },
    ]
  },
}
