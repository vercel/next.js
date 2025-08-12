module.exports = {
  generateBuildId() {
    return 'testing-build-id'
  },
  i18n: {
    locales: ['en', 'fr', 'nl'],
    defaultLocale: 'en',
    domains: [],
  },
  rewrites() {
    return [
      {
        source: '/sitemap.xml',
        destination: '/api/hello',
      },
      {
        source: '/to-dynamic-api',
        destination: '/api/blog/second',
      },
      {
        source: '/test-rewrite-params/:someParam',
        destination: '/api/hello',
      },
      {
        source: '/api/non-existent',
        destination: '/another',
      },
      {
        source: '/api/also-non-existent',
        destination: 'https://example.vercel.sh',
      },
    ]
  },
}
