module.exports = {
  basePath: '/base',
  async rewrites() {
    return [
      {
        source: '/external',
        destination: 'https://example.vercel.sh',
        basePath: false,
      },
    ]
  },
}
