module.exports = {
  output: 'export',
  exportPathMap() {
    return {
      '/first': { page: '/[slug]' },
    }
  },
}
