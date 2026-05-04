module.exports = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/rewrite-before-files',
          destination: '/somewhere',
        },
      ],
      afterFiles: [],
    }
  },
}
