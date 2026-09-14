module.exports = {
  rewrites() {
    // add a rewrite so the code isn't dead-code eliminated
    return [
      {
        source: '/some-rewrite',
        destination: '/',
      },
    ]
  },
}
