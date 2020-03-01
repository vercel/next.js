module.exports = {
  exportPathMap() {
    return {
      '/regression/jeff-is-cool': { page: '/regression/[slug]' },
    }
  },
}
