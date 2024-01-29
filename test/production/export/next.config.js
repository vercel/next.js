module.exports = (phase) => {
  return {
    output: 'export',
    distDir: 'out',
    publicRuntimeConfig: {
      foo: 'foo',
    },
    serverRuntimeConfig: {
      bar: 'bar',
    },
    trailingSlash: true,
    exportPathMap: function () {
      return {
        '/': { page: '/' },
        '/index': { page: '/' },
        '/about': { page: '/about' },
        '/button-link': { page: '/button-link' },
        '/hash-link': { page: '/hash-link' },
        '/empty-hash-link': { page: '/empty-hash-link' },
        '/empty-query-link': { page: '/empty-query-link' },
        '/get-initial-props-with-no-query': {
          page: '/get-initial-props-with-no-query',
        },
        '/counter': { page: '/counter' },
        '/dynamic-imports': { page: '/dynamic-imports' },
        '/dynamic': { page: '/dynamic', query: { text: 'cool dynamic text' } },
        '/dynamic/one': {
          page: '/dynamic',
          query: { text: 'next export is nice' },
        },
        '/dynamic/two': {
          page: '/dynamic',
          query: { text: 'Vercel is awesome' },
        },
        '/file-name.md': {
          page: '/dynamic',
          query: { text: 'this file has an extension' },
        },
        '/query': { page: '/query', query: { a: 'blue' } },
        '/query-update': { page: '/query-update', query: { a: 'blue' } },
        // API route
        '/blog/nextjs/comment/test': { page: '/blog/[post]/comment/[id]' },
      }
    }, // end exportPathMap
  }
}
