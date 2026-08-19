/**
 * @type {import('next').NextConfig}
 */
const deploymentHost =
  process.env.NEXT_TEST_DEPLOYMENT_HOST ||
  (process.env.VERCEL === '1' ? process.env.VERCEL_URL : undefined)

const nextConfig = {
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
        domain: deploymentHost || 'nl.example.local',
        defaultLocale: 'nl-NL',
      },
    ],
  },
}

module.exports = nextConfig
