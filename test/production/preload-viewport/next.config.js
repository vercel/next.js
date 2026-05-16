module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite-me',
        destination: '/ssg/dynamic/one',
      },
    ]
  },
}
