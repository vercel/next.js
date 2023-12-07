module.exports = {
  output: 'export',
  exportPathMap() {
    return {
      '/': { page: '/hello', query: { first: 'second' } },
      '/amp': { page: '/amp' },
      '/ssr': { page: '/ssr', query: { another: 'one' } },
    }
  },
}
