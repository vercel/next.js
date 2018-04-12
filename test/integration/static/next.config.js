const {PHASE_DEVELOPMENT_SERVER} = require('next/constants')

module.exports = (phase) => {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    exportPathMap: function () {
      return {
        '/': { page: '/' },
        '/about': { page: '/about' },
        '/asset': { page: '/asset' },
        '/button-link': { page: '/button-link' },
        '/get-initial-props-with-no-query': { page: '/get-initial-props-with-no-query' },
        '/counter': { page: '/counter' },
        '/dynamic-imports': { page: '/dynamic-imports' },
        '/dynamic': { page: '/dynamic', query: { text: 'cool dynamic text' } },
        '/dynamic/one': { page: '/dynamic', query: { text: 'next export is nice' } },
        '/dynamic/two': { page: '/dynamic', query: { text: 'zeit is awesome' } },
        '/file-name.md': { page: '/dynamic', query: { text: 'this file has an extension' } }
      }
    }
  }
}
