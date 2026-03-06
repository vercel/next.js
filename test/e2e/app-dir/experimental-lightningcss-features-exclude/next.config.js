/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useLightningcss: true,
    lightningCssFeatures: {
      exclude: ['light-dark'],
    },
  },
}

module.exports = nextConfig
