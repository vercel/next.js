/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
  },
}

module.exports = nextConfig
