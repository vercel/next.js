module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  redirects() {
    return [
      {
        source: '/redirect-me',
        destination: '/from-next-config',
        permanent: false,
      },
    ]
  },
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/rewrite-before-files',
          destination: '/somewhere',
        },
      ],
      afterFiles: [
        {
          source: '/after-file-rewrite',
          destination: '/about',
        },
        {
          source: '/after-file-rewrite-auto-static',
          destination: '/home/a',
        },
        {
          source: '/after-file-rewrite-auto-static-dynamic',
          destination: '/dynamic/first',
        },
      ],
    }
  },
}
