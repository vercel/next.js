module.exports = {
  exportPathMap: function () {
    return {
      '/': { page: '/' },
      '/about': { page: '/about' },
      '/button-link': { page: '/button-link' },
      '/get-initial-props-with-no-query': { page: '/get-initial-props-with-no-query' },
      '/counter': { page: '/counter' },
      '/dynamic-imports': { page: '/dynamic-imports' },
      '/dynamic': { page: '/dynamic', query: { text: 'cool dynamic text' } },
      '/dynamic/one': { page: '/dynamic', query: { text: 'next export is nice' } },
      '/dynamic/two': { page: '/dynamic', query: { text: 'zeit is awesome' } }
    }
  }
}
