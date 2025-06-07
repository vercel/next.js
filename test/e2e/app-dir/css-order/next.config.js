/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    cssChunking: 'strict',
    turbopackMinify: false,
  },
}

module.exports = nextConfig
