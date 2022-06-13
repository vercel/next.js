module.exports = {
  i18n: {
    locales: ['ja', 'en', 'fr', 'es'],
    defaultLocale: 'en',
  },
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/beforefiles-rewrite',
          destination: '/ab-test/a',
        },
      ],
      afterFiles: [
        {
          source: '/afterfiles-rewrite',
          destination: '/ab-test/b',
        },
      ],
      fallback: [],
    }
  },
}
