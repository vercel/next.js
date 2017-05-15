module.exports = {
  exportPathMap: function () {
    return {
      '/': { page: '/' },
      '/about': { page: '/about' },
      '/counter': { page: '/counter' },
      '/dynamic-imports': { page: '/dynamic-imports' },
      '/dynamic': { page: '/dynamic', query: { text: 'cool dynamic text' } },
      '/dynamic/one': { page: '/dynamic', query: { text: 'next export is nice' } },
      '/dynamic/two': { page: '/dynamic', query: { text: 'zeit is awesome' } }
    }
  }
}
