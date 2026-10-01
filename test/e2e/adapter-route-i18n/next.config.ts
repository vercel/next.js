import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  basePath: '/base',
  cacheComponents: false,
  partialPrefetching: false,
  experimental: { cachedNavigations: false },
  i18n: { locales: ['en', 'fr'], defaultLocale: 'en', localeDetection: false },
}

export default nextConfig
