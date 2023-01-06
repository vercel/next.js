module.exports = {
  trailingSlash: true,
  async rewrites() {
    return [{ source: '/country/', destination: '/' }]
  },
}
