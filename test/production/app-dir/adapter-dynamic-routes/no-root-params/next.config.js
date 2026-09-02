/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // The option is off by default. These snapshots pin the collapsed route
  // table, so the fixture enables it.
  experimental: { collapseAdapterRoutes: true },
  // A build ID that reaches an entry changes the snapshot on every run. A fixed
  // build ID keeps the snapshot independent of the run.
  generateBuildId: () => 'test-build-id',
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
