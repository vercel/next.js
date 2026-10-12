/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Pin every dimension except the one under test.
  cacheComponents: true,
  experimental: {
    // Keyed on test axis A (see scripts/run-jest.sh) so the suite covers
    // both states. Enabled by default — a plain run exercises the fork with
    // no special env — and disabled on axis A, where the
    // `@gate concurrentRouterQueue` tests assert the sequential router is
    // back in charge.
    concurrentRouterQueue: process.env.__NEXT_TEST_AXIS !== 'A',
  },
}

module.exports = nextConfig
