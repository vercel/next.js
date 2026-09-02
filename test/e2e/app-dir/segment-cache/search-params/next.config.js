/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    // TODO: This test asserts on the pre-`optimisticRouting` prefetch and
    // search-param-rewrite behavior. Pin the fixture to the old default
    // until the test is updated (or until the flag is removed).
    optimisticRouting: false,
  },
}

module.exports = nextConfig
