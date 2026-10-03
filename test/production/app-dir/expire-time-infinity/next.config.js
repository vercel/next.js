/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // The documented way to say "never expire".
  expireTime: Infinity,
  experimental: {
    staleTimes: {
      dynamic: Infinity,
      static: Infinity,
    },
  },
}

module.exports = nextConfig
