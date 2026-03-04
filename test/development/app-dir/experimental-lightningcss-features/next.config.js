/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useLightningcss: true,
    lightningCssFeatures: {
      include: ['light-dark'],
    },
  },
}

module.exports = nextConfig
