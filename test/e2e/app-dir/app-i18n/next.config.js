/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: { appDir: true },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'id', 'my'],
  },
}

module.exports = nextConfig
