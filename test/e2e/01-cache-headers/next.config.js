module.exports = {
  async headers() {
    return [
      {
        source: '/_next/static/testing-build-id/_buildManifest.js',
        headers: [
          {
            key: 'cache-control',
            value: 'no-cache',
          },
        ],
      },
    ]
  },
  generateBuildId() {
    return 'testing-build-id'
  },
}
