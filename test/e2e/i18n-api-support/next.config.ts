/** @type {import('next').NextConfig} */
module.exports = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'en',
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: '/api/:path*',
          destination: 'https://example.vercel.sh/',
        },
      ],
    }
  },
}
