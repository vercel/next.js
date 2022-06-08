module.exports = {
  i18n: {
    locales: ['en', 'fr', 'nl'],
    defaultLocale: 'en',
  },
  rewrites() {
    return [
      {
        source: '/rewrite-1',
        destination: '/ssr-page',
      },
      {
        source: '/rewrite-2',
        destination: '/about/a',
      },
    ]
  },
}
