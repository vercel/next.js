/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // The one dimension under test. Enabled by default, so a plain run exercises
  // Cache Components; axis A (the `--experimental` run) covers the off state.
  // Both states render the markers per request, so every test asserts the same
  // thing in each.
  cacheComponents: process.env.__NEXT_TEST_AXIS !== 'A',
}

module.exports = nextConfig
