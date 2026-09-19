/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    ledgers: process.env.__NEXT_TEST_AXIS !== 'A',
    optimisticRouting: true,
    prefetchInlining: false,
    varyParams: true,
  },
}

module.exports = nextConfig
