/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Set here rather than left to the test matrix, because the routing entries
  // under test only exist with Cache Components: a prefetch segment route is
  // emitted from the segment paths of a prerender, and a build without Cache
  // Components produces none.
  cacheComponents: true,
  experimental: {
    variants: true,
  },
  // The adapter is the consumer of the routing table this suite asserts on, so
  // the build needs one. This stub records the context and produces nothing to
  // serve, which a production-type suite never needs: deploy runs select
  // `test/e2e` alone.
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
