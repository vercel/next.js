/**
 * @type import('next').NextConfig
 */
module.exports = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  experimental: {
    clientRouterFilterRedirects: true,
  },
  async redirects() {
    return [
      {
        // French-only redirect: the English `/legacy` stays a pages route
        source: '/fr/legacy',
        destination: '/fr',
        permanent: false,
        locale: false,
      },
    ]
  },
}
