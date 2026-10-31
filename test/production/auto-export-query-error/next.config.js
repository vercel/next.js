module.exports = {
  output: 'export',
  exportPathMap() {
    return {
      '/': { page: '/hello', query: { first: 'second' } },
      '/ssr': { page: '/ssr', query: { another: 'one' } },
    }
  },
}
