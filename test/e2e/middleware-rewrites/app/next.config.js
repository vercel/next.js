module.exports = {
  i18n: {
    locales: ['ja', 'en', 'fr', 'es'],
    defaultLocale: 'en',
  },
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/config-rewrite-1',
          destination: '/ab-test/a',
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}
