/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  cacheComponents: true,
  cacheHandlers: {
    default: require.resolve('./handler.js'),
  },
  experimental: {
    // Disable startup preloading so the first request loads this fixture's
    // handler before rendering. Preloading initializes the registry before its
    // custom-handler import finishes. A concurrent request can then use the
    // built-in handler and bypass the delayed write that this test needs.
    //
    // TODO: Make concurrent custom-handler initialization await registration.
    // Then remove this fixture's `preloadEntriesOnStart: false` workaround.
    preloadEntriesOnStart: false,
  },
}

module.exports = nextConfig
