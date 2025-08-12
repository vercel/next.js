module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  rewrites() {
    return {
      fallback: [
        {
          source: '/blog/:path',
          destination: '/hello.txt',
        },
      ],
    }
  },
}
