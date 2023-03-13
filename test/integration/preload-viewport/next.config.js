module.exports = {
  generateBuildId() {
    return 'test-build'
  },
  rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/ssg/dynamic/one',
      },
    ]
  },
}
