const { BLOG_URL } = process.env

module.exports = {
  rewrites() {
    return [
      {
        source: '/blog/_next/:path*',
        destination: `${BLOG_URL}/_next/:path*`,
      },
      {
        source: '/blog',
        destination: `${BLOG_URL}/blog`,
      },
      {
        source: '/blog/:path*',
        destination: `${BLOG_URL}/blog/:path*`,
      },
    ]
  },
}
