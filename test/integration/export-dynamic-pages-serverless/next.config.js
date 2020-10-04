module.exports = {
  target: 'serverless',
  exportPathMap() {
    return {
      '/regression/jeff-is-cool': { page: '/regression/[slug]' },
    }
  },
}
