import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pages Router i18n configuration with domain-based routing
  // This configuration triggers the bug where App Router routes return 404
  i18n: {
    locales: ['en-US', 'nl-NL'],
    defaultLocale: 'en-US',
    localeDetection: false,
    domains: [
      {
        domain: 'en.example.local',
        defaultLocale: 'en-US',
      },
      {
        domain: 'nl.example.local',
        defaultLocale: 'nl-NL',
      },
    ],
  },
}

export default nextConfig
