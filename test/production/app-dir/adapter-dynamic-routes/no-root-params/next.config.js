/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // A build ID that reaches an entry changes the snapshot on every run. A fixed
  // build ID keeps the snapshot independent of the run.
  generateBuildId: () => 'test-build-id',
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
