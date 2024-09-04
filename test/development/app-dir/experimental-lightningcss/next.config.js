/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    useLightningcss: true,
    turbo: {
      useSwcCss: false,
    },
  },
}

module.exports = nextConfig
