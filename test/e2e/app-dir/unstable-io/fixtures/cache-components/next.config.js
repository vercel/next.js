/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    unstableIO: true,
  },
}

module.exports = nextConfig
