/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // This value is explicit, not omitted. CI exports
  // `__NEXT_CACHE_COMPONENTS=true` for the Cache Components matrices, and
  // that variable overrides a config that omits the field. An omitted field
  // would let that matrix turn Cache Components on for this fixture.
  cacheComponents: false,
  // The option is off by default. These snapshots pin the collapsed route
  // table, so the fixture enables it.
  experimental: { collapseAdapterRoutes: true },
  // The source regex of a pages router data route holds the build ID. A fixed
  // build ID keeps the snapshot independent of the run.
  generateBuildId: () => 'test-build-id',
  adapterPath: require.resolve('./my-adapter.mjs'),
}

module.exports = nextConfig
