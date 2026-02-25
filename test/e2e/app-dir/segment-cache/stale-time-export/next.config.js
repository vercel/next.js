/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 10,
      static: 30,
    },
  },
}

module.exports = nextConfig
