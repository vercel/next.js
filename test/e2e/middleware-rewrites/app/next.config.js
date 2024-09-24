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
          source: '/article/:slug*',
          destination: '/detail/:slug*',
        },
        {
          source: '/afterfiles-rewrite',
          destination: '/ab-test/b',
        },
        {
          source: '/afterfiles-rewrite-ssg',
          destination: '/fallback-true-blog/first',
        },
        {
          source: '/config-rewrite-to-dynamic-static/:rewriteSlug',
          destination: '/ssg',
        },
        {
          source: '/external-rewrite-body',
          destination:
            'https://next-data-api-endpoint.vercel.app/api/echo-body',
        },
      ],
      fallback: [],
    }
  },
}
