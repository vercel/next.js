module.exports = {
  i18n: {
    locales: ['en', 'nl'],
    defaultLocale: 'en',
    domains: [
      {
        domain: 'example.nl',
        defaultLocale: 'nl',
      },
    ],
  },
  experimental: {
    clientRouterFilter: true,
    clientRouterFilterRedirects: true,
  },
  redirects() {
    return [
      {
        source: '/to-new',
        destination: '/new',
        permanent: false,
      },
    ]
  },
}
