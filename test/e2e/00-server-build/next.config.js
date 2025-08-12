module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  experimental: {
    nftTracing: true,
  },
  redirects() {
    return [
      {
        source: '/build-time-not-found/:path*',
        destination: '/somewhere-else',
        permanent: false,
      },
    ]
  },
}
