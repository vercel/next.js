import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
  },
}

export default nextConfig
