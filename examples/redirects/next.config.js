module.exports = {
  async redirects() {
    return [
      // Path Matching - will match `/post/a` but not `/post/a/b`
      // Redirects to /news and forwards the matched parameters
      {
        source: '/old-blog/:slug',
        destination: '/news/:slug',
        permanent: true,
      },
    ]
  },
}
