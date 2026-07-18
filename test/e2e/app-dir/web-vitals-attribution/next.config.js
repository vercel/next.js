/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    webVitalsAttribution: ['FCP'],
  },
}

module.exports = nextConfig
