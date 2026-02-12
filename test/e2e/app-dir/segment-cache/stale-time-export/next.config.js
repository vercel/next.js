/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Baseline config used for stale-time assertions.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
  },
}

module.exports = nextConfig
