module.exports = {
  // target
  rewrites() {
    return [
      {
        source: '/some-rewrite/:item',
        destination: '/blog/post-:item',
      },
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
