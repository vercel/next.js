module.exports = {
  output: 'export',
  exportPathMap() {
    return {
      '/regression/jeff-is-cool': { page: '/regression/[slug]' },
    }
  },
}
