module.exports = {
  basePath: '/base',
  async rewrites() {
    return [
      {
        source: '/outsideBasePath',
        destination: 'https://example.vercel.sh/',
        basePath: false,
      },
    ]
  },
}
