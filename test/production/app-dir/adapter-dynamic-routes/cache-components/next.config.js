/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  // The option is off by default. These snapshots pin the collapsed route
  // table, so the fixture enables it.
  experimental: { collapseAdapterRoutes: true },
  // A build ID that reaches an entry changes the snapshot on every run. A
  // fixed build ID keeps the snapshot independent of the run.
  generateBuildId: () => 'test-build-id',
  adapterPath: require.resolve('./my-adapter.mjs'),
}

// `dynamic-routes-base-path.test.ts` sets this variable and builds the fixture a
// second time under a base path. The value arrives through `nextTestSetup`'s
// `env`, so it reaches a local build and a deployed build alike.
if (process.env.BASE_PATH) {
  nextConfig.basePath = process.env.BASE_PATH
}

module.exports = nextConfig
