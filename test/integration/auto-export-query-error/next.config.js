module.exports = {
  // target: 'serverless',
  exportPathMap() {
    return {
      '/': { page: '/hello', query: { first: 'second' } },
      '/amp': { page: '/amp' },
      '/ssr': { page: '/ssr' },
    }
  },
}
