/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    ledgers: process.env.__NEXT_TEST_AXIS !== 'A',
    staleTimes: {
      dynamic: 30,
    },
  },
}

module.exports = nextConfig
