/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    sri: {
      algorithm: 'sha256',
    },
  },
}

module.exports = nextConfig
